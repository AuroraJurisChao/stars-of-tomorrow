import { TRPCError } from "@trpc/server";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  districtMembers,
  districts,
  matchGamesV11,
  members,
  nominations,
  submissionStates,
} from "@db/schema";
import { DEFAULT_PUBLIC_DISTRICT_ID } from "@contracts/constants";
import { getEventState, getSelfQuotes } from "./domain";
import {
  getActiveRun,
  getLeaderboardV11,
  riddleView,
  topKeywordsWithTies,
} from "./v11";

const districtInput = z
  .object({ districtId: z.string().trim().min(1).max(64).optional() })
  .optional();

async function resolvePublicDistrict(requested?: string) {
  const rows = await getDb()
    .select({ id: districts.id, name: districts.name })
    .from(districts)
    .where(eq(districts.enabled, true))
    .orderBy(asc(districts.sortOrder));
  const district = requested
    ? rows.find(row => row.id === requested)
    : (rows.find(row => row.id === DEFAULT_PUBLIC_DISTRICT_ID) ?? rows[0]);
  if (!district)
    throw new TRPCError({ code: "NOT_FOUND", message: "该选区尚未开放大屏" });
  return district;
}

export const publicRouter = createRouter({
  screen: publicQuery.input(districtInput).query(async ({ input }) => {
    const db = getDb();
    const district = await resolvePublicDistrict(input?.districtId);
    const districtId = district.id;
    const state = await getEventState(districtId);
    const [locks, memberRows, cardCount] = await Promise.all([
      db
        .select({ value: count() })
        .from(submissionStates)
        .where(eq(submissionStates.districtId, districtId)),
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
            eq(members.role, "member")
          )
        )
        .orderBy(asc(districtMembers.pinyinKey)),
      db
        .select({ value: count() })
        .from(nominations)
        .where(eq(nominations.districtId, districtId)),
    ]);
    const submitted = locks[0]?.value ?? 0;
    const total = memberRows.length;
    const base = {
      step: state.step,
      revision: state.revision,
      districtId,
      districtName: district.name,
      stats: {
        submitted,
        total,
        cards: cardCount[0]?.value ?? 0,
        percentage: total === 0 ? 0 : Math.round((submitted / total) * 100),
      },
    };
    const run =
      state.phase === "collect"
        ? null
        : await getActiveRun(districtId, state.gameMode, db, false);
    if (state.phase === "predict-reveal") {
      const top = run?.keywordVersionId
        ? await topKeywordsWithTies(run.keywordVersionId, db)
        : [];
      return {
        ...base,
        phase: "predict-reveal" as const,
        keywords: top.map((item, index) => ({
          keyword: item.keyword,
          rank: index + 1,
          revealed: index < state.step,
        })),
        settled: true,
      };
    }
    if (state.phase === "riddle") {
      return {
        ...base,
        phase: "riddle" as const,
        riddle: run ? await riddleView(run.id, districtId, db) : null,
      };
    }
    if (state.phase === "match") {
      const games = run
        ? await db
            .select()
            .from(matchGamesV11)
            .where(eq(matchGamesV11.runId, run.id))
        : [];
      return {
        ...base,
        phase: "match" as const,
        matchEndsAt: run?.matchEndsAt ?? null,
        wall: memberRows.map(member => ({
          id: member.id,
          name: member.name,
          finished: games.some(
            game => game.memberId === member.id && game.finishedAt
          ),
        })),
      };
    }
    if (state.phase === "rank") {
      const board = await getLeaderboardV11(districtId, run?.id ?? null, db);
      return {
        ...base,
        phase: "rank" as const,
        leaderboard: board.leaderboard,
      };
    }
    if (state.phase === "award") {
      const board = await getLeaderboardV11(districtId, run?.id ?? null, db);
      const winnerNames = new Set(board.winners.map(winner => winner.name));
      const selfQuotes = await getSelfQuotes(districtId);
      return {
        ...base,
        phase: "award" as const,
        leaderboard: board.leaderboard,
        winners: board.winners,
        selfQuotes: selfQuotes.filter(quote => winnerNames.has(quote.name)),
      };
    }
    if (state.phase === "prepare")
      return { ...base, phase: "prepare" as const };
    if (state.phase === "predict")
      return { ...base, phase: "predict" as const };
    return { ...base, phase: "collect" as const };
  }),

  health: publicQuery.input(districtInput).query(async ({ input }) => {
    const db = getDb();
    const district = await resolvePublicDistrict(input?.districtId);
    const state = await getEventState(district.id);
    const [cardRows, accountRows, configured, enabled] = await Promise.all([
      db
        .select({ id: nominations.id })
        .from(nominations)
        .where(eq(nominations.districtId, district.id))
        .limit(1),
      db
        .select({ id: districtMembers.id })
        .from(districtMembers)
        .where(
          and(
            eq(districtMembers.districtId, district.id),
            eq(districtMembers.active, true)
          )
        ),
      db.select({ id: districts.id }).from(districts),
      db
        .select({ id: districts.id })
        .from(districts)
        .where(eq(districts.enabled, true)),
    ]);
    return {
      ok: true,
      districtId: district.id,
      phase: state.phase,
      empty: cardRows.length === 0,
      accounts: accountRows.length,
      districtsConfigured: configured.length,
      enabledDistricts: enabled.length,
    };
  }),
});
