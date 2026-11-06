import type { LocalKeywordSuggestions } from "@contracts/localKeywordSuggestions";

export type KeywordFrequency = {
  keyword: string;
  count: number;
  firstId: number;
};

export function localImportMismatch(
  input: LocalKeywordSuggestions,
  snapshotNominationIds: number[]
) {
  const inputIds = input.suggestions.map(card => card.nominationId);
  if (new Set(inputIds).size !== inputIds.length)
    return "本地建议稿包含重复 nominationId，整批未导入";
  if (
    input.sourceCardCount !== snapshotNominationIds.length ||
    inputIds.length !== snapshotNominationIds.length
  ) {
    return `本地建议稿卡数与当前快照不一致（来源 ${input.sourceCardCount}，建议 ${inputIds.length}，快照 ${snapshotNominationIds.length}），整批未导入`;
  }
  const snapshotIds = new Set(snapshotNominationIds);
  if (inputIds.some(id => !snapshotIds.has(id)))
    return "本地建议稿 nominationId 与当前快照不完全一致，整批未导入";
  return null;
}

export function keywordPersistence(
  versionUpdatedAt: Date,
  rows: { status: "pending" | "ok" | "failed"; updatedAt: Date }[]
) {
  return {
    statusCounts: {
      pending: rows.filter(row => row.status === "pending").length,
      ok: rows.filter(row => row.status === "ok").length,
      failed: rows.filter(row => row.status === "failed").length,
    },
    lastUpdatedAt: rows.reduce(
      (latest, row) => (row.updatedAt > latest ? row.updatedAt : latest),
      versionUpdatedAt
    ),
  };
}

export function frequenciesFromCards(
  rows: { nominationId: number; tags: { label: string }[] }[]
) {
  const values = new Map<string, KeywordFrequency>();
  for (const row of rows) {
    for (const keyword of new Set(row.tags.map(tag => tag.label))) {
      const current = values.get(keyword);
      if (current) {
        current.count += 1;
        current.firstId = Math.min(current.firstId, row.nominationId);
      } else
        values.set(keyword, { keyword, count: 1, firstId: row.nominationId });
    }
  }
  return [...values.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.firstId - b.firstId ||
      a.keyword.localeCompare(b.keyword, "zh-CN")
  );
}

export function topKeywordsFromFrequencies(frequencies: KeywordFrequency[]) {
  const sorted = [...frequencies].sort(
    (a, b) =>
      b.count - a.count ||
      a.firstId - b.firstId ||
      a.keyword.localeCompare(b.keyword, "zh-CN")
  );
  if (sorted.length < 5) return [];
  const threshold = sorted[4].count;
  return sorted.filter(item => item.count >= threshold);
}

export function predictionScore(picks: string[], top: ReadonlySet<string>) {
  const hits = new Set(picks.filter(pick => top.has(pick))).size;
  return { hits, score: hits * 100 + (hits === 3 ? 300 : 0) };
}

export function riddleScore(correct: boolean, remainingMs: number) {
  return correct
    ? 100 + Math.floor((20 * Math.max(0, remainingMs)) / 30000)
    : 0;
}

export function matchAttemptScore(correct: boolean, attemptsBefore: number) {
  return correct ? ([100, 80, 60][attemptsBefore] ?? 0) : 0;
}

export function perfectMatchBonus(
  cardIds: number[],
  answers: { nominationId: number; solved: boolean; attempts: number }[]
) {
  const perfect =
    cardIds.length > 0 &&
    cardIds.every(id => {
      const answer = answers.find(item => item.nominationId === id);
      return answer?.solved && answer.attempts === 1;
    });
  return perfect ? 300 : 0;
}

export function participationMemberIds(input: {
  riddleAnswers: number[];
  predictions: number[];
  matchAttempts: number[];
  earlyFinishes: number[];
}) {
  return new Set([
    ...input.riddleAnswers,
    ...input.predictions,
    ...input.matchAttempts,
    ...input.earlyFinishes,
  ]);
}

export type CompetitionScoreRow = {
  id: number;
  name: string;
  pinyinKey: string;
  predict: number;
  riddle: number;
  match: number;
};

export function competitionBoard(
  rows: CompetitionScoreRow[],
  compare: (a: CompetitionScoreRow, b: CompetitionScoreRow) => number
) {
  const sorted = rows
    .map(row => ({
      ...row,
      total: row.predict + row.riddle + row.match,
      rank: 0,
    }))
    .sort((a, b) => b.total - a.total || compare(a, b));
  let previousTotal: number | null = null;
  let previousRank = 0;
  const leaderboard = sorted.map((row, index) => {
    if (previousTotal === null || row.total !== previousTotal) {
      previousRank = index + 1;
      previousTotal = row.total;
    }
    return { ...row, rank: previousRank };
  });
  return {
    leaderboard,
    winners: leaderboard.filter(row => row.total > 0 && row.rank <= 3),
  };
}
