import { describe, expect, it } from "vitest";
import {
  competitionBoard,
  frequenciesFromCards,
  keywordPersistence,
  matchAttemptScore,
  participationMemberIds,
  perfectMatchBonus,
  predictionScore,
  riddleScore,
  topKeywordsFromFrequencies,
} from "./v11Rules";
import { comparePinyin } from "@contracts/constants";

const tags = (...labels: string[]) =>
  labels.map(label => ({ label, rationale: "测试依据" }));

describe("V11 keyword review and Top 5 ties", () => {
  it("deduplicates the same normalized label within each card before counting", () => {
    const rows = [
      { nominationId: 9, tags: tags("主动协作", "主动协作", "温暖可靠") },
      { nominationId: 4, tags: tags("主动协作") },
    ];
    expect(frequenciesFromCards(rows)).toEqual([
      { keyword: "主动协作", count: 2, firstId: 4 },
      { keyword: "温暖可靠", count: 1, firstId: 9 },
    ]);
  });

  it("includes every keyword tied at the fifth-place frequency", () => {
    const frequencies = [
      { keyword: "甲", count: 8, firstId: 1 },
      { keyword: "乙", count: 7, firstId: 2 },
      { keyword: "丙", count: 6, firstId: 3 },
      { keyword: "丁", count: 5, firstId: 4 },
      { keyword: "戊", count: 4, firstId: 5 },
      { keyword: "己", count: 4, firstId: 6 },
      { keyword: "庚", count: 4, firstId: 7 },
      { keyword: "辛", count: 1, firstId: 8 },
    ];
    expect(
      topKeywordsFromFrequencies(frequencies).map(item => item.keyword)
    ).toEqual(["甲", "乙", "丙", "丁", "戊", "己", "庚"]);
  });

  it("returns no valid board when fewer than five candidates exist", () => {
    expect(
      topKeywordsFromFrequencies(
        Array.from({ length: 4 }, (_, index) => ({
          keyword: `词${index}`,
          count: 1,
          firstId: index,
        }))
      )
    ).toEqual([]);
  });
});

describe("keyword database progress", () => {
  it("reports only persisted pending/ok/failed counts and the latest card update", () => {
    const versionTime = new Date("2026-11-05T08:00:00.000Z");
    const latest = new Date("2026-11-05T08:03:00.000Z");
    expect(
      keywordPersistence(versionTime, [
        { status: "pending", updatedAt: new Date("2026-11-05T08:01:00.000Z") },
        { status: "ok", updatedAt: latest },
        { status: "failed", updatedAt: new Date("2026-11-05T08:02:00.000Z") },
        { status: "ok", updatedAt: new Date("2026-11-05T08:02:30.000Z") },
      ])
    ).toEqual({
      statusCounts: { pending: 1, ok: 2, failed: 1 },
      lastUpdatedAt: latest,
    });
  });

  it("does not invent pending cards before a version has any keyword rows", () => {
    const versionTime = new Date("2026-11-05T08:00:00.000Z");
    expect(keywordPersistence(versionTime, [])).toEqual({
      statusCounts: { pending: 0, ok: 0, failed: 0 },
      lastUpdatedAt: versionTime,
    });
  });
});

