import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter, publicMutation, publicQuery } from "./middleware";
import { requireOrganizer } from "./auth";
import { getDb } from "./queries/connection";
import {
  auditLogs,
  collectionSnapshots,
  districtMembers,
  drafts,
  eventState,
  gameRuns,
  keywordCards,
  keywordVersions,
  matchAnswersV11,
  matchGamesV11,
  members,
  nominations,
  predictionsV11,
  riddleAnswersV11,
  riddleStatesV11,
  scoresV11,
  snapshotCards,
  submissionStates,
} from "@db/schema";
import {
  GAME_MODES,
  MATCH_SECONDS,
  ORGANIZER_NAME,
} from "@contracts/constants";
import { localKeywordSuggestionsSchema } from "@contracts/localKeywordSuggestions";
import { getEventState, getSelfQuotes, listCards } from "./domain";
import {
  ensureRiddleState,
  finishMatchV11,
  getActiveRun,
  getLeaderboardV11,
  getRun,
  getSnapshot,
  keywordFrequencies,
  latestKeywordVersion,
  listDistrictMembers,
  listSnapshotCards,
  riddleView,
  settlePredictionsV11,
  topKeywordsWithTies,
  updateEventPhase,
  effectiveRiddleStatus,
  type V11Db,
} from "./v11";
import {
  keywordGenerationRunning,
  llmConfigured,
  normalizeKeywordTags,
  startKeywordGeneration,
} from "./llmKeywords";
import { keywordPersistence, localImportMismatch } from "./v11Rules";

const fourChinese = z.string().regex(/^[\u4e00-\u9fff]{4}$/);

function lockedEvent(districtId: string, db: V11Db) {
  return db
    .select()
    .from(eventState)
    .where(and(eq(eventState.districtId, districtId), eq(eventState.id, 1)))
    .limit(1)
    .for("update");
}

async function keywordVersionView(versionId: number, db: V11Db = getDb()) {
  const version = (
    await db
      .select()
      .from(keywordVersions)
      .where(eq(keywordVersions.id, versionId))
      .limit(1)
  )[0];
  if (!version) return null;
  const cards = await db
    .select({
      status: keywordCards.status,
      errorMessage: keywordCards.errorMessage,
      updatedAt: keywordCards.updatedAt,
    })
    .from(keywordCards)
    .where(eq(keywordCards.versionId, versionId));
  const persistence = keywordPersistence(version.updatedAt, cards);
  // 内存任务只用于防止同进程重复启动，不代表数据库中的持久进度。
  return {
    ...version,
    cardCount: cards.length,
    batchError:
      cards.find(card => card.status === "failed")?.errorMessage ?? null,
    ...persistence,
    frequencies: await keywordFrequencies(versionId, db),
    generating: keywordGenerationRunning(versionId),
  };
}

async function transitionMessage(
  phase: string,
  step: number,
  topCount: number
) {
  if (phase === "predict-reveal" && step < topCount)
    return `已揭晓 ${step + 1} / ${topCount} 个命中关键词`;
  return "已推进";
}

