import { TRPCError } from "@trpc/server";
import { alias } from "drizzle-orm/mysql-core";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import {
  districtMembers,
  eventState,
  matchAnswers,
  matchGames,
  members,
  nominations,
  predictions,
  riddleAnswers,
  riddleSets,
  scores,
} from "@db/schema";
import { comparePinyin, MATCH_SECONDS, PHASES, type Phase } from "@contracts/constants";

type DomainDb = Pick<ReturnType<typeof getDb>, "select" | "insert" | "update" | "delete">;

const POSITIVE_WORDS = [
  "责任感", "团队精神", "执行力", "领导力", "创造力", "专业", "真诚", "温暖", "负责", "细心",
  "耐心", "高效", "担当", "坚韧", "乐观", "善良", "热情", "严谨", "可靠", "用心", "敬业",
  "协作", "主动", "勇敢", "智慧", "聪明", "勤奋", "努力", "积极", "踏实", "幽默", "包容",
  "体贴", "坚定", "细致", "周全", "稳重", "敏锐", "清晰", "利他", "坦诚", "谦逊", "卓越",
  "优秀", "安心", "信任", "支持", "闪光", "温柔", "创新", "靠谱", "亲和", "果断", "勤奋",
] as const;

export function extractKeywords(reason: string) {
  const found: { word: string; index: number }[] = [];
  for (const word of [...POSITIVE_WORDS].sort((a, b) => b.length - a.length)) {
    const index = reason.indexOf(word);
    if (index >= 0) found.push({ word, index });
  }
  found.sort((a, b) => a.index - b.index || b.word.length - a.word.length);
  const accepted: { word: string; index: number }[] = [];
  for (const candidate of found) {
    const start = candidate.index;
    const end = start + candidate.word.length;
    if (!accepted.some((item) => start < item.index + item.word.length && end > item.index)) {
      accepted.push(candidate);
    }
    if (accepted.length === 3) break;
  }
  return accepted.map((item) => item.word);
}

export async function getEventState(districtId: string, db: DomainDb = getDb()) {
  const scope = and(eq(eventState.districtId, districtId), eq(eventState.id, 1));
  const rows = await db.select().from(eventState).where(scope).limit(1);
  if (!rows[0]) {
    await db.insert(eventState).values({ districtId, id: 1, phase: "collect", step: 0, payload: {} }).onDuplicateKeyUpdate({ set: { districtId } });
    return (await db.select().from(eventState).where(scope).limit(1))[0];
  }
  return rows[0];
}

export async function listCards(districtId: string, db: DomainDb = getDb()) {
  const author = alias(members, "author");
  const recipient = alias(members, "recipient");
  return db
    .select({
      id: nominations.id,
      districtId: nominations.districtId,
      authorId: nominations.authorId,
      recipientId: nominations.recipientId,
      reason: nominations.reason,
      anonymous: nominations.anonymous,
      keywords: nominations.keywords,
      submittedAt: nominations.submittedAt,
      updatedAt: nominations.updatedAt,
      authorName: author.name,
      recipientName: recipient.name,
      authorPinyin: author.pinyinKey,
      recipientPinyin: recipient.pinyinKey,
    })
    .from(nominations)
    .innerJoin(author, eq(nominations.authorId, author.id))
    .innerJoin(recipient, eq(nominations.recipientId, recipient.id))
    .where(eq(nominations.districtId, districtId))
    .orderBy(asc(nominations.id));
}

export type CardWithNames = Awaited<ReturnType<typeof listCards>>[number];

export function publicCard(card: CardWithNames) {
  return {
    id: card.id,
    recipientName: card.recipientName,
    reason: card.reason,
    anonymous: card.anonymous,
    authorName: card.anonymous ? "匿名同事" : card.authorName,
    keywords: card.keywords,
    submittedAt: card.submittedAt,
  };
}

export async function keywordStats(districtId: string, cards?: CardWithNames[]) {
  const source = cards ?? (await listCards(districtId));
  const values = new Map<string, { keyword: string; count: number; firstId: number }>();
  for (const card of source) {
    for (const keyword of new Set(card.keywords)) {
      const current = values.get(keyword);
      if (current) current.count += 1;
      else values.set(keyword, { keyword, count: 1, firstId: card.id });
    }
  }
  return [...values.values()].sort((a, b) => b.count - a.count || a.firstId - b.firstId).slice(0, 10);
}

