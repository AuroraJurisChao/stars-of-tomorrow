import { TRPCError } from "@trpc/server";
import { alias } from "drizzle-orm/mysql-core";
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "./queries/connection";
import {
  collectionSnapshots,
  districtMembers,
  eventState,
  gameRuns,
  keywordCards,
  keywordVersions,
  matchAnswersV11,
  matchGamesV11,
  members,
  predictionsV11,
  riddleAnswersV11,
  riddleStatesV11,
  scoresV11,
  snapshotCards,
} from "@db/schema";
import { comparePinyin, type GameMode, type Phase } from "@contracts/constants";
import {
  competitionBoard,
  frequenciesFromCards,
  participationMemberIds,
  perfectMatchBonus,
  predictionScore,
  topKeywordsFromFrequencies,
} from "./v11Rules";

export type V11Db = Pick<
  ReturnType<typeof getDb>,
  "select" | "insert" | "update" | "delete"
>;

export async function getRun(
  districtId: string,
  mode: GameMode,
  db: V11Db = getDb(),
  create = true
) {
  const scope = and(
    eq(gameRuns.districtId, districtId),
    eq(gameRuns.mode, mode)
  );
  const existing = (await db.select().from(gameRuns).where(scope).limit(1))[0];
  if (existing || !create) return existing ?? null;
  await db
    .insert(gameRuns)
    .values({ districtId, mode })
    .onDuplicateKeyUpdate({ set: { districtId } });
  return (await db.select().from(gameRuns).where(scope).limit(1))[0] ?? null;
}

export async function getActiveRun(
  districtId: string,
  mode: GameMode,
  db: V11Db = getDb(),
  create = true
) {
  const run = await getRun(districtId, mode, db, create);
  if (!run && create)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "试玩运行区初始化失败",
    });
  return run;
}

export async function getSnapshot(districtId: string, db: V11Db = getDb()) {
  return (
    (
      await db
        .select()
        .from(collectionSnapshots)
        .where(eq(collectionSnapshots.districtId, districtId))
        .limit(1)
    )[0] ?? null
  );
}

export async function listSnapshotCards(
  districtId: string,
  db: V11Db = getDb()
) {
  const author = alias(members, "snapshot_author");
  const recipient = alias(members, "snapshot_recipient");
  return db
    .select({
      id: snapshotCards.nominationId,
      snapshotCardId: snapshotCards.id,
      snapshotId: snapshotCards.snapshotId,
      districtId: snapshotCards.districtId,
      authorId: snapshotCards.authorId,
      recipientId: snapshotCards.recipientId,
      reason: snapshotCards.reason,
      anonymous: snapshotCards.anonymous,
      submittedAt: snapshotCards.submittedAt,
      authorName: author.name,
      recipientName: recipient.name,
      authorPinyin: author.pinyinKey,
      recipientPinyin: recipient.pinyinKey,
    })
    .from(snapshotCards)
    .innerJoin(author, eq(snapshotCards.authorId, author.id))
    .innerJoin(recipient, eq(snapshotCards.recipientId, recipient.id))
    .where(eq(snapshotCards.districtId, districtId))
    .orderBy(asc(snapshotCards.nominationId));
}

export async function listDistrictMembers(
  districtId: string,
  db: V11Db = getDb()
) {
  return db
    .select({
      id: members.id,
      name: members.name,
      pinyinKey: districtMembers.pinyinKey,
    })
    .from(districtMembers)
    .innerJoin(members, eq(members.id, districtMembers.memberId))
    .where(
      and(
        eq(districtMembers.districtId, districtId),
        eq(districtMembers.active, true),
        eq(members.active, true),
        eq(members.role, "member")
      )
    )
    .orderBy(asc(districtMembers.pinyinKey));
}

export async function latestKeywordVersion(
  districtId: string,
  status: "draft" | "published",
  db: V11Db = getDb()
) {
  return (
    (
      await db
        .select()
        .from(keywordVersions)
        .where(
          and(
            eq(keywordVersions.districtId, districtId),
            eq(keywordVersions.status, status)
          )
        )
        .orderBy(desc(keywordVersions.version))
        .limit(1)
    )[0] ?? null
  );
}

