import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createRouter, publicMutation, publicQuery } from "./middleware";
import { requireRegularMember } from "./auth";
import { getDb } from "./queries/connection";
import {
  auditLogs,
  districtMembers,
  drafts,
  eventState,
  matchAnswers,
  matchAnswersV11,
  matchGames,
  matchGamesV11,
  members,
  nominations,
  predictions,
  predictionsV11,
  riddleAnswers,
  riddleAnswersV11,
  riddleSets,
  scores,
  scoresV11,
  submissionStates,
} from "@db/schema";
import { cleanReason, MAX_REASON_LENGTH, unicodeLength } from "@contracts/constants";
import { extractKeywords } from "./domain";

const cardInput = z.object({
  recipientId: z.number().int().positive(),
  reason: z.string().max(4000),
  anonymous: z.boolean().default(false),
});
const cardsInput = z.array(cardInput);
const revisionInput = z.string().regex(/^[a-f0-9]{64}$/);

type DbReader = Pick<ReturnType<typeof getDb>, "select">;
type RevisionCard = Pick<typeof nominations.$inferSelect, "id" | "recipientId" | "reason" | "anonymous">;
type CardContent = { recipientId: number; reason: string; anonymous: boolean };

export function submittedRevision(cards: RevisionCard[]) {
  const canonical = [...cards]
    .sort((left, right) => left.id - right.id || left.recipientId - right.recipientId)
    .map((card) => [card.id, card.recipientId, card.reason, card.anonymous]);
  return createHash("sha256").update(`submitted-cards-v1\n${JSON.stringify(canonical)}`, "utf8").digest("hex");
}

function contentSignature(cards: CardContent[]) {
  return JSON.stringify([...cards]
    .sort((left, right) => left.recipientId - right.recipientId)
    .map((card) => [card.recipientId, card.reason, card.anonymous]));
}

async function downstreamCount(db: DbReader, districtId: string) {
  const [predictionRows, riddleSetRows, riddleAnswerRows, matchGameRows, matchAnswerRows, scoreRows] = await Promise.all([
    db.select({ value: count() }).from(predictions).where(eq(predictions.districtId, districtId)),
    db.select({ value: count() }).from(riddleSets).where(eq(riddleSets.districtId, districtId)),
    db.select({ value: count() }).from(riddleAnswers).where(eq(riddleAnswers.districtId, districtId)),
    db.select({ value: count() }).from(matchGames).where(eq(matchGames.districtId, districtId)),
    db.select({ value: count() }).from(matchAnswers).where(eq(matchAnswers.districtId, districtId)),
    db.select({ value: count() }).from(scores).where(eq(scores.districtId, districtId)),
  ]);
  const legacy = [predictionRows, riddleSetRows, riddleAnswerRows, matchGameRows, matchAnswerRows, scoreRows]
    .reduce((total, rows) => total + (rows[0]?.value ?? 0), 0);
  const v11Rows = await Promise.all([
    db.select({ value: count() }).from(predictionsV11).where(eq(predictionsV11.districtId, districtId)),
    db.select({ value: count() }).from(riddleAnswersV11).where(eq(riddleAnswersV11.districtId, districtId)),
    db.select({ value: count() }).from(matchGamesV11).where(eq(matchGamesV11.districtId, districtId)),
    db.select({ value: count() }).from(matchAnswersV11).where(eq(matchAnswersV11.districtId, districtId)),
    db.select({ value: count() }).from(scoresV11).where(eq(scoresV11.districtId, districtId)),
  ]);
  return legacy + v11Rows.reduce((total, rows) => total + (rows[0]?.value ?? 0), 0);
}

async function validateRecipients(districtId: string, recipientIds: number[], db: DbReader = getDb()) {
  if (new Set(recipientIds).size !== recipientIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "同一位同事不能重复选择" });
  }
  if (recipientIds.length === 0) return;
  const valid = await db.select({ id: members.id }).from(districtMembers)
    .innerJoin(members, eq(members.id, districtMembers.memberId))
    .where(and(
      eq(districtMembers.districtId, districtId),
      eq(districtMembers.active, true),
      inArray(members.id, recipientIds),
      eq(members.role, "member"),
      eq(members.active, true),
    ));
  if (valid.length !== recipientIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "推荐人员不在本选区" });
  }
}

function normalizeCards(cards: z.infer<typeof cardsInput>, allowEmpty: boolean) {
  return cards.map((card) => {
    const reason = cleanReason(card.reason);
    const length = unicodeLength(reason);
    if ((!allowEmpty && length < 1) || length > MAX_REASON_LENGTH) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: allowEmpty ? "每张欣赏卡不能超过1000个字符" : "每张欣赏卡需为1–1000个字符",
      });
    }
    return { ...card, reason };
  });
}

function submittedConflict() {
  return new TRPCError({ code: "CONFLICT", message: "已正式提交，不能再次提交或修改" });
}

