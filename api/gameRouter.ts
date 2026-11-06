import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter, publicMutation, publicQuery } from "./middleware";
import { requireRegularMember } from "./auth";
import { getDb } from "./queries/connection";
import {
  districtMembers,
  eventState,
  matchAnswersV11,
  matchGamesV11,
  members,
  predictionsV11,
  riddleAnswersV11,
  riddleStatesV11,
  scoresV11,
} from "@db/schema";
import { getEventState } from "./domain";
import { matchAttemptScore, riddleScore } from "./v11Rules";
import {
  ensureMatchGame,
  finishMatchV11,
  getActiveRun,
  getLeaderboardV11,
  keywordFrequencies,
  listSnapshotCards,
  recomputeScoreV11,
  riddleView,
  type V11Db,
} from "./v11";

function duplicateError(error: unknown) {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return (
    candidate?.code === "ER_DUP_ENTRY" ||
    candidate?.cause?.code === "ER_DUP_ENTRY"
  );
}

async function matchView(districtId: string, memberId: number) {
  const db = getDb();
  return db.transaction(async tx => {
    const state = (
      await tx
        .select()
        .from(eventState)
        .where(and(eq(eventState.districtId, districtId), eq(eventState.id, 1)))
        .limit(1)
        .for("update")
    )[0];
    if (!state || state.phase !== "match")
      return { active: false as const, phase: state?.phase ?? "collect" };
    const run = await getActiveRun(districtId, state.gameMode, tx, false);
    if (!run)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "当前运行区不存在",
      });
    if (!run.matchStartedAt || !run.matchEndsAt) {
      return {
        active: false as const,
        phase: state.phase,
        status: "not-started" as const,
      };
    }
    let game = await ensureMatchGame(run, memberId, tx);
    if (!game.finishedAt && game.endsAt.getTime() <= Date.now())
      game = (await finishMatchV11(
        game.id,
        run.id,
        districtId,
        "timeout",
        tx
      ))!;
    const [answers, cards] = await Promise.all([
      tx
        .select()
        .from(matchAnswersV11)
        .where(eq(matchAnswersV11.gameId, game.id)),
      listSnapshotCards(districtId, tx),
    ]);
    const ownCards = cards.filter(card => game.cardIds.includes(card.id));
    const candidates = [
      ...new Map(
        ownCards
          .filter(card => !card.anonymous)
          .map(card => [
            card.authorId,
            {
              id: card.authorId,
              name: card.authorName,
              pinyinKey: card.authorPinyin,
            },
          ])
      ).values(),
    ].sort(
      (a, b) =>
        a.pinyinKey.localeCompare(b.pinyinKey) ||
        a.name.localeCompare(b.name, "zh-CN")
    );
    return {
      active: true as const,
      phase: state.phase,
      endsAt: game.endsAt,
      remainingMs: game.finishedAt
        ? 0
        : Math.max(0, game.endsAt.getTime() - Date.now()),
      finished: Boolean(game.finishedAt),
      finishReason: game.finishReason,
      baseScore: game.finishedAt
        ? game.baseScore
        : answers.reduce((sum, answer) => sum + answer.score, 0),
      bonus: game.perfectBonus,
      totalScore: game.finishedAt
        ? game.totalScore
        : answers.reduce((sum, answer) => sum + answer.score, 0),
      candidates: candidates.map(({ id, name }) => ({ id, name })),
      cards: ownCards.map(card => {
        const answer = answers.find(item => item.nominationId === card.id);
        return {
          id: card.id,
          reason: card.reason,
          anonymous: card.anonymous,
          solved: Boolean(answer?.solved),
          solvedLabel: answer?.solved
            ? card.anonymous
              ? "匿名欣赏"
              : card.authorName
            : null,
          solvedTarget: answer?.solved
            ? card.anonymous
              ? ("anonymous" as const)
              : card.authorId
            : null,
          attempts: answer?.attempts ?? 0,
          wrongPicks: answer?.wrongPicks ?? [],
          score: answer?.score ?? 0,
        };
      }),
    };
  });
}