export async function keywordFrequencies(
  versionId: number,
  db: V11Db = getDb()
) {
  const rows = await db
    .select({
      snapshotCardId: keywordCards.snapshotCardId,
      nominationId: snapshotCards.nominationId,
      tags: keywordCards.tags,
    })
    .from(keywordCards)
    .innerJoin(snapshotCards, eq(keywordCards.snapshotCardId, snapshotCards.id))
    .where(
      and(eq(keywordCards.versionId, versionId), eq(keywordCards.status, "ok"))
    );
  return frequenciesFromCards(rows);
}

export async function topKeywordsWithTies(
  versionId: number,
  db: V11Db = getDb()
) {
  return topKeywordsFromFrequencies(await keywordFrequencies(versionId, db));
}

export async function recomputeScoreV11(
  runId: number,
  districtId: string,
  memberId: number,
  db: V11Db = getDb()
) {
  const [prediction, riddles, match] = await Promise.all([
    db
      .select()
      .from(predictionsV11)
      .where(
        and(
          eq(predictionsV11.runId, runId),
          eq(predictionsV11.memberId, memberId)
        )
      )
      .limit(1),
    db
      .select({ score: riddleAnswersV11.score })
      .from(riddleAnswersV11)
      .where(
        and(
          eq(riddleAnswersV11.runId, runId),
          eq(riddleAnswersV11.memberId, memberId)
        )
      ),
    db
      .select()
      .from(matchGamesV11)
      .where(
        and(
          eq(matchGamesV11.runId, runId),
          eq(matchGamesV11.memberId, memberId)
        )
      )
      .limit(1),
  ]);
  const predict = prediction[0]?.settledAt ? prediction[0].score : 0;
  const riddle = riddles.reduce((sum, row) => sum + row.score, 0);
  const matchScore = match[0]?.finishedAt ? match[0].totalScore : 0;
  const total = predict + riddle + matchScore;
  await db
    .insert(scoresV11)
    .values({
      districtId,
      runId,
      memberId,
      predict,
      riddle,
      match: matchScore,
      total,
    })
    .onDuplicateKeyUpdate({
      set: { predict, riddle, match: matchScore, total },
    });
  return { predict, riddle, match: matchScore, total };
}

export async function settlePredictionsV11(
  runId: number,
  districtId: string,
  db: V11Db = getDb()
) {
  const run = (
    await db.select().from(gameRuns).where(eq(gameRuns.id, runId)).limit(1)
  )[0];
  if (!run?.keywordVersionId)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "本运行区尚未绑定已发布关键词版本",
    });
  const top = new Set(
    (await topKeywordsWithTies(run.keywordVersionId, db)).map(
      item => item.keyword
    )
  );
  if (top.size < 5)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "已审核关键词候选不足 5 个，不能结算",
    });
  const rows = await db
    .select()
    .from(predictionsV11)
    .where(eq(predictionsV11.runId, runId));
  for (const row of rows) {
    const { hits, score } = predictionScore(row.picks, top);
    await db
      .update(predictionsV11)
      .set({ hitCount: hits, score, settledAt: row.settledAt ?? new Date() })
      .where(
        and(eq(predictionsV11.id, row.id), eq(predictionsV11.runId, runId))
      );
    await recomputeScoreV11(runId, districtId, row.memberId, db);
  }
}

