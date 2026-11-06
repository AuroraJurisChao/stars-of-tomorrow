import { z } from "zod";

const fourChinese = z.string().regex(/^[\u4e00-\u9fff]{4}$/, "每个标签必须是四个中文汉字");

export const localKeywordSuggestionsSchema = z.object({
  sourceCardCount: z.number().int().nonnegative().max(2000),
  suggestions: z.array(z.object({
    nominationId: z.number().int().positive(),
    tags: z.array(z.object({
      label: fourChinese,
      rationale: z.string().trim().min(1, "标签依据不能为空").max(160, "标签依据不能超过 160 字符"),
    }).strict()).min(1).max(3).superRefine((tags, context) => {
      if (new Set(tags.map((tag) => tag.label)).size !== tags.length) {
        context.addIssue({ code: "custom", message: "同一卡的标签不能重复" });
      }
    }),
  }).strict()).max(2000).superRefine((suggestions, context) => {
    if (new Set(suggestions.map((card) => card.nominationId)).size !== suggestions.length) {
      context.addIssue({ code: "custom", message: "本地建议稿包含重复 nominationId" });
    }
  }),
}).superRefine((input, context) => {
  if (input.sourceCardCount !== input.suggestions.length) {
    context.addIssue({ code: "custom", message: "sourceCardCount 与建议卡数不一致", path: ["sourceCardCount"] });
  }
});

export type LocalKeywordSuggestions = z.infer<typeof localKeywordSuggestionsSchema>;
