export const PHASES = [
  "collect",
  "prepare",
  "riddle",
  "predict",
  "predict-reveal",
  "match",
  "rank",
  "award",
] as const;

export type Phase = (typeof PHASES)[number];
export const GAME_MODES = ["trial", "official"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  collect: "会前收集",
  prepare: "现场筹备",
  riddle: "真心话抢答",
  predict: "全民预言家",
  "predict-reveal": "Top 5 揭晓",
  match: "欣赏连连看",
  rank: "排行榜揭晓",
  award: "明日之星颁奖",
};

// Public demo configuration. Replace these fictional values before a real event.
export const DISTRICTS = [
  { id: "demo-team", name: "示例团队", enabled: true, sortOrder: 10 },
] as const;

export type DistrictId = (typeof DISTRICTS)[number]["id"];
export const DEFAULT_DISTRICT_ID: DistrictId = "demo-team";
export const DEFAULT_PUBLIC_DISTRICT_ID = DEFAULT_DISTRICT_ID;

// ASCII sort keys keep the member order stable across browsers and locales.
export const MEMBERS = [
  { name: "陈晨", pinyinKey: "chenchen" },
  { name: "林晓星", pinyinKey: "linxiaoxing" },
  { name: "孙嘉禾", pinyinKey: "sunjiahe" },
  { name: "吴天宇", pinyinKey: "wutianyu" },
  { name: "许知远", pinyinKey: "xuzhiyuan" },
  { name: "周雨桐", pinyinKey: "zhouyutong" },
] as const;

export const ORGANIZER_NAME = "组织者";
export const ORGANIZER_PINYIN_KEY = "zz-organizer";
export const MAX_REASON_LENGTH = 1000;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 20;
export const MATCH_SECONDS = 120;
export const MATCH_EXTRA_SECONDS = 30;

export type PinyinMember = { name: string; pinyinKey: string };

export function comparePinyin(a: PinyinMember, b: PinyinMember) {
  if (a.pinyinKey < b.pinyinKey) return -1;
  if (a.pinyinKey > b.pinyinKey) return 1;
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

export function sortByPinyin<T extends PinyinMember>(items: readonly T[]) {
  return [...items].sort(comparePinyin);
}

export function unicodeLength(value: string) {
  return Array.from(value).length;
}

export function cleanReason(value: string) {
  return value.trim();
}

export function validateNewPassword(value: string) {
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    return "新密码须为8–20个字符";
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return "新密码须至少包含一个英文字母和一个数字";
  }
  return null;
}
