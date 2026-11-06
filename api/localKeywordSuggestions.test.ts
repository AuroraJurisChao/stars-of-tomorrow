import { describe, expect, it } from "vitest";
import { localKeywordSuggestionsSchema } from "@contracts/localKeywordSuggestions";
import { frequenciesFromCards, localImportMismatch } from "./v11Rules";

function suggestion(nominationId: number, labels = ["主动协作"]) {
  return {
    nominationId,
    tags: labels.map((label) => ({ label, rationale: "合成卡测试依据" })),
  };
}

function validInput() {
  return {
    sourceCardCount: 2,
    suggestions: [suggestion(11, ["主动协作", "温暖可靠"]), suggestion(12, ["主动协作"])],
  };
}

describe("local keyword suggestion input", () => {
  it("accepts a complete draft and strips unrelated top-level metadata", () => {
    const parsed = localKeywordSuggestionsSchema.safeParse({ ...validInput(), name: "本地建议", note: "不进入业务数据" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.suggestions).toHaveLength(2);
      expect(parsed.data).not.toHaveProperty("name");
      expect(parsed.data).not.toHaveProperty("note");
    }
  });

  it.each(["协作", "五个汉字啦", "ABCD", "主动协A"])("rejects invalid four-Chinese-character label %s", (label) => {
    expect(localKeywordSuggestionsSchema.safeParse({ sourceCardCount: 1, suggestions: [suggestion(11, [label])] }).success).toBe(false);
  });

  it("rejects duplicate labels within one card", () => {
    expect(localKeywordSuggestionsSchema.safeParse({ sourceCardCount: 1, suggestions: [suggestion(11, ["主动协作", "主动协作"])] }).success).toBe(false);
  });

  it("rejects blank and overlong rationales", () => {
    const blank = suggestion(11);
    blank.tags[0].rationale = "   ";
    const overlong = suggestion(11);
    overlong.tags[0].rationale = "测".repeat(161);
    expect(localKeywordSuggestionsSchema.safeParse({ sourceCardCount: 1, suggestions: [blank] }).success).toBe(false);
    expect(localKeywordSuggestionsSchema.safeParse({ sourceCardCount: 1, suggestions: [overlong] }).success).toBe(false);
  });

  it("rejects duplicate nomination ids and source count changes", () => {
    expect(localKeywordSuggestionsSchema.safeParse({ sourceCardCount: 2, suggestions: [suggestion(11), suggestion(11)] }).success).toBe(false);
    expect(localKeywordSuggestionsSchema.safeParse({ ...validInput(), sourceCardCount: 3 }).success).toBe(false);
  });

  it("rejects private or unexpected fields inside cards and tags", () => {
    const withReason = { ...suggestion(11), reason: "不得夹带正文" };
    const withAuthor = suggestion(11);
    const withAuthorId = { ...withAuthor.tags[0], authorId: 7 };
    expect(localKeywordSuggestionsSchema.safeParse({ sourceCardCount: 1, suggestions: [withReason] }).success).toBe(false);
    expect(localKeywordSuggestionsSchema.safeParse({ sourceCardCount: 1, suggestions: [{ nominationId: 11, tags: [withAuthorId] }] }).success).toBe(false);
  });
});

describe("local import snapshot matching", () => {
  it("accepts only the exact snapshot nomination id set", () => {
    expect(localImportMismatch(validInput(), [11, 12])).toBeNull();
    expect(localImportMismatch(validInput(), [12, 11])).toBeNull();
  });

  it("rejects missing cards, extra cards and same-count id mismatches", () => {
    expect(localImportMismatch({ sourceCardCount: 1, suggestions: [suggestion(11)] }, [11, 12])).toContain("卡数与当前快照不一致");
    expect(localImportMismatch(validInput(), [11])).toContain("卡数与当前快照不一致");
    expect(localImportMismatch({ sourceCardCount: 2, suggestions: [suggestion(11), suggestion(99)] }, [11, 12])).toContain("不完全一致");
  });

  it("defensively rejects duplicate ids even before database writes", () => {
    expect(localImportMismatch({ sourceCardCount: 2, suggestions: [suggestion(11), suggestion(11)] }, [11, 12])).toContain("重复 nominationId");
  });

  it("computes frequencies from imported labels with per-card deduplication", () => {
    const rows = [
      suggestion(11, ["主动协作", "主动协作", "温暖可靠"]),
      suggestion(12, ["主动协作"]),
    ];
    expect(frequenciesFromCards(rows)).toEqual([
      { keyword: "主动协作", count: 2, firstId: 11 },
      { keyword: "温暖可靠", count: 1, firstId: 11 },
    ]);
  });
});
