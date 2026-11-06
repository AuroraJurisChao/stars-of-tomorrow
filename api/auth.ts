import { TRPCError } from "@trpc/server";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { districtMembers, districts, members, sessions } from "@db/schema";
import type { TrpcContext } from "./context";
import { createSessionToken, hashSessionToken } from "./security";

export const SESSION_COOKIE = "mx_session";
export const SESSION_SECONDS = 8 * 60 * 60;

export type SafeMember = {
  id: number;
  name: string;
  pinyinKey: string;
  role: "member" | "organizer";
  districtId: string;
  districtName: string;
};

export type AuthMember = SafeMember & { sessionId: number };

export function toSafeMember(member: AuthMember): SafeMember {
  return {
    id: member.id,
    name: member.name,
    pinyinKey: member.pinyinKey,
    role: member.role,
    districtId: member.districtId,
    districtName: member.districtName,
  };
}

function parseCookies(header: string | null) {
  const result = new Map<string, string>();
  if (!header) return result;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0) result.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()));
  }
  return result;
}

export function assertSafeOrigin(ctx: TrpcContext) {
  const origin = ctx.req.headers.get("origin");
  const fetchSite = ctx.req.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new TRPCError({ code: "FORBIDDEN", message: "请求来源未通过安全校验" });
  }
  if (!origin) return;
  if (origin === "null") {
    if (fetchSite !== "same-origin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "请求来源未通过安全校验" });
    }
    return;
  }
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new TRPCError({ code: "FORBIDDEN", message: "请求来源未通过安全校验" });
  }
  const requestHost = ctx.req.headers.get("x-forwarded-host") ?? ctx.req.headers.get("host") ?? new URL(ctx.req.url).host;
  if (originHost !== requestHost) {
    throw new TRPCError({ code: "FORBIDDEN", message: "请求来源未通过安全校验" });
  }
}

export async function getCurrentMember(ctx: TrpcContext): Promise<AuthMember | null> {
  const token = parseCookies(ctx.req.headers.get("cookie")).get(SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const db = getDb();
  const rows = await db
    .select({
      id: members.id,
      name: members.name,
      pinyinKey: districtMembers.pinyinKey,
      role: members.role,
      sessionId: sessions.id,
      districtId: sessions.districtId,
      districtName: districts.name,
      active: members.active,
      relationshipActive: districtMembers.active,
      districtEnabled: districts.enabled,
    })
    .from(sessions)
    .innerJoin(members, eq(sessions.memberId, members.id))
    .innerJoin(districtMembers, and(eq(districtMembers.memberId, sessions.memberId), eq(districtMembers.districtId, sessions.districtId)))
    .innerJoin(districts, eq(districts.id, sessions.districtId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!row.active || !row.relationshipActive || !row.districtEnabled) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    pinyinKey: row.pinyinKey,
    role: row.role,
    districtId: row.districtId,
    districtName: row.districtName,
    sessionId: row.sessionId,
  };
}

export async function requireMember(ctx: TrpcContext) {
  const member = await getCurrentMember(ctx);
  if (!member) throw new TRPCError({ code: "UNAUTHORIZED", message: "登录状态已失效，请重新登录" });
  return member;
}

export async function requireRegularMember(ctx: TrpcContext) {
  const member = await requireMember(ctx);
  if (member.role !== "member") throw new TRPCError({ code: "FORBIDDEN", message: "该操作仅限普通成员" });
  return member;
}

export async function requireOrganizer(ctx: TrpcContext) {
  const member = await requireMember(ctx);
  if (member.role !== "organizer") throw new TRPCError({ code: "FORBIDDEN", message: "该操作仅限组织者" });
  return member;
}

export async function createSession(ctx: TrpcContext, memberId: number, districtId: string) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await getDb().insert(sessions).values({ tokenHash: hashSessionToken(token), memberId, districtId, expiresAt });
  ctx.resHeaders.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_SECONDS}`,
  );
}

export async function destroySession(ctx: TrpcContext) {
  const token = parseCookies(ctx.req.headers.get("cookie")).get(SESSION_COOKIE);
  if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
  ctx.resHeaders.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`,
  );
}