export async function getLeaderboardV11(
  districtId: string,
  runId: number | null,
  db: V11Db = getDb()
) {
  if (runId === null) return competitionBoard([], comparePinyin);
  const [riddleAnswers, predictions, matchAttempts, earlyFinishes] =
    await Promise.all([
      db
        .select({ memberId: riddleAnswersV11.memberId })
        .from(riddleAnswersV11)
        .where(
          and(
            eq(riddleAnswersV11.districtId, districtId),
            eq(riddleAnswersV11.runId, runId)
          )
        ),
      db
        .select({ memberId: predictionsV11.memberId })
        .from(predictionsV11)
        .where(
          and(
            eq(predictionsV11.districtId, districtId),
            eq(predictionsV11.runId, runId)
          )
        ),
      db
        .select({ memberId: matchGamesV11.memberId })
        .from(matchAnswersV11)
        .innerJoin(matchGamesV11, eq(matchAnswersV11.gameId, matchGamesV11.id))
        .where(
          and(
            eq(matchAnswersV11.districtId, districtId),
            eq(matchAnswersV11.runId, runId),
            eq(matchGamesV11.runId, runId),
            gt(matchAnswersV11.attempts, 0)
          )
        ),
      db
        .select({ memberId: matchGamesV11.memberId })
        .from(matchGamesV11)
        .where(
          and(
            eq(matchGamesV11.districtId, districtId),
            eq(matchGamesV11.runId, runId),
            eq(matchGamesV11.finishReason, "early")
          )
        ),
    ]);
  const participantIds = participationMemberIds({
    riddleAnswers: riddleAnswers.map(row => row.memberId),
    predictions: predictions.map(row => row.memberId),
    matchAttempts: matchAttempts.map(row => row.memberId),
    earlyFinishes: earlyFinishes.map(row => row.memberId),
  });
  if (participantIds.size === 0) return competitionBoard([], comparePinyin);
  const [memberRows, scoreRows] = await Promise.all([
    db
      .select({
        id: members.id,
        name: members.name,
        pinyinKey: districtMembers.pinyinKey,
      })
      .from(districtMembers)
      .innerJoin(members, eq(members.id, districtMembers.memberId))
      .where(
        and(
          eq(districtMembers.districtId, districtId),
          eq(districtMembers.active, true),
          eq(members.active, true),
          eq(members.role, "member"),
          inArray(members.id, [...participantIds])
        )
      ),
    db
      .select({
        memberId: scoresV11.memberId,
        predict: scoresV11.predict,
        riddle: scoresV11.riddle,
        match: scoresV11.match,
      })
      .from(scoresV11)
      .where(
        and(eq(scoresV11.districtId, districtId), eq(scoresV11.runId, runId))
      ),
  ]);
  const scores = new Map(scoreRows.map(row => [row.memberId, row]));
  return competitionBoard(
    memberRows.map(member => {
      const score = scores.get(member.id);
      return {
        ...member,
        predict: score?.predict ?? 0,
        riddle: score?.riddle ?? 0,
        match: score?.match ?? 0,
      };
    }),
    comparePinyin
  );
}

export async function updateEventPhase(
  districtId: string,
  phase: Phase,
  step = 0,
  db: V11Db = getDb()
) {
  const current = (
    await db
      .select()
      .from(eventState)
      .where(and(eq(eventState.districtId, districtId), eq(eventState.id, 1)))
      .limit(1)
  )[0];
  if (!current)
    throw new TRPCError({ code: "NOT_FOUND", message: "活动状态不存在" });
  await db
    .update(eventState)
    .set({
      phase,
      step,
      payload: {},
      revision: current.revision + 1,
      matchEndsAt: phase === "match" ? current.matchEndsAt : null,
      matchExtraUsed: false,
      updatedAt: new Date(),
    })
    .where(and(eq(eventState.districtId, districtId), eq(eventState.id, 1)));
}

export async function ensureRiddleState(
  runId: number,
  districtId: string,
  db: V11Db = getDb()
) {
  const existing = (
    await db
      .select()
      .from(riddleStatesV11)
      .where(eq(riddleStatesV11.runId, runId))
      .limit(1)
  )[0];
  if (existing) return existing;
  await db
    .insert(riddleStatesV11)
    .values({ districtId, runId, usedCardIds: [] })
    .onDuplicateKeyUpdate({ set: { districtId } });
  return (
    await db
      .select()
      .from(riddleStatesV11)
      .where(eq(riddleStatesV11.runId, runId))
      .limit(1)
  )[0];
}

export function effectiveRiddleStatus<
  T extends { status: string; endsAt: Date | null },
>(state: T) {
  return state.status === "answering" &&
    state.endsAt &&
    state.endsAt.getTime() <= Date.now()
    ? "closed"
    : state.status;
}

