import { describe, expect, it } from "vitest";
import {
  buildKeywordBatchPrompt,
  keywordGenerationError,
  keywordSuggestionSchema,
  normalizeKeywordBatch,
  normalizeKeywordTags,
  type KeywordBatchCard,
} from "./llmKeywords";

const cards: KeywordBatchCard[] = [
  { snapshotCardId: 101, nominationId: 9, reason: "第九条完整评价" },
  { snapshotCardId: 102, nominationId: 2, reason: "第二条完整评价" },
];

describe("keyword generation diagnostics", () => {
  it("keeps HTTP status and a parsed upstream error without the response body", () => {
    const message = keywordGenerationError({
      statusCode: 404,
      message: "Model Not Exist",
      responseBody: JSON.stringify({ error: { message: "Model Not Exist" } }),
    });
    expect(message).toBe("调用失败（HTTP 404）：Model Not Exist");
  });

  it("keeps the inner schema or parse cause instead of only the outer summary", () => {
    const message = keywordGenerationError({
      message: "No object generated: response did not match schema.",
      cause: new Error("Type validation failed: label must contain exactly four Chinese characters"),
    });
    expect(message).toContain("Type validation failed");
    expect(message).not.toContain("No object generated");
  });

  it("redacts credential-shaped text and bounds the stored message", () => {
    const message = keywordGenerationError(new Error(`Bearer abc.def sk-testsecret LLM_API_KEY=anothersecret ${"x".repeat(400)}`));
    expect(message).not.toContain("abc.def");
    expect(message).not.toContain("testsecret");
    expect(message).not.toContain("anothersecret");
    expect(message.length).toBeLessThanOrEqual(255);
  });

  it("never persists an unparsed response body", () => {
    const message = keywordGenerationError({ message: "upstream call failed", responseBody: "unparsed private payload" });
    expect(message).toContain("upstream call failed");
    expect(message).not.toContain("unparsed private payload");
  });

  it("deduplicates labels within one card", () => {
    expect(normalizeKeywordTags([
      { label: "主动协作", rationale: "依据一" },
      { label: "主动协作", rationale: "重复" },
      { label: "温暖可靠", rationale: "依据二" },
    ]).map((tag) => tag.label)).toEqual(["主动协作", "温暖可靠"]);
  });
});

describe("whole-snapshot keyword generation", () => {
  it("puts every full card into one ordered prompt without author fields", () => {
    const prompt = buildKeywordBatchPrompt([
      { ...cards[0], authorId: 88, authorName: "不应出现的姓名" } as KeywordBatchCard,
      { ...cards[1], authorId: 77, authorName: "另一位不应出现" } as KeywordBatchCard,
    ]);
    expect(prompt.indexOf("第二条完整评价")).toBeLessThan(prompt.indexOf("第九条完整评价"));
    expect(prompt).toContain('"cardId": 2');
    expect(prompt).toContain('"cardId": 9');
    expect(prompt).not.toContain("authorId");
    expect(prompt).not.toContain("authorName");
    expect(prompt).not.toContain("不应出现的姓名");
    expect(prompt).toContain("8–12");
    expect(prompt).toContain('{"keywords":[]}');
  });

  it("accepts only the strict keywords/cardIds contract", () => {
    expect(keywordSuggestionSchema.safeParse({
      keywords: [{ label: "主动协作", cardIds: [2, 9] }],
    }).success).toBe(true);
    expect(keywordSuggestionSchema.safeParse({
      keywords: [{ label: "主动协作", cardIds: [2], count: 1 }],
    }).success).toBe(false);
    expect(keywordSuggestionSchema.safeParse({
      keywords: [{ label: "协作", cardIds: [2] }],
    }).success).toBe(false);
    expect(keywordSuggestionSchema.safeParse({ tags: [] }).success).toBe(false);
  });

  it("rejects unknown cards and more than three labels per card", () => {
    expect(() => normalizeKeywordBatch({ keywords: [{ label: "主动协作", cardIds: [404] }] }, cards))
      .toThrow("快照中不存在");
    expect(() => normalizeKeywordBatch({
      keywords: ["主动协作", "温暖可靠", "专业深厚", "乐于补位"].map((label) => ({ label, cardIds: [2] })),
    }, cards)).toThrow("超过 3 个标签");
  });

  it("merges repeated labels and deduplicates card IDs without trusting model counts", () => {
    const result = normalizeKeywordBatch({
      keywords: [
        { label: "主动协作", cardIds: [2, 2, 9] },
        { label: "主动协作", cardIds: [2] },
        { label: "温暖可靠", cardIds: [9] },
      ],
    }, cards);
    expect(result.get(101)?.map((tag) => tag.label)).toEqual(["主动协作", "温暖可靠"]);
    expect(result.get(102)).toEqual([{ label: "主动协作", rationale: "整组全局语义归并" }]);
  });
});