export async function recomputeScore(districtId: string, memberId: number, db: DomainDb = getDb()) {
  const predictionRows = await db.select().from(predictions).where(and(eq(predictions.districtId, districtId), eq(predictions.memberId, memberId))).limit(1);
  const riddleRows = await db.select().from(riddleAnswers).where(and(eq(riddleAnswers.districtId, districtId), eq(riddleAnswers.memberId, memberId)));
  const matchRows = await db.select().from(matchGames).where(and(eq(matchGames.districtId, districtId), eq(matchGames.memberId, memberId))).limit(1);
  const predict = predictionRows[0]?.settledAt ? predictionRows[0].score : 0;
  const riddle = riddleRows.reduce((sum, row) => sum + row.score, 0);
  const match = matchRows[0]?.finishedAt ? matchRows[0].totalScore : 0;
  const total = predict + riddle + match;
  await db.insert(scores).values({ districtId, memberId, predict, riddle, match, total }).onDuplicateKeyUpdate({ set: { predict, riddle, match, total } });
  return { predict, riddle, match, total };
}

export async function settlePredictions(districtId: string, db: DomainDb = getDb()) {
  const top5 = new Set((await keywordStats(districtId, await listCards(districtId, db))).slice(0, 5).map((item) => item.keyword));
  const rows = await db.select().from(predictions).where(eq(predictions.districtId, districtId));
  for (const row of rows) {
    const hits = new Set(row.picks.filter((pick) => top5.has(pick))).size;
    const score = hits * 50 + (hits === 3 ? 50 : 0);
    await db.update(predictions).set({ score, settledAt: new Date() }).where(and(eq(predictions.districtId, districtId), eq(predictions.id, row.id)));
    await recomputeScore(districtId, row.memberId, db);
  }
}

export async function getLeaderboard(districtId: string, db: DomainDb = getDb()) {
  const rows = await db
    .select({
      id: members.id,
      name: members.name,
      pinyinKey: districtMembers.pinyinKey,
      predict: scores.predict,
      riddle: scores.riddle,
      match: scores.match,
      total: scores.total,
    })
    .from(districtMembers)
    .innerJoin(members, eq(members.id, districtMembers.memberId))
    .leftJoin(scores, and(eq(members.id, scores.memberId), eq(scores.districtId, districtId)))
    .where(and(eq(districtMembers.districtId, districtId), eq(districtMembers.active, true), eq(members.role, "member")))
    .orderBy(asc(districtMembers.pinyinKey));
  const normalized = rows.map((row) => ({
    ...row,
    predict: row.predict ?? 0,
    riddle: row.riddle ?? 0,
    match: row.match ?? 0,
    total: row.total ?? 0,
  }));
  if (!normalized.some((row) => row.total > 0)) return { leaderboard: [], heart: [] };
  const descending = [...normalized].sort((a, b) => b.total - a.total || comparePinyin(a, b));
  return {
    leaderboard: [...descending].reverse(),
    heart: descending.filter((row) => row.match > 0).sort((a, b) => b.match - a.match || b.total - a.total || comparePinyin(a, b)).slice(0, 3),
  };
}

export async function getAwardWinners(districtId: string, db: DomainDb = getDb()) {
  const cards = await listCards(districtId, db);
  if (cards.length === 0) return [];
  const stats = await keywordStats(districtId, cards);
  const top5 = new Map(stats.slice(0, 5).map((item) => [item.keyword, item.count]));
  const memberRows = await db.select({ id: members.id, name: members.name, pinyinKey: districtMembers.pinyinKey }).from(districtMembers)
    .innerJoin(members, eq(members.id, districtMembers.memberId))
    .where(and(eq(districtMembers.districtId, districtId), eq(districtMembers.active, true), eq(members.role, "member")));
  const values = memberRows.map((member) => {
    const received = cards.filter((card) => card.recipientId === member.id);
    const value = received.reduce(
      (sum, card) => sum + card.keywords.reduce((inner, keyword) => inner + (top5.get(keyword) ?? 0), 0),
      0,
    );
    return { id: member.id, name: member.name, pinyinKey: member.pinyinKey, received: received.length, value };
  });
  return values
    .filter((item) => item.received > 0)
    .sort((a, b) => b.value - a.value || b.received - a.received || comparePinyin(a, b))
    .slice(0, 2)
    .map((winner) => ({
      ...winner,
      cards: cards.filter((card) => card.recipientId === winner.id).map(publicCard),
    }));
}