export async function riddleView(
  runId: number,
  districtId: string,
  db: V11Db = getDb()
) {
  const state = await ensureRiddleState(runId, districtId, db);
  if (!state.currentCardId)
    return {
      status: effectiveRiddleStatus(state),
      card: null,
      answerCount: 0,
      remainingMs: 0,
    };
  const card = (await listSnapshotCards(districtId, db)).find(
    item => item.id === state.currentCardId
  );
  if (!card)
    return {
      status: effectiveRiddleStatus(state),
      card: null,
      answerCount: 0,
      remainingMs: 0,
    };
  const answers = await db
    .select({ id: riddleAnswersV11.id })
    .from(riddleAnswersV11)
    .where(
      and(
        eq(riddleAnswersV11.runId, runId),
        eq(riddleAnswersV11.nominationId, card.id)
      )
    );
  const status = effectiveRiddleStatus(state);
  const visible = ["answering", "closed", "revealed"].includes(status);
  return {
    status,
    card: {
      id: card.id,
      reason: visible ? card.reason : null,
      recipientName: status === "revealed" ? card.recipientName : null,
    },
    answerCount: answers.length,
    remainingMs:
      status === "answering" && state.endsAt
        ? Math.max(0, state.endsAt.getTime() - Date.now())
        : 0,
  };
}

export async function ensureMatchGame(
  run: NonNullable<Awaited<ReturnType<typeof getRun>>>,
  memberId: number,
  db: V11Db = getDb()
) {
  if (!run.matchStartedAt || !run.matchEndsAt)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "连连看统一计时尚未开始",
    });
  const scope = and(
    eq(matchGamesV11.runId, run.id),
    eq(matchGamesV11.memberId, memberId)
  );
  let game = (await db.select().from(matchGamesV11).where(scope).limit(1))[0];
  if (game) return game;
  const cards = (await listSnapshotCards(run.districtId, db)).filter(
    card => card.recipientId === memberId
  );
  const cardIds = cards.map(card => card.id);
  await db
    .insert(matchGamesV11)
    .values({
      districtId: run.districtId,
      runId: run.id,
      memberId,
      cardIds,
      startedAt: run.matchStartedAt,
      endsAt: run.matchEndsAt,
      finishedAt: cardIds.length === 0 ? new Date() : null,
      finishReason: cardIds.length === 0 ? "zero-cards" : null,
    })
    .onDuplicateKeyUpdate({ set: { memberId } });
  // A concurrent first request may have committed the duplicate-key row after
  // this transaction's consistent snapshot. Read the row back with a current
  // locking read so TiDB cannot return an invisible pre-insert snapshot here.
  game = (
    await db.select().from(matchGamesV11).where(scope).limit(1).for("update")
  )[0];
  if (cardIds.length > 0) {
    await db
      .insert(matchAnswersV11)
      .values(
        cardIds.map(nominationId => ({
          districtId: run.districtId,
          runId: run.id,
          gameId: game.id,
          nominationId,
          wrongPicks: [],
        }))
      )
      .onDuplicateKeyUpdate({ set: { gameId: game.id } });
  }
  if (cardIds.length === 0)
    await recomputeScoreV11(run.id, run.districtId, memberId, db);
  return game;
}

export async function finishMatchV11(
  gameId: number,
  runId: number,
  districtId: string,
  reason: string,
  db: V11Db = getDb()
) {
  const game = (
    await db
      .select()
      .from(matchGamesV11)
      .where(and(eq(matchGamesV11.id, gameId), eq(matchGamesV11.runId, runId)))
      .limit(1)
  )[0];
  if (!game || game.finishedAt) return game ?? null;
  const answers = await db
    .select()
    .from(matchAnswersV11)
    .where(eq(matchAnswersV11.gameId, gameId));
  const baseScore = answers.reduce((sum, answer) => sum + answer.score, 0);
  const perfectBonus = perfectMatchBonus(game.cardIds, answers);
  await db
    .update(matchGamesV11)
    .set({
      finishedAt: new Date(),
      finishReason: reason,
      baseScore,
      perfectBonus,
      totalScore: baseScore + perfectBonus,
    })
    .where(and(eq(matchGamesV11.id, gameId), eq(matchGamesV11.runId, runId)));
  await recomputeScoreV11(runId, districtId, game.memberId, db);
  return (
    await db
      .select()
      .from(matchGamesV11)
      .where(eq(matchGamesV11.id, gameId))
      .limit(1)
  )[0];
}