function revisionConflict() {
  return new TRPCError({ code: "CONFLICT", message: "正式稿已在另一处更新，请重新读取后再修改" });
}

function isDuplicateError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code === "ER_DUP_ENTRY" || candidate.cause?.code === "ER_DUP_ENTRY";
}

export const nominateRouter = createRouter({
  mine: publicQuery.query(async ({ ctx }) => {
    const me = await requireRegularMember(ctx);
    const db = getDb();
    const state = (await db.select().from(eventState).where(and(eq(eventState.districtId, me.districtId), eq(eventState.id, 1))).limit(1))[0];
    const [formal, savedDrafts, locks, downstream] = await Promise.all([
      db.select().from(nominations).where(and(eq(nominations.districtId, me.districtId), eq(nominations.authorId, me.id))).orderBy(nominations.id),
      db.select().from(drafts).where(and(eq(drafts.districtId, me.districtId), eq(drafts.authorId, me.id))).orderBy(drafts.id),
      db.select().from(submissionStates).where(and(eq(submissionStates.districtId, me.districtId), eq(submissionStates.memberId, me.id))).limit(1),
      downstreamCount(db, me.districtId),
    ]);
    const locked = locks.length > 0;
    const source = locked ? formal : savedDrafts;
    const phaseClosed = state?.phase !== "collect";
    const canEditSubmitted = locked && !phaseClosed && downstream === 0;
    return {
      canSubmit: state?.phase === "collect" && !locked,
      canEditSubmitted,
      submittedEditBlockedReason: !locked ? "not-submitted" : phaseClosed ? "phase-closed" : downstream > 0 ? "downstream-started" : null,
      revision: submittedRevision(formal),
      status: locked ? "submitted" : savedDrafts.length > 0 ? "draft" : "empty",
      cards: source.map((card) => ({ recipientId: card.recipientId, reason: card.reason, anonymous: card.anonymous })),
      formalCards: formal.map((card) => ({ recipientId: card.recipientId, reason: card.reason, anonymous: card.anonymous })),
      draftCards: savedDrafts.map((card) => ({ recipientId: card.recipientId, reason: card.reason, anonymous: card.anonymous })),
      submittedAt: locks[0]?.submittedAt ?? null,
    };
  }),

  saveDraft: publicMutation.input(z.object({ cards: cardsInput })).mutation(async ({ ctx, input }) => {
    const me = await requireRegularMember(ctx);
    const cards = normalizeCards(input.cards, true);
    await validateRecipients(me.districtId, cards.map((card) => card.recipientId));
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx.select({ id: districtMembers.id }).from(districtMembers)
        .where(and(eq(districtMembers.districtId, me.districtId), eq(districtMembers.memberId, me.id), eq(districtMembers.active, true)))
        .for("update");
      const locked = await tx.select({ id: submissionStates.id }).from(submissionStates)
        .where(and(eq(submissionStates.districtId, me.districtId), eq(submissionStates.memberId, me.id))).limit(1);
      if (locked.length > 0) throw submittedConflict();
      const state = (await tx.select().from(eventState).where(and(eq(eventState.districtId, me.districtId), eq(eventState.id, 1))).limit(1))[0];
      if (state?.phase !== "collect") throw new TRPCError({ code: "FORBIDDEN", message: "当前环节不能修改草稿" });
      await tx.delete(drafts).where(and(eq(drafts.districtId, me.districtId), eq(drafts.authorId, me.id)));
      if (cards.length > 0) {
        await tx.insert(drafts).values(cards.map((card) => ({ ...card, districtId: me.districtId, authorId: me.id })));
      }
    });
    return { ok: true, savedAt: new Date() };
  }),

  submit: publicMutation.input(z.object({ cards: cardsInput.min(1) })).mutation(async ({ ctx, input }) => {
    const me = await requireRegularMember(ctx);
    const cards = normalizeCards(input.cards, false);
    await validateRecipients(me.districtId, cards.map((card) => card.recipientId));
    const db = getDb();
    try {
      await db.transaction(async (tx) => {
        await tx.select({ id: districtMembers.id }).from(districtMembers)
          .where(and(eq(districtMembers.districtId, me.districtId), eq(districtMembers.memberId, me.id), eq(districtMembers.active, true)))
          .for("update");
        const locked = await tx.select({ id: submissionStates.id }).from(submissionStates)
          .where(and(eq(submissionStates.districtId, me.districtId), eq(submissionStates.memberId, me.id))).limit(1);
        if (locked.length > 0) throw submittedConflict();
        const state = (await tx.select().from(eventState).where(and(eq(eventState.districtId, me.districtId), eq(eventState.id, 1))).limit(1))[0];
        if (state?.phase !== "collect") throw new TRPCError({ code: "FORBIDDEN", message: "欣赏收集已关闭" });
        await tx.insert(submissionStates).values({ districtId: me.districtId, memberId: me.id });
        await tx.insert(nominations).values(cards.map((card) => ({
          districtId: me.districtId,
          authorId: me.id,
          recipientId: card.recipientId,
          reason: card.reason,
          anonymous: card.anonymous,
          keywords: extractKeywords(card.reason),
        })));
        await tx.delete(drafts).where(and(eq(drafts.districtId, me.districtId), eq(drafts.authorId, me.id)));
      });
    } catch (error) {
      if (isDuplicateError(error)) throw submittedConflict();
      throw error;
    }
    return {
      ok: true,
      count: cards.length,
      cards: cards.map((card) => ({ recipientId: card.recipientId, reason: card.reason, anonymous: card.anonymous })),
    };
  }),

  updateSubmitted: publicMutation.input(z.object({
    cards: cardsInput.min(1),
    expectedRevision: revisionInput,
  })).mutation(async ({ ctx, input }) => {
    const me = await requireRegularMember(ctx);
    const cards = normalizeCards(input.cards, false);
    const db = getDb();
    return db.transaction(async (tx) => {
      const state = (await tx.select().from(eventState)
        .where(and(eq(eventState.districtId, me.districtId), eq(eventState.id, 1)))
        .limit(1).for("update"))[0];
      if (state?.phase !== "collect") {
        throw new TRPCError({ code: "FORBIDDEN", message: "欣赏收集已结束，正式稿已最终锁定" });
      }

      const membership = await tx.select({ id: districtMembers.id }).from(districtMembers)
        .where(and(eq(districtMembers.districtId, me.districtId), eq(districtMembers.memberId, me.id), eq(districtMembers.active, true)))
        .for("update");
      if (membership.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "当前成员关系不可用" });

      const locks = await tx.select({ id: submissionStates.id }).from(submissionStates)
        .where(and(eq(submissionStates.districtId, me.districtId), eq(submissionStates.memberId, me.id)))
        .limit(1).for("update");
      if (locks.length === 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "尚未正式提交，不能修改正式稿" });

      const formal = await tx.select().from(nominations)
        .where(and(eq(nominations.districtId, me.districtId), eq(nominations.authorId, me.id)))
        .orderBy(nominations.id).for("update");
      if (await downstreamCount(tx, me.districtId) > 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "后续活动已开始，正式稿已最终锁定" });
      }
      await validateRecipients(me.districtId, cards.map((card) => card.recipientId), tx);

      const currentRevision = submittedRevision(formal);
      const currentContent = contentSignature(formal);
      const nextContent = contentSignature(cards);
      if (input.expectedRevision !== currentRevision) {
        if (nextContent === currentContent) {
          return { ok: true as const, revision: currentRevision, count: formal.length, idempotent: true };
        }
        throw revisionConflict();
      }
      if (nextContent === currentContent) {
        return { ok: true as const, revision: currentRevision, count: formal.length, idempotent: true };
      }

      const oldByRecipient = new Map(formal.map((card) => [card.recipientId, card]));
      const nextRecipients = new Set(cards.map((card) => card.recipientId));
      if (formal.some((card) => !nextRecipients.has(card.recipientId))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "已提交卡的接收人不能删除或更换" });
      }

      const updatedRecipientIds: number[] = [];
      const addedRecipientIds: number[] = [];
      for (const card of cards) {
        const existing = oldByRecipient.get(card.recipientId);
        if (!existing) {
          addedRecipientIds.push(card.recipientId);
          continue;
        }
        if (existing.reason === card.reason && existing.anonymous === card.anonymous) continue;
        await tx.update(nominations).set({
          reason: card.reason,
          anonymous: card.anonymous,
          keywords: extractKeywords(card.reason),
        }).where(and(
          eq(nominations.id, existing.id),
          eq(nominations.districtId, me.districtId),
          eq(nominations.authorId, me.id),
          eq(nominations.recipientId, existing.recipientId),
        ));
        updatedRecipientIds.push(card.recipientId);
      }

      const additions = cards.filter((card) => !oldByRecipient.has(card.recipientId));
      if (additions.length > 0) {
        await tx.insert(nominations).values(additions.map((card) => ({
          districtId: me.districtId,
          authorId: me.id,
          recipientId: card.recipientId,
          reason: card.reason,
          anonymous: card.anonymous,
          keywords: extractKeywords(card.reason),
        })));
      }

      const nextFormal = await tx.select().from(nominations)
        .where(and(eq(nominations.districtId, me.districtId), eq(nominations.authorId, me.id)))
        .orderBy(nominations.id);
      const revision = submittedRevision(nextFormal);
      await tx.insert(auditLogs).values({
        districtId: me.districtId,
        actorId: me.id,
        action: "update-submitted",
        details: { updatedRecipientIds, addedRecipientIds, cardCount: nextFormal.length, revision },
      });
      return { ok: true as const, revision, count: nextFormal.length, idempotent: false };
    });
  }),
});