export async function getSelfQuotes(districtId: string, db: DomainDb = getDb()) {
  const cards = await listCards(districtId, db);
  return cards
    .filter((card) => !card.anonymous && card.authorId === card.recipientId)
    .map((card) => ({ name: card.authorName, reason: card.reason }));
}

export async function setPhase(districtId: string, phase: Phase, step = 0, payload: Record<string, unknown> = {}, db: DomainDb = getDb()) {
  if (!PHASES.includes(phase)) throw new TRPCError({ code: "BAD_REQUEST", message: "未知活动环节" });
  const current = await getEventState(districtId, db);
  const enteringMatch = phase === "match" && current.phase !== "match";
  await db.update(eventState).set({
    phase,
    step,
    payload,
    revision: current.revision + 1,
    matchEndsAt: enteringMatch ? new Date(Date.now() + MATCH_SECONDS * 1000) : phase === "match" ? current.matchEndsAt : null,
    matchExtraUsed: phase === "match" && current.phase === "match" ? current.matchExtraUsed : false,
  }).where(and(eq(eventState.districtId, districtId), eq(eventState.id, 1)));
  if (["predict-reveal", "riddle", "match", "rank", "award"].includes(phase)) await settlePredictions(districtId, db);
  return getEventState(districtId, db);
}

export async function ensureRiddleSet(districtId: string, db: DomainDb = getDb()) {
  const existing = await db.select().from(riddleSets).where(eq(riddleSets.districtId, districtId)).orderBy(asc(riddleSets.position));
  if (existing.length > 0) return existing;
  const cards = await listCards(districtId, db);
  if (cards.length === 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "暂无真实推荐，不能生成谜面" });
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const selected = cards.slice(0, 5);
  for (const [position, card] of selected.entries()) {
    await db.insert(riddleSets).values({ districtId, nominationId: card.id, position });
  }
  return db.select().from(riddleSets).where(eq(riddleSets.districtId, districtId)).orderBy(asc(riddleSets.position));
}

export async function currentRiddle(districtId: string, state?: Awaited<ReturnType<typeof getEventState>>, db: DomainDb = getDb()) {
  const currentState = state ?? await getEventState(districtId, db);
  const rows = await db.select().from(riddleSets).where(and(eq(riddleSets.districtId, districtId), eq(riddleSets.position, currentState.step))).limit(1);
  if (!rows[0]) return null;
  const cards = await listCards(districtId, db);
  const card = cards.find((item) => item.id === rows[0].nominationId);
  if (!card) return null;
  const answers = await db.select().from(riddleAnswers).where(and(eq(riddleAnswers.districtId, districtId), eq(riddleAnswers.nominationId, card.id)));
  const reveal = typeof currentState.payload.reveal === "string" ? currentState.payload.reveal : undefined;
  return {
    id: card.id,
    position: currentState.step,
    reveal,
    reason: reveal ? card.reason : null,
    recipientName: reveal === "to" || reveal === "from" ? card.recipientName : null,
    authorName: reveal === "from" ? card.anonymous ? "匿名同事" : card.authorName : null,
    answerCount: answers.length,
  };
}

export async function finishMatchGame(districtId: string, gameId: number, db: DomainDb = getDb()) {
  const gameRows = await db.select().from(matchGames).where(and(eq(matchGames.districtId, districtId), eq(matchGames.id, gameId))).limit(1);
  const game = gameRows[0];
  if (!game || game.finishedAt) return game;
  const answers = await db.select().from(matchAnswers).where(and(eq(matchAnswers.districtId, districtId), eq(matchAnswers.gameId, gameId)));
  const allSolved = game.cardIds.length > 0 && game.cardIds.every((id) => answers.some((answer) => answer.nominationId === id && answer.solved));
  const perfect = allSolved && game.cardIds.every((id) => answers.find((answer) => answer.nominationId === id)?.attempts === 1);
  const totalScore = answers.reduce((sum, answer) => sum + answer.score, 0) + (perfect ? 100 : 0);
  await db.update(matchGames).set({ finishedAt: new Date(), totalScore, perfectBonus: perfect }).where(and(eq(matchGames.districtId, districtId), eq(matchGames.id, gameId)));
  await recomputeScore(districtId, game.memberId, db);
  return (await db.select().from(matchGames).where(and(eq(matchGames.districtId, districtId), eq(matchGames.id, gameId))).limit(1))[0];
}