describe("V11 server scoring rules", () => {
  it.each([
    { picks: ["甲", "乙", "丙"], hits: 0, score: 0 },
    { picks: ["甲", "乙", "丙"], hits: 1, score: 100 },
    { picks: ["甲", "乙", "丙"], hits: 2, score: 200 },
    { picks: ["甲", "乙", "丙"], hits: 3, score: 600 },
  ])("settles prediction hits=$hits as $score", ({ picks, hits, score }) => {
    const top = new Set(picks.slice(0, hits));
    expect(predictionScore(picks, top)).toEqual({ hits, score });
  });

  it("uses server remaining milliseconds for riddle speed points", () => {
    expect(riddleScore(true, 30000)).toBe(120);
    expect(riddleScore(true, 15000)).toBe(110);
    expect(riddleScore(true, 14999)).toBe(109);
    expect(riddleScore(true, 0)).toBe(100);
    expect(riddleScore(false, 30000)).toBe(0);
  });

  it("scores match attempts 100/80/60 then zero", () => {
    expect(
      [0, 1, 2, 3, 8].map(attempt => matchAttemptScore(true, attempt))
    ).toEqual([100, 80, 60, 0, 0]);
    expect(matchAttemptScore(false, 0)).toBe(0);
  });

  it("awards the perfect bonus only for nonempty all-first-try games", () => {
    expect(perfectMatchBonus([], [])).toBe(0);
    expect(
      perfectMatchBonus(
        [1, 2],
        [
          { nominationId: 1, solved: true, attempts: 1 },
          { nominationId: 2, solved: true, attempts: 1 },
        ]
      )
    ).toBe(300);
    expect(
      perfectMatchBonus(
        [1, 2],
        [
          { nominationId: 1, solved: true, attempts: 1 },
          { nominationId: 2, solved: true, attempts: 2 },
        ]
      )
    ).toBe(0);
    expect(
      perfectMatchBonus([1], [{ nominationId: 1, solved: false, attempts: 0 }])
    ).toBe(0);
  });
});

describe("actual participation and competition ranking", () => {
  it("unions only real answer, prediction, attempt and early-finish behavior", () => {
    expect(
      [
        ...participationMemberIds({
          riddleAnswers: [3, 1],
          predictions: [2],
          matchAttempts: [4, 1],
          earlyFinishes: [5],
        }),
      ].sort()
    ).toEqual([1, 2, 3, 4, 5]);
    expect(
      participationMemberIds({
        riddleAnswers: [],
        predictions: [],
        matchAttempts: [],
        earlyFinishes: [],
      }).size
    ).toBe(0);
  });

  const members = [
    {
      id: 1,
      name: "甲",
      pinyinKey: "jia",
      predict: 100,
      riddle: 100,
      match: 0,
    },
    { id: 2, name: "乙", pinyinKey: "yi", predict: 0, riddle: 200, match: 0 },
    { id: 3, name: "丙", pinyinKey: "bing", predict: 0, riddle: 0, match: 200 },
    { id: 4, name: "丁", pinyinKey: "ding", predict: 0, riddle: 0, match: 0 },
  ];

  it("keeps zero-score participants, recomputes totals and uses 1/2/2/4 competition ranks", () => {
    const board = competitionBoard(members, comparePinyin);
    expect(board.leaderboard.map(row => [row.id, row.total, row.rank])).toEqual(
      [
        [3, 200, 1],
        [1, 200, 1],
        [2, 200, 1],
        [4, 0, 4],
      ]
    );
    const tiedForSecond = competitionBoard(
      members.map(row => (row.id === 1 ? { ...row, riddle: 300 } : row)),
      comparePinyin
    );
    expect(tiedForSecond.leaderboard.map(row => row.rank)).toEqual([
      1, 2, 2, 4,
    ]);
  });

  it("awards every tie in the first three ranks and never awards an all-zero board", () => {
    expect(
      competitionBoard(members, comparePinyin).winners.map(row => row.id)
    ).toEqual([3, 1, 2]);
    expect(
      competitionBoard(
        members.map(row => ({ ...row, predict: 0, riddle: 0, match: 0 })),
        comparePinyin
      )
    ).toEqual({
      leaderboard: [
        { ...members[2], predict: 0, riddle: 0, match: 0, total: 0, rank: 1 },
        { ...members[3], predict: 0, riddle: 0, match: 0, total: 0, rank: 1 },
        { ...members[0], predict: 0, riddle: 0, match: 0, total: 0, rank: 1 },
        { ...members[1], predict: 0, riddle: 0, match: 0, total: 0, rank: 1 },
      ],
      winners: [],
    });
  });
});