export const controlRouter = createRouter({
  state: publicQuery.query(async ({ ctx }) => {
    const actor = await requireOrganizer(ctx);
    const districtId = actor.districtId;
    const db = getDb();
    const state = await getEventState(districtId);
    const [formalCount, lockCount, memberCount, draftCount] = await Promise.all(
      [
        db
          .select({ value: count() })
          .from(nominations)
          .where(eq(nominations.districtId, districtId)),
        db
          .select({ value: count() })
          .from(submissionStates)
          .where(eq(submissionStates.districtId, districtId)),
        db
          .select({ value: count() })
          .from(districtMembers)
          .innerJoin(members, eq(members.id, districtMembers.memberId))
          .where(
            and(
              eq(districtMembers.districtId, districtId),
              eq(districtMembers.active, true),
              eq(members.role, "member")
            )
          ),
        db
          .select({ value: count() })
          .from(drafts)
          .where(eq(drafts.districtId, districtId)),
      ]
    );
    const run = await getActiveRun(districtId, state.gameMode, db, false);
    const snapshot = await getSnapshot(districtId, db);
    // 组织者实时审计与固定游戏快照是两条独立数据源。
    const liveCards = await listCards(districtId, db);
    const cards = snapshot ? await listSnapshotCards(districtId, db) : [];
    const riddleState = run
      ? await ensureRiddleState(run.id, districtId, db)
      : null;
    const currentRiddle =
      run &&
      [
        "riddle",
        "predict",
        "predict-reveal",
        "match",
        "rank",
        "award",
      ].includes(state.phase)
        ? await riddleView(run.id, districtId, db)
        : null;
    const used = new Set(riddleState?.usedCardIds ?? []);
    const recipientCounts = new Map<number, number>();
    for (const card of cards)
      recipientCounts.set(
        card.recipientId,
        (recipientCounts.get(card.recipientId) ?? 0) + 1
      );
    const recipients = (await listDistrictMembers(districtId, db))
      .filter(member => (recipientCounts.get(member.id) ?? 0) > 0)
      .map(member => ({
        ...member,
        count: recipientCounts.get(member.id) ?? 0,
      }));
    const [draftVersion, publishedVersion] = await Promise.all([
      latestKeywordVersion(districtId, "draft", db),
      latestKeywordVersion(districtId, "published", db),
    ]);
    const selectedVersion = draftVersion ?? publishedVersion;
    const keywordView = selectedVersion
      ? await keywordVersionView(selectedVersion.id, db)
      : null;
    const publishedFrequencies = publishedVersion
      ? await keywordFrequencies(publishedVersion.id, db)
      : [];
    const scoreRows = run
      ? await db
          .select({
            memberId: scoresV11.memberId,
            predict: scoresV11.predict,
            riddle: scoresV11.riddle,
            match: scoresV11.match,
            total: scoresV11.total,
            name: members.name,
          })
          .from(scoresV11)
          .innerJoin(members, eq(scoresV11.memberId, members.id))
          .where(eq(scoresV11.runId, run.id))
          .orderBy(desc(scoresV11.total))
      : [];
    const audits = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
        actorName: members.name,
      })
      .from(auditLogs)
      .innerJoin(members, eq(auditLogs.actorId, members.id))
      .where(eq(auditLogs.districtId, districtId))
      .orderBy(desc(auditLogs.id))
      .limit(20);
    const competition = await getLeaderboardV11(
      districtId,
      run?.id ?? null,
      db
    );
    const matchWall = run
      ? await db
          .select({
            memberId: matchGamesV11.memberId,
            finishedAt: matchGamesV11.finishedAt,
          })
          .from(matchGamesV11)
          .where(eq(matchGamesV11.runId, run.id))
      : [];
    return {
      ...state,
      runId: run?.id ?? null,
      stats: {
        submitted: lockCount[0]?.value ?? 0,
        total: memberCount[0]?.value ?? 0,
        cards: formalCount[0]?.value ?? 0,
        drafts: draftCount[0]?.value ?? 0,
      },
      snapshot: snapshot
        ? {
            id: snapshot.id,
            cardCount: snapshot.cardCount,
            contentHash: snapshot.contentHash,
            createdAt: snapshot.createdAt,
          }
        : null,
      liveCards: liveCards.map(card => ({
        id: card.id,
        reason: card.reason,
        authorId: card.authorId,
        authorName: card.authorName,
        recipientId: card.recipientId,
        recipientName: card.recipientName,
        anonymous: card.anonymous,
        submittedAt: card.submittedAt,
      })),
      riddle: {
        readOnly: state.phase !== "riddle",
        state: currentRiddle,
        usedCount: used.size,
        recipients,
        cards: cards.map(card => ({
          id: card.id,
          reason: card.reason,
          recipientId: card.recipientId,
          recipientName: card.recipientName,
          anonymous: card.anonymous,
          used: used.has(card.id),
          selected: riddleState?.currentCardId === card.id,
        })),
      },
      keywords: {
        llmConfigured: llmConfigured(),
        publishedVersion: publishedVersion?.version ?? null,
        draftVersion: draftVersion?.version ?? null,
        version: keywordView,
        candidates: publishedFrequencies,
      },
      predict: {
        boundVersion: run?.keywordVersionId ?? null,
        top: run?.keywordVersionId
          ? await topKeywordsWithTies(run.keywordVersionId, db)
          : [],
      },
      match: { endsAt: run?.matchEndsAt ?? null, wall: matchWall },
      scores: scoreRows,
      audits,
      winners: competition.winners,
      selfQuotes: await getSelfQuotes(districtId),
      leaderboard: competition,
      canClearTrial: state.gameMode === "trial" && state.phase !== "collect",
    };
  }),

  endCollect: publicMutation
    .input(z.object({ confirmation: z.literal("结束收集") }))
    .mutation(async ({ ctx }) => {
      const actor = await requireOrganizer(ctx);
      const districtId = actor.districtId;
      const db = getDb();
      return db.transaction(async tx => {
        const state = (await lockedEvent(districtId, tx))[0];
        if (state?.phase !== "collect")
          throw new TRPCError({
            code: "CONFLICT",
            message: "欣赏收集已经截止，不能重复操作",
          });
        if (await getSnapshot(districtId, tx))
          throw new TRPCError({
            code: "CONFLICT",
            message: "本场正式卡快照已经存在",
          });
        const cards = await tx
          .select()
          .from(nominations)
          .where(eq(nominations.districtId, districtId))
          .orderBy(nominations.id)
          .for("update");
        const contentHash = createHash("sha256")
          .update(
            JSON.stringify(
              cards.map(card => [
                card.id,
                card.authorId,
                card.recipientId,
                card.reason,
                card.anonymous,
              ])
            )
          )
          .digest("hex");
        const inserted = await tx
          .insert(collectionSnapshots)
          .values({ districtId, contentHash, cardCount: cards.length })
          .$returningId();
        const snapshotId = inserted[0].id;
        if (cards.length > 0) {
          await tx.insert(snapshotCards).values(
            cards.map(card => ({
              districtId,
              snapshotId,
              nominationId: card.id,
              authorId: card.authorId,
              recipientId: card.recipientId,
              reason: card.reason,
              anonymous: card.anonymous,
              submittedAt: card.submittedAt,
            }))
          );
        }
        await getActiveRun(districtId, state.gameMode, tx);
        await updateEventPhase(districtId, "prepare", 0, tx);
        await tx.insert(auditLogs).values({
          districtId,
          actorId: actor.id,
          action: "end-collect-v11",
          details: { snapshotId, cardCount: cards.length, contentHash },
        });
        return { ok: true, snapshotId, cardCount: cards.length };
      });
    }),

  setGameMode: publicMutation
    .input(z.object({ mode: z.enum(GAME_MODES) }))
    .mutation(async ({ ctx, input }) => {
      const actor = await requireOrganizer(ctx);
      const districtId = actor.districtId;
      const db = getDb();
      return db.transaction(async tx => {
        const state = (await lockedEvent(districtId, tx))[0];
        if (state?.phase !== "prepare")
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "只有现场筹备状态可以切换试玩／正式成绩模式",
          });
        await tx
          .update(eventState)
          .set({
            gameMode: input.mode,
            revision: state.revision + 1,
            updatedAt: new Date(),
          })
          .where(
            and(eq(eventState.districtId, districtId), eq(eventState.id, 1))
          );
        const run = await getActiveRun(districtId, input.mode, tx);
        await tx.insert(auditLogs).values({
          districtId,
          actorId: actor.id,
          action: "set-game-mode",
          details: { mode: input.mode, runId: run?.id },
        });
        return { ok: true, mode: input.mode };
      });
    }),

  importLocalSuggestions: publicMutation
    .input(localKeywordSuggestionsSchema)
    .mutation(async ({ ctx, input }) => {
      const actor = await requireOrganizer(ctx);
      const districtId = actor.districtId;
      const db = getDb();
      return db.transaction(async tx => {
        const state = (await lockedEvent(districtId, tx))[0];
        if (!state || state.phase === "collect")
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "请先结束欣赏收集并固定快照，再导入本地建议稿",
          });
        const snapshot = (
          await tx
            .select()
            .from(collectionSnapshots)
            .where(eq(collectionSnapshots.districtId, districtId))
            .limit(1)
            .for("update")
        )[0];
        if (!snapshot)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "正式卡快照不存在，不能导入本地建议稿",
          });
        if (
          (await latestKeywordVersion(districtId, "draft", tx)) ||
          (await latestKeywordVersion(districtId, "published", tx))
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "已有关键词草稿或发布版，请保留既有审核工作，不能导入覆盖",
          });
        }
        const snapshotRows = await tx
          .select({
            id: snapshotCards.id,
            nominationId: snapshotCards.nominationId,
          })
          .from(snapshotCards)
          .where(
            and(
              eq(snapshotCards.districtId, districtId),
              eq(snapshotCards.snapshotId, snapshot.id)
            )
          )
          .for("update");
        const mismatch = localImportMismatch(
          input,
          snapshotRows.map(card => card.nominationId)
        );
        if (mismatch)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: mismatch,
          });
        const latest = (
          await tx
            .select({ version: keywordVersions.version })
            .from(keywordVersions)
            .where(eq(keywordVersions.districtId, districtId))
            .orderBy(desc(keywordVersions.version))
            .limit(1)
        )[0];
        const version = (latest?.version ?? 0) + 1;
        const inserted = await tx
          .insert(keywordVersions)
          .values({
            districtId,
            snapshotId: snapshot.id,
            version,
            status: "draft",
          })
          .$returningId();
        const versionId = inserted[0].id;
        const suggestions = new Map(
          input.suggestions.map(card => [card.nominationId, card.tags])
        );
        if (snapshotRows.length > 0) {
          await tx.insert(keywordCards).values(
            snapshotRows.map(card => ({
              districtId,
              versionId,
              snapshotCardId: card.id,
              status: "ok" as const,
              tags: suggestions.get(card.nominationId)!,
              errorMessage: null,
            }))
          );
        }
        await tx.insert(auditLogs).values({
          districtId,
          actorId: actor.id,
          action: "import-local-keywords",
          details: {
            cardCount: snapshotRows.length,
            version,
            source: "local-ai",
          },
        });
        return {
          ok: true as const,
          versionId,
          version,
          cardCount: snapshotRows.length,
          message: `已导入${snapshotRows.length}卡建议，请审核整组标签并发布`,
        };
      });
    }),

  generateKeywords: publicMutation
    .input(z.object({ onlyFailed: z.boolean().default(false) }))
    .mutation(async ({ ctx }) => {
      const actor = await requireOrganizer(ctx);
      const districtId = actor.districtId;
      const db = getDb();
      const result = await db.transaction(async tx => {
        const state = (await lockedEvent(districtId, tx))[0];
        if (!state || state.phase === "collect")
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "请先结束欣赏收集并固定快照",
          });
        const snapshot = await getSnapshot(districtId, tx);
        if (!snapshot)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "正式卡快照不存在",
          });
        let draft = await latestKeywordVersion(districtId, "draft", tx);
        if (!draft) {
          if (await latestKeywordVersion(districtId, "published", tx))
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "请先复制当前发布版为新修订稿",
            });
          const latest = (
            await tx
              .select({ version: keywordVersions.version })
              .from(keywordVersions)
              .where(eq(keywordVersions.districtId, districtId))
              .orderBy(desc(keywordVersions.version))
              .limit(1)
          )[0];
          const inserted = await tx
            .insert(keywordVersions)
            .values({
              districtId,
              snapshotId: snapshot.id,
              version: (latest?.version ?? 0) + 1,
            })
            .$returningId();
          const cards = await listSnapshotCards(districtId, tx);
          if (cards.length > 0)
            await tx.insert(keywordCards).values(
              cards.map(card => ({
                districtId,
                versionId: inserted[0].id,
                snapshotCardId: card.snapshotCardId,
                tags: [],
              }))
            );
          draft = (
            await tx
              .select()
              .from(keywordVersions)
              .where(eq(keywordVersions.id, inserted[0].id))
              .limit(1)
          )[0];
        }
        await tx.insert(auditLogs).values({
          districtId,
          actorId: actor.id,
          action: "generate-keywords",
          details: {
            versionId: draft.id,
            scope: "snapshot-batch",
            configured: llmConfigured(),
          },
        });
        return { versionId: draft.id, configured: llmConfigured() };
      });
      if (!result.configured)
        return {
          ok: false as const,
          configured: false as const,
          versionId: result.versionId,
        };
      const started = startKeywordGeneration(result.versionId);
      return {
        ok: true as const,
        configured: true as const,
        started,
        versionId: result.versionId,
      };
    }),

  copyKeywords: publicMutation.mutation(async ({ ctx }) => {
    const actor = await requireOrganizer(ctx);
    const districtId = actor.districtId;
    const db = getDb();
    return db.transaction(async tx => {
      await lockedEvent(districtId, tx);
      if (await latestKeywordVersion(districtId, "draft", tx))
        throw new TRPCError({ code: "CONFLICT", message: "已有未发布修订稿" });
      const published = await latestKeywordVersion(districtId, "published", tx);
      if (!published)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "还没有已发布关键词版本",
        });
      const inserted = await tx
        .insert(keywordVersions)
        .values({
          districtId,
          snapshotId: published.snapshotId,
          version: published.version + 1,
        })
        .$returningId();
      const source = await tx
        .select()
        .from(keywordCards)
        .where(eq(keywordCards.versionId, published.id));
      if (source.length > 0)
        await tx.insert(keywordCards).values(
          source.map(card => ({
            districtId,
            versionId: inserted[0].id,
            snapshotCardId: card.snapshotCardId,
            status: card.status,
            tags: card.tags,
          }))
        );
      await tx.insert(auditLogs).values({
        districtId,
        actorId: actor.id,
        action: "copy-keywords",
        details: { from: published.version, to: published.version + 1 },
      });
      return { ok: true, version: published.version + 1 };
    });
  }),

  editKeywordCard: publicMutation
    .input(
      z.object({
        keywordCardId: z.number().int().positive(),
        labels: z.array(fourChinese).max(3),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const actor = await requireOrganizer(ctx);
      const db = getDb();
      await db.transaction(async tx => {
        const row = (
          await tx
            .select({
              id: keywordCards.id,
              versionId: keywordCards.versionId,
              tags: keywordCards.tags,
            })
            .from(keywordCards)
            .where(eq(keywordCards.id, input.keywordCardId))
            .limit(1)
            .for("update")
        )[0];
        if (!row)
          throw new TRPCError({ code: "NOT_FOUND", message: "关键词卡不存在" });
        const version = (
          await tx
            .select()
            .from(keywordVersions)
            .where(eq(keywordVersions.id, row.versionId))
            .limit(1)
        )[0];
        if (
          !version ||
          version.districtId !== actor.districtId ||
          version.status !== "draft"
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "只能编辑本场未发布修订稿",
          });
        if (keywordGenerationRunning(version.id))
          throw new TRPCError({
            code: "CONFLICT",
            message: "生成进行中，请完成后再审核",
          });
        const labels = [...new Set(input.labels)];
        const rationale = new Map(
          row.tags.map(tag => [tag.label, tag.rationale])
        );
        await tx
          .update(keywordCards)
          .set({
            tags: labels.map(label => ({
              label,
              rationale: rationale.get(label) ?? "组织者审核修改",
            })),
            status: "ok",
            errorMessage: null,
          })
          .where(eq(keywordCards.id, row.id));
        await tx.insert(auditLogs).values({
          districtId: actor.districtId,
          actorId: actor.id,
          action: "edit-keyword-card",
          details: { keywordCardId: row.id, labels },
        });
      });
      return { ok: true };
    }),

  mergeKeywords: publicMutation
    .input(z.object({ source: fourChinese, target: fourChinese }))
    .mutation(async ({ ctx, input }) => {
      const actor = await requireOrganizer(ctx);
      const db = getDb();
      await db.transaction(async tx => {
        const draft = await latestKeywordVersion(actor.districtId, "draft", tx);
        if (!draft)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "没有可编辑修订稿",
          });
        if (keywordGenerationRunning(draft.id))
          throw new TRPCError({
            code: "CONFLICT",
            message: "生成进行中，请完成后再合并",
          });
        if (input.source === input.target) return;
        const rows = await tx
          .select()
          .from(keywordCards)
          .where(eq(keywordCards.versionId, draft.id))
          .for("update");
        for (const row of rows) {
          const rationale = new Map(
            row.tags.map(tag => [tag.label, tag.rationale])
          );
          const tags = normalizeKeywordTags(
            row.tags.map(tag => ({
              label: tag.label === input.source ? input.target : tag.label,
              rationale:
                tag.label === input.target
                  ? tag.rationale
                  : (rationale.get(input.target) ?? tag.rationale),
            }))
          );
          await tx
            .update(keywordCards)
            .set({ tags })
            .where(eq(keywordCards.id, row.id));
        }
        await tx.insert(auditLogs).values({
          districtId: actor.districtId,
          actorId: actor.id,
          action: "merge-keywords",
          details: {
            versionId: draft.id,
            source: input.source,
            target: input.target,
          },
        });
      });
      return { ok: true };
    }),

  publishKeywords: publicMutation.mutation(async ({ ctx }) => {
    const actor = await requireOrganizer(ctx);
    const districtId = actor.districtId;
    const db = getDb();
    return db.transaction(async tx => {
      const state = (await lockedEvent(districtId, tx))[0];
      if (!state || !["prepare", "riddle"].includes(state.phase))
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "预言开考后不能替换关键词版本",
        });
      const draft = await latestKeywordVersion(districtId, "draft", tx);
      if (!draft)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "没有待发布修订稿",
        });
      if (keywordGenerationRunning(draft.id))
        throw new TRPCError({
          code: "CONFLICT",
          message: "关键词仍在生成，不能发布",
        });
      const cards = await tx
        .select({ status: keywordCards.status })
        .from(keywordCards)
        .where(eq(keywordCards.versionId, draft.id))
        .for("update");
      if (cards.some(card => card.status !== "ok"))
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "整组关键词尚未生成完成，请等待或整批重试",
        });
      const candidates = await keywordFrequencies(draft.id, tx);
      if (candidates.length < 5)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "不同关键词不足 5 个，不能发布或开考",
        });
      await tx
        .update(keywordVersions)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(keywordVersions.id, draft.id));
      await tx.insert(auditLogs).values({
        districtId,
        actorId: actor.id,
        action: "publish-keywords",
        details: {
          versionId: draft.id,
          version: draft.version,
          candidates: candidates.length,
        },
      });
      return {
        ok: true,
        version: draft.version,
        candidates: candidates.length,
      };
    });
  }),

  selectRiddle: publicMutation
    .input(z.object({ nominationId: z.number().int().positive().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const actor = await requireOrganizer(ctx);
      const districtId = actor.districtId;
      const db = getDb();
      return db.transaction(async tx => {
        const state = (await lockedEvent(districtId, tx))[0];
        if (state?.phase !== "riddle")
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "当前不在真心话抢答环节",
          });
        const run = await getActiveRun(districtId, state.gameMode, tx);
        const riddle = await ensureRiddleState(run!.id, districtId, tx);
        if (["answering", "closed"].includes(effectiveRiddleStatus(riddle)))
          throw new TRPCError({
            code: "CONFLICT",
            message: "请先揭晓当前题，再指定下一题",
          });
        const cards = await listSnapshotCards(districtId, tx);
        const available = cards.filter(
          card => !riddle.usedCardIds.includes(card.id)
        );
        const card =
          input.nominationId === null
            ? available[Math.floor(Math.random() * available.length)]
            : available.find(item => item.id === input.nominationId);
        if (!card)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              available.length === 0
                ? "全部正式卡已用完，没有虚构替代题"
                : "该卡已使用或不在快照中",
          });
        await tx
          .update(riddleStatesV11)
          .set({
            currentCardId: card.id,
            status: "ready",
            startsAt: null,
            endsAt: null,
          })
          .where(eq(riddleStatesV11.runId, run!.id));
        return { ok: true, nominationId: card.id };
      });
    }),

  startRiddleAnswer: publicMutation.mutation(async ({ ctx }) => {
    const actor = await requireOrganizer(ctx);
    const districtId = actor.districtId;
    const db = getDb();
    return db.transaction(async tx => {
      const state = (await lockedEvent(districtId, tx))[0];
      if (state?.phase !== "riddle")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "当前不在真心话抢答环节",
        });
      const run = await getActiveRun(districtId, state.gameMode, tx);
      const riddle = (
        await tx
          .select()
          .from(riddleStatesV11)
          .where(eq(riddleStatesV11.runId, run!.id))
          .limit(1)
          .for("update")
      )[0];
      if (!riddle?.currentCardId || riddle.status !== "ready")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "请先指定一张未用正式卡",
        });
      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + 30000);
      await tx
        .update(riddleStatesV11)
        .set({ status: "answering", startsAt, endsAt })
        .where(eq(riddleStatesV11.id, riddle.id));
      return { ok: true, startsAt, endsAt };
    });
  }),

  closeRiddleAnswer: publicMutation.mutation(async ({ ctx }) => {
    const actor = await requireOrganizer(ctx);
    const districtId = actor.districtId;
    const db = getDb();
    return db.transaction(async tx => {
      const state = (await lockedEvent(districtId, tx))[0];
      if (state?.phase !== "riddle")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "当前不在真心话抢答环节",
        });
      const run = await getActiveRun(districtId, state.gameMode, tx);
      const riddle = (
        await tx
          .select()
          .from(riddleStatesV11)
          .where(eq(riddleStatesV11.runId, run!.id))
          .limit(1)
          .for("update")
      )[0];
      if (
        !riddle ||
        !["answering", "closed"].includes(effectiveRiddleStatus(riddle))
      )
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "当前没有可截止的作答",
        });
      await tx
        .update(riddleStatesV11)
        .set({ status: "closed", endsAt: new Date() })
        .where(eq(riddleStatesV11.id, riddle.id));
      return { ok: true };
    });
  }),

  revealRiddle: publicMutation.mutation(async ({ ctx }) => {
    const actor = await requireOrganizer(ctx);
    const districtId = actor.districtId;
    const db = getDb();
    return db.transaction(async tx => {
      const state = (await lockedEvent(districtId, tx))[0];
      if (state?.phase !== "riddle")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "当前不在真心话抢答环节",
        });
      const run = await getActiveRun(districtId, state.gameMode, tx);
      const riddle = (
        await tx
          .select()
          .from(riddleStatesV11)
          .where(eq(riddleStatesV11.runId, run!.id))
          .limit(1)
          .for("update")
      )[0];
      if (!riddle?.currentCardId || effectiveRiddleStatus(riddle) !== "closed")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "请先结束作答，再揭晓被欣赏人",
        });
      await tx
        .update(riddleStatesV11)
        .set({
          status: "revealed",
          usedCardIds: [
            ...new Set([...riddle.usedCardIds, riddle.currentCardId]),
          ],
        })
        .where(eq(riddleStatesV11.id, riddle.id));
      return { ok: true };
    });
  }),

  startMatch: publicMutation.mutation(async ({ ctx }) => {
    const actor = await requireOrganizer(ctx);
    const districtId = actor.districtId;
    const db = getDb();
    return db.transaction(async tx => {
      const state = (await lockedEvent(districtId, tx))[0];
      if (state?.phase !== "match")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "当前不在欣赏连连看环节",
        });
      const run = await getActiveRun(districtId, state.gameMode, tx);
      if (run!.matchEndsAt)
        return { ok: true, endsAt: run!.matchEndsAt, idempotent: true };
      const startedAt = new Date();
      const endsAt = new Date(startedAt.getTime() + MATCH_SECONDS * 1000);
      await tx
        .update(gameRuns)
        .set({ matchStartedAt: startedAt, matchEndsAt: endsAt })
        .where(eq(gameRuns.id, run!.id));
      await tx
        .update(eventState)
        .set({
          matchEndsAt: endsAt,
          revision: state.revision + 1,
          updatedAt: new Date(),
        })
        .where(
          and(eq(eventState.districtId, districtId), eq(eventState.id, 1))
        );
      return { ok: true, endsAt, idempotent: false };
    });
  }),

  advance: publicMutation.mutation(async ({ ctx }) => {
    const actor = await requireOrganizer(ctx);
    const districtId = actor.districtId;
    const db = getDb();
    return db.transaction(async tx => {
      const state = (await lockedEvent(districtId, tx))[0];
      if (!state)
        throw new TRPCError({ code: "NOT_FOUND", message: "活动状态不存在" });
      const run = await getActiveRun(districtId, state.gameMode, tx);
      let message = "已推进";
      if (state.phase === "collect") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "请使用“结束欣赏收集”显式截止并固定快照",
        });
      } else if (state.phase === "prepare") {
        if (!(await getSnapshot(districtId, tx)))
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "请先固定正式卡快照",
          });
        await ensureRiddleState(run!.id, districtId, tx);
        await updateEventPhase(districtId, "riddle", 0, tx);
        message = "已进入真心话抢答；准备不等于开考";
      } else if (state.phase === "riddle") {
        const published = await latestKeywordVersion(
          districtId,
          "published",
          tx
        );
        if (
          !published ||
          (await keywordFrequencies(published.id, tx)).length < 5
        )
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "请先发布候选不少于 5 个的关键词版本",
          });
        const riddle = await ensureRiddleState(run!.id, districtId, tx);
        if (effectiveRiddleStatus(riddle) === "answering")
          throw new TRPCError({
            code: "CONFLICT",
            message: "请先结束当前作答",
          });
        await tx
          .update(riddleStatesV11)
          .set({ status: "ended" })
          .where(eq(riddleStatesV11.id, riddle.id));
        await tx
          .update(gameRuns)
          .set({ keywordVersionId: published.id })
          .where(eq(gameRuns.id, run!.id));
        await updateEventPhase(districtId, "predict", 0, tx);
        message = `真心话题库已只读；预言绑定关键词 V${published.version}`;
      } else if (state.phase === "predict") {
        await settlePredictionsV11(run!.id, districtId, tx);
        await updateEventPhase(districtId, "predict-reveal", 0, tx);
        message = "预言已截止并结算，开始揭晓 Top 5（含并列）";
      } else if (state.phase === "predict-reveal") {
        const top = run!.keywordVersionId
          ? await topKeywordsWithTies(run!.keywordVersionId, tx)
          : [];
        if (state.step < top.length) {
          const next = state.step + 1;
          await updateEventPhase(districtId, "predict-reveal", next, tx);
          message = await transitionMessage(
            state.phase,
            state.step,
            top.length
          );
        } else {
          await updateEventPhase(districtId, "match", 0, tx);
          message = "已进入连连看筹备，请单独启动全场 120 秒";
        }
      } else if (state.phase === "match") {
        if (!run!.matchEndsAt)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "请先启动全场统一 120 秒计时",
          });
        const games = await tx
          .select({ id: matchGamesV11.id })
          .from(matchGamesV11)
          .where(eq(matchGamesV11.runId, run!.id))
          .for("update");
        for (const game of games)
          await finishMatchV11(game.id, run!.id, districtId, "control", tx);
        await updateEventPhase(districtId, "rank", 0, tx);
        message = "连连看已结束，进入当前运行区的完整参与排行";
      } else if (state.phase === "rank") {
        await updateEventPhase(districtId, "award", 0, tx);
        message = "完整名单已公布，进入前三名次颁奖（含并列）";
      } else if (state.phase === "award") {
        const board = await getLeaderboardV11(districtId, run!.id, tx);
        const maxAwardRank =
          board.winners.length > 0
            ? Math.max(...board.winners.map(winner => winner.rank))
            : 0;
        if (state.step < maxAwardRank) {
          await updateEventPhase(districtId, "award", state.step + 1, tx);
          message = `已揭晓第 ${state.step + 1} 名次`;
        } else if (state.step === maxAwardRank) {
          await updateEventPhase(districtId, "award", maxAwardRank + 1, tx);
          message =
            maxAwardRank > 0
              ? "前三名次已全部揭晓"
              : "本场全 0 分，不设置获奖者";
        } else message = "典礼已完成";
      }
      await tx.insert(auditLogs).values({
        districtId,
        actorId: actor.id,
        action: "advance-v11",
        details: {
          from: state.phase,
          fromStep: state.step,
          mode: state.gameMode,
          message,
        },
      });
      return { ok: true, message };
    });
  }),

  clearTrial: publicMutation
    .input(z.object({ confirmation: z.literal("清除试玩") }))
    .mutation(async ({ ctx }) => {
      const actor = await requireOrganizer(ctx);
      const districtId = actor.districtId;
      const db = getDb();
      return db.transaction(async tx => {
        const state = (await lockedEvent(districtId, tx))[0];
        if (!state || state.gameMode !== "trial")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "正式成绩模式不提供试玩清理",
          });
        if (state.phase === "collect")
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "收集阶段没有试玩游戏记录",
          });
        const run = await getRun(districtId, "trial", tx, false);
        if (!run)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "当前试玩 run 不存在",
          });
        await tx
          .delete(matchAnswersV11)
          .where(eq(matchAnswersV11.runId, run.id));
        await tx.delete(matchGamesV11).where(eq(matchGamesV11.runId, run.id));
        await tx
          .delete(riddleAnswersV11)
          .where(eq(riddleAnswersV11.runId, run.id));
        await tx.delete(predictionsV11).where(eq(predictionsV11.runId, run.id));
        await tx.delete(scoresV11).where(eq(scoresV11.runId, run.id));
        await tx
          .delete(riddleStatesV11)
          .where(eq(riddleStatesV11.runId, run.id));
        await tx
          .update(gameRuns)
          .set({
            keywordVersionId: null,
            matchStartedAt: null,
            matchEndsAt: null,
          })
          .where(eq(gameRuns.id, run.id));
        await updateEventPhase(districtId, "prepare", 0, tx);
        await tx.insert(auditLogs).values({
          districtId,
          actorId: actor.id,
          action: "clear-trial-v11",
          details: {
            runId: run.id,
            preservedSnapshot: true,
            preservedKeywords: true,
          },
        });
        return { ok: true, runId: run.id };
      });
    }),

  export: publicQuery
    .input(z.object({ format: z.enum(["json", "csv"]) }))
    .query(async ({ ctx, input }) => {
      const actor = await requireOrganizer(ctx);
      const districtId = actor.districtId;
      const state = await getEventState(districtId);
      const cards = await listCards(districtId);
      const official = await getRun(districtId, "official", getDb(), false);
      const leaderboard = await getLeaderboardV11(
        districtId,
        official?.id ?? null
      );
      const winners = leaderboard.winners;
      const payload = {
        exportedAt: new Date().toISOString(),
        organizer: ORGANIZER_NAME,
        districtId,
        districtName: actor.districtName,
        phase: state.phase,
        cards,
        leaderboard,
        winners,
        selfQuotes: await getSelfQuotes(districtId),
      };
      const stamp = new Date().toISOString().slice(0, 10);
      if (input.format === "json")
        return {
          filename: `明日之星-${actor.districtName}-${stamp}.json`,
          content: JSON.stringify(payload, null, 2),
          mime: "application/json;charset=utf-8",
        };
      const escape = (value: unknown) =>
        `"${String(value ?? "").replaceAll('"', '""')}"`;
      const lines = [
        ["推荐ID", "推荐人", "被推荐人", "评语", "匿名", "关键词", "提交时间"]
          .map(escape)
          .join(","),
        ...cards.map(card =>
          [
            card.id,
            card.authorName,
            card.recipientName,
            card.reason,
            card.anonymous ? "是" : "否",
            card.keywords.join("、"),
            card.submittedAt.toISOString(),
          ]
            .map(escape)
            .join(",")
        ),
      ];
      return {
        filename: `明日之星-${actor.districtName}-${stamp}.csv`,
        content: `\uFEFF${lines.join("\r\n")}`,
        mime: "text/csv;charset=utf-8",
      };
    }),
});
