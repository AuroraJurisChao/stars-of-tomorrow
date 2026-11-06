import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { createRouter, publicMutation, publicQuery } from "./middleware";
import { createSession, destroySession, getCurrentMember, requireMember, toSafeMember } from "./auth";
import { getDb } from "./queries/connection";
import { auditLogs, districtMembers, districts, loginAttempts, members, sessions } from "@db/schema";
import { hashPassword, verifyPassword } from "./security";
import { DISTRICTS, sortByPinyin, validateNewPassword } from "@contracts/constants";

function attemptKey(ctx: { req: Request }, districtId: string, subject: string) {
  const ip = ctx.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return createHash("sha256").update(`${ip}:${districtId}:${subject}`).digest("hex");
}

async function currentAttempt(key: string) {
  const rows = await getDb().select().from(loginAttempts).where(eq(loginAttempts.attemptKey, key)).limit(1);
  const attempt = rows[0];
  if (attempt?.lockedUntil && attempt.lockedUntil > new Date()) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "尝试次数较多，请稍后再试" });
  }
  return attempt;
}

async function recordFailure(key: string, attempt: typeof loginAttempts.$inferSelect | undefined) {
  const failures = (attempt?.failures ?? 0) + 1;
  const lockedUntil = failures >= 5 ? new Date(Date.now() + 5 * 60 * 1000) : null;
  await getDb().insert(loginAttempts).values({ attemptKey: key, failures, lockedUntil }).onDuplicateKeyUpdate({ set: { failures, lockedUntil } });
}

const passwordChangeInput = z.object({
  currentPassword: z.string().min(1).max(64),
  newPassword: z.string().min(1).max(64),
  confirmPassword: z.string().min(1).max(64),
}).superRefine((input, context) => {
  const strengthError = validateNewPassword(input.newPassword);
  if (strengthError) context.addIssue({ code: "custom", message: strengthError, path: ["newPassword"] });
  if (input.newPassword !== input.confirmPassword) {
    context.addIssue({ code: "custom", message: "两次输入的新密码不一致", path: ["confirmPassword"] });
  }
  if (input.newPassword === input.currentPassword) {
    context.addIssue({ code: "custom", message: "新密码不能与当前密码相同", path: ["newPassword"] });
  }
});

export const authRouter = createRouter({
  bootstrap: publicQuery.input(z.object({ districtId: z.string().trim().min(1).max(64).optional() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const publicDistricts = await db.select({ id: districts.id, name: districts.name }).from(districts)
      .where(inArray(districts.id, [...DISTRICTS.map((district) => district.id)]))
      .orderBy(districts.sortOrder);
    const viewer = input.districtId ? await getCurrentMember(ctx) : null;
    const selectedDistrict = publicDistricts.find((district) => district.id === input.districtId)
      ?? (viewer && viewer.districtId === input.districtId ? { id: viewer.districtId, name: viewer.districtName } : null);
    if (!input.districtId || !selectedDistrict) {
      return { districts: publicDistricts, district: null, members: [], organizerName: null };
    }
    const rows = await db.select({
      id: members.id,
      name: members.name,
      pinyinKey: districtMembers.pinyinKey,
      role: members.role,
    }).from(districtMembers)
      .innerJoin(members, eq(members.id, districtMembers.memberId))
      .where(and(eq(districtMembers.districtId, input.districtId), eq(districtMembers.active, true), eq(members.active, true)));
    const regularMembers = sortByPinyin(rows.filter((row) => row.role === "member").map((row) => ({ id: row.id, name: row.name, pinyinKey: row.pinyinKey })));
    const organizer = rows.find((row) => row.role === "organizer");
    return {
      districts: publicDistricts,
      district: selectedDistrict,
      members: regularMembers,
      organizerName: organizer?.name ?? null,
    };
  }),

  me: publicQuery.query(async ({ ctx }) => {
    const member = await getCurrentMember(ctx);
    return member ? toSafeMember(member) : null;
  }),

  login: publicMutation
    .input(z.object({ districtId: z.string().trim().min(1).max(64), name: z.string().trim().min(1).max(32), password: z.string().min(1).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const key = attemptKey(ctx, input.districtId, `login:${input.name}`);
      const attempt = await currentAttempt(key);
      const rows = await db.select({
        id: members.id,
        name: members.name,
        role: members.role,
        passwordHash: members.passwordHash,
        passwordSalt: members.passwordSalt,
        active: members.active,
        relationshipActive: districtMembers.active,
        districtEnabled: districts.enabled,
        districtName: districts.name,
        pinyinKey: districtMembers.pinyinKey,
      }).from(members)
        .innerJoin(districtMembers, eq(districtMembers.memberId, members.id))
        .innerJoin(districts, and(eq(districts.id, districtMembers.districtId), eq(districts.id, input.districtId)))
        .where(and(eq(members.name, input.name), eq(districtMembers.districtId, input.districtId)))
        .limit(1);
      const account = rows[0];
      const valid = account?.active && account.relationshipActive && account.districtEnabled && await verifyPassword(input.password, account.passwordSalt, account.passwordHash);
      if (!account || !valid) {
        await recordFailure(key, attempt);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "选区、姓名或密码不正确" });
      }
      if (attempt) await db.delete(loginAttempts).where(eq(loginAttempts.id, attempt.id));
      await createSession(ctx, account.id, input.districtId);
      return {
        id: account.id,
        name: account.name,
        pinyinKey: account.pinyinKey,
        role: account.role,
        districtId: input.districtId,
        districtName: account.districtName,
      };
    }),

  changePassword: publicMutation.input(passwordChangeInput).mutation(async ({ ctx, input }) => {
    const me = await requireMember(ctx);
    const db = getDb();
    const key = attemptKey(ctx, me.districtId, `change-password:${me.id}`);
    const attempt = await currentAttempt(key);
    const account = (await db.select().from(members).where(eq(members.id, me.id)).limit(1))[0];
    if (!account || !await verifyPassword(input.currentPassword, account.passwordSalt, account.passwordHash)) {
      await recordFailure(key, attempt);
      throw new TRPCError({ code: "UNAUTHORIZED", message: "当前密码不正确" });
    }
    const { hash, salt } = await hashPassword(input.newPassword);
    await db.transaction(async (tx) => {
      await tx.update(members).set({ passwordHash: hash, passwordSalt: salt }).where(eq(members.id, me.id));
      await tx.delete(sessions).where(and(eq(sessions.memberId, me.id), ne(sessions.id, me.sessionId)));
      await tx.insert(auditLogs).values({ districtId: me.districtId, actorId: me.id, action: "change-password", details: {} });
    });
    if (attempt) await db.delete(loginAttempts).where(eq(loginAttempts.id, attempt.id));
    return { ok: true };
  }),

  logout: publicMutation.mutation(async ({ ctx }) => {
    await destroySession(ctx);
    return { ok: true };
  }),
});