async function lockedState(districtId: string, db: V11Db) {
  return (
    await db
      .select()
      .from(eventState)
      .where(and(eq(eventState.districtId, districtId), eq(eventState.id, 1)))
      .limit(1)
      .for("update")
  )[0];
}

export const gameRouter = createRouter({
  state: publicQuery.query(async ({ ctx }) => {
    const me = await requireRegularMember(ctx);
    const db = getDb();
    const districtId = me.districtId;
    const state = await getEventState(districtId);
    const run =
      state.phase === "collect"
        ? null
        : await getActiveRun(districtId, state.gameMode, db, false);
    const score = run
      ? ((
          await db
            .select()
            .from(scoresV11)
            .where(
              and(eq(scoresV11.runId, run.id), eq(scoresV11.memberId, me.id))
            )
            .limit(1)
        )[0] ?? { predict: 0, riddle: 0, match: 0, total: 0 })
      : { predict: 0, riddle: 0, match: 0, total: 0 };
    let predict;
    if (
      run?.keywordVersionId &&
      ["predict", "predict-reveal"].includes(state.phase)
    ) {
      const frequencies = await keywordFrequencies(run.keywordVersionId, db);
      const own = (
        await db
          .select()
          .from(predictionsV11)
          .where(
            and(
              eq(predictionsV11.runId, run.id),
              eq(predictionsV11.memberId, me.id)
            )
          )
          .limit(1)
      )[0];
      predict = {
        available: state.phase === "predict" && frequencies.length >= 5,
        options: frequencies
          .map(item => item.keyword)
          .sort((a, b) => a.localeCompare(b, "zh-CN")),
        own: own
          ? {
              picks: own.picks,
              score: own.settledAt ? own.score : null,
              hitCount: own.settledAt ? own.hitCount : null,
            }
          : null,
        settled: Boolean(own?.settledAt),
      };
    }
    let riddle;
    if (run && state.phase === "riddle") {
      const view = await riddleView(run.id, districtId, db);
      const own = view.card
        ? (
            await db
              .select()
              .from(riddleAnswersV11)
              .where(
                and(
                  eq(riddleAnswersV11.runId, run.id),
                  eq(riddleAnswersV11.nominationId, view.card.id),
                  eq(riddleAnswersV11.memberId, me.id)
                )
              )
              .limit(1)
          )[0]
        : null;
      riddle = {
        ...view,
        own: own
          ? {
              pickedRecipientId: own.pickedRecipientId,
              correct: view.status === "revealed" ? own.correct : null,
              remainingMs: view.status === "revealed" ? own.remainingMs : null,
              score: view.status === "revealed" ? own.score : null,
            }
          : null,
      };
    }
    const match =
      state.phase === "match" ? await matchView(districtId, me.id) : undefined;
    const board =
      run && ["rank", "award"].includes(state.phase)
        ? await getLeaderboardV11(districtId, run.id, db)
        : null;
    return {
      phase: state.phase,
      step: state.step,
      revision: state.revision,
      score,
      predict,
      riddle,
      match,
      leaderboard: board?.leaderboard ?? [],
      winners: board?.winners ?? [],
    };
  }),

  submitPrediction: publicMutation
    .input(
      z.object({ picks: z.array(z.string().trim().min(1).max(12)).length(3) })
    )
    .mutation(async ({ ctx, input }) => {
      const me = await requireRegularMember(ctx);
      const districtId = me.districtId;
      const db = getDb();
      return db.transaction(async tx => {
        const state = await lockedState(districtId, tx);
        if (state?.phase !== "predict")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "预言已截止，不能继续修改",
          });
        if (new Set(input.picks).size !== 3)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "请选择三个不同关键词",
          });
        const run = await getActiveRun(districtId, state.gameMode, tx, false);
        if (!run?.keywordVersionId)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "本运行区未绑定已发布关键词版本",
          });
        const options = await keywordFrequencies(run.keywordVersionId, tx);
        if (
          options.length < 5 ||
          input.picks.some(
            pick => !options.some(option => option.keyword === pick)
          )
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "预言关键词不在已审核候选中",
          });
        }
        await tx
          .insert(predictionsV11)
          .values({
            districtId,
            runId: run.id,
            memberId: me.id,
            keywordVersionId: run.keywordVersionId,
            picks: input.picks,
          })
          .onDuplicateKeyUpdate({
            set: {
              picks: input.picks,
              keywordVersionId: run.keywordVersionId,
              settledAt: null,
              hitCount: 0,
              score: 0,
            },
          });
        return { ok: true, picks: input.picks };
      });
    }),

  answerRiddle: publicMutation
    .input(
      z.object({
        nominationId: z.number().int().positive(),
        pickedRecipientId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const me = await requireRegularMember(ctx);
      const districtId = me.districtId;
      const db = getDb();
      try {
        return await db.transaction(async tx => {
          const state = await lockedState(districtId, tx);
          if (state?.phase !== "riddle")
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "当前不是真心话抢答阶段",
            });
          const run = await getActiveRun(districtId, state.gameMode, tx, false);
          if (!run)
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "当前运行区不存在",
            });
          const riddle = (
            await tx
              .select()
              .from(riddleStatesV11)
              .where(eq(riddleStatesV11.runId, run.id))
              .limit(1)
              .for("update")
          )[0];
          if (
            !riddle ||
            riddle.status !== "answering" ||
            riddle.currentCardId !== input.nominationId ||
            !riddle.endsAt
          ) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "这道抢答已截止或尚未开始",
            });
          }
          const now = Date.now();
          if (now >= riddle.endsAt.getTime()) {
            await tx
              .update(riddleStatesV11)
              .set({ status: "closed" })
              .where(eq(riddleStatesV11.id, riddle.id));
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "本题 30 秒作答已超时",
            });
          }
          const recipient = (
            await tx
              .select({ id: members.id })
              .from(districtMembers)
              .innerJoin(members, eq(members.id, districtMembers.memberId))
              .where(
                and(
                  eq(districtMembers.districtId, districtId),
                  eq(districtMembers.active, true),
                  eq(members.id, input.pickedRecipientId),
                  eq(members.role, "member")
                )
              )
              .limit(1)
          )[0];
          if (!recipient)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "所选同事不在本选区",
            });
          const card = (await listSnapshotCards(districtId, tx)).find(
            item => item.id === input.nominationId
          );
          if (!card)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "快照题目不存在",
            });
          const correct = input.pickedRecipientId === card.recipientId;
          const remainingMs = Math.max(0, riddle.endsAt.getTime() - now);
          const score = riddleScore(correct, remainingMs);
          await tx
            .insert(riddleAnswersV11)
            .values({
              districtId,
              runId: run.id,
              nominationId: card.id,
              memberId: me.id,
              pickedRecipientId: input.pickedRecipientId,
              correct,
              remainingMs,
              score,
            });
          await recomputeScoreV11(run.id, districtId, me.id, tx);
          return {
            ok: true,
            score: null,
            message: "答案已记录，等待组织者揭晓",
          };
        });
      } catch (error) {
        if (duplicateError(error))
          throw new TRPCError({
            code: "CONFLICT",
            message: "每人每题只能作答一次",
          });
        throw error;
      }
    }),

  match: publicQuery.query(async ({ ctx }) => {
    const me = await requireRegularMember(ctx);
    return matchView(me.districtId, me.id);
  }),

  matchAttempt: publicMutation
    .input(
      z.object({
        nominationId: z.number().int().positive(),
        choice: z.union([z.literal("anonymous"), z.number().int().positive()]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const me = await requireRegularMember(ctx);
      const districtId = me.districtId;
      const db = getDb();
      return db.transaction(async tx => {
        const state = await lockedState(districtId, tx);
        if (state?.phase !== "match")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "连连看当前不可作答",
          });
        const run = await getActiveRun(districtId, state.gameMode, tx, false);
        if (!run)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "当前运行区不存在",
          });
        let game = await ensureMatchGame(run, me.id, tx);
        const lockedGame = (
          await tx
            .select()
            .from(matchGamesV11)
            .where(eq(matchGamesV11.id, game.id))
            .limit(1)
            .for("update")
        )[0];
        game = lockedGame;
        if (game.finishedAt || game.endsAt.getTime() <= Date.now()) {
          await finishMatchV11(game.id, run.id, districtId, "timeout", tx);
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "本场连连看已经结束",
          });
        }
        if (!game.cardIds.includes(input.nominationId))
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "这不是你本人收到的题目",
          });
        const ownCards = (await listSnapshotCards(districtId, tx)).filter(
          item => game.cardIds.includes(item.id)
        );
        const card = ownCards.find(item => item.id === input.nominationId);
        if (!card || card.recipientId !== me.id)
          throw new TRPCError({ code: "FORBIDDEN", message: "题目无效" });
        if (input.choice !== "anonymous") {
          const candidateIds = new Set(
            ownCards.filter(item => !item.anonymous).map(item => item.authorId)
          );
          if (!candidateIds.has(input.choice)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "候选填写人不在本人题组中",
            });
          }
        }
        const answer = (
          await tx
            .select()
            .from(matchAnswersV11)
            .where(
              and(
                eq(matchAnswersV11.gameId, game.id),
                eq(matchAnswersV11.nominationId, card.id)
              )
            )
            .limit(1)
            .for("update")
        )[0];
        if (!answer)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "连线题尚未初始化",
          });
        if (answer.solved)
          return {
            ok: true,
            correct: true,
            score: answer.score,
            alreadySolved: true,
          };
        const choiceKey = String(input.choice);
        if (answer.wrongPicks.includes(choiceKey))
          throw new TRPCError({ code: "CONFLICT", message: "该选择已经排除" });
        const correct = card.anonymous
          ? input.choice === "anonymous"
          : input.choice === card.authorId;
        const score = matchAttemptScore(correct, answer.attempts);
        await tx
          .update(matchAnswersV11)
          .set({
            attempts: answer.attempts + 1,
            solved: correct,
            wrongPicks: correct
              ? answer.wrongPicks
              : [...answer.wrongPicks, choiceKey],
            score,
            answeredAt: new Date(),
          })
          .where(eq(matchAnswersV11.id, answer.id));
        const answers = await tx
          .select()
          .from(matchAnswersV11)
          .where(eq(matchAnswersV11.gameId, game.id));
        const solved = answers.filter(item => item.solved).length;
        if (solved === game.cardIds.length && game.cardIds.length > 0)
          await finishMatchV11(game.id, run.id, districtId, "complete", tx);
        return { ok: true, correct, score, solved, total: game.cardIds.length };
      });
    }),

  finishMatch: publicMutation.mutation(async ({ ctx }) => {
    const me = await requireRegularMember(ctx);
    const districtId = me.districtId;
    const db = getDb();
    return db.transaction(async tx => {
      const state = await lockedState(districtId, tx);
      if (state?.phase !== "match")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "当前不在连连看环节",
        });
      const run = await getActiveRun(districtId, state.gameMode, tx, false);
      if (!run)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "当前运行区不存在",
        });
      const game = await ensureMatchGame(run, me.id, tx);
      const fresh = await finishMatchV11(
        game.id,
        run.id,
        districtId,
        "early",
        tx
      );
      return { ok: true, totalScore: fresh?.totalScore ?? 0 };
    });
  }),
});
