import {
  bigint,
  boolean,
  double,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { GAME_MODES, PHASES } from "../contracts/constants";

export const members = mysqlTable("members", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  name: varchar("name", { length: 32 }).notNull().unique(),
  pinyinKey: varchar("pinyin_key", { length: 64 }).notNull(),
  role: mysqlEnum("role", ["member", "organizer"]).notNull().default("member"),
  passwordHash: varchar("password_hash", { length: 128 }).notNull(),
  passwordSalt: varchar("password_salt", { length: 64 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const districts = mysqlTable("districts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  sortOrder: int("sort_order").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const districtMembers = mysqlTable(
  "district_members",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull().references(() => districts.id, { onDelete: "cascade" }),
    memberId: bigint("member_id", { mode: "number", unsigned: true }).notNull().references(() => members.id, { onDelete: "cascade" }),
    pinyinKey: varchar("pinyin_key", { length: 64 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("district_member_unique").on(table.districtId, table.memberId),
    index("district_member_order_idx").on(table.districtId, table.active, table.pinyinKey),
  ],
);

export const sessions = mysqlTable(
  "sessions",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    memberId: bigint("member_id", { mode: "number", unsigned: true }).notNull().references(() => members.id, { onDelete: "cascade" }),
    districtId: varchar("district_id", { length: 64 }).notNull().references(() => districts.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("sessions_member_district_idx").on(table.memberId, table.districtId)],
);

export const loginAttempts = mysqlTable("login_attempts", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  attemptKey: varchar("attempt_key", { length: 128 }).notNull().unique(),
  failures: int("failures").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const eventState = mysqlTable(
  "event_state",
  {
    districtId: varchar("district_id", { length: 64 }).notNull().references(() => districts.id, { onDelete: "cascade" }),
    id: int("id").notNull().default(1),
    phase: mysqlEnum("phase", PHASES).notNull().default("collect"),
    gameMode: mysqlEnum("game_mode", GAME_MODES).notNull().default("trial"),
    step: int("step").notNull().default(0),
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    revision: int("revision").notNull().default(1),
    matchEndsAt: timestamp("match_ends_at"),
    matchExtraUsed: boolean("match_extra_used").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [primaryKey({ columns: [table.districtId, table.id] })],
);

export const nominations = mysqlTable(
  "nominations",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull().references(() => districts.id, { onDelete: "cascade" }),
    authorId: bigint("author_id", { mode: "number", unsigned: true }).notNull().references(() => members.id, { onDelete: "cascade" }),
    recipientId: bigint("recipient_id", { mode: "number", unsigned: true }).notNull().references(() => members.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    anonymous: boolean("anonymous").notNull().default(false),
    keywords: json("keywords").$type<string[]>().notNull(),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("nomination_district_author_recipient_unique").on(table.districtId, table.authorId, table.recipientId),
    index("nomination_district_recipient_idx").on(table.districtId, table.recipientId),
  ],
);

export const drafts = mysqlTable(
  "drafts",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull().references(() => districts.id, { onDelete: "cascade" }),
    authorId: bigint("author_id", { mode: "number", unsigned: true }).notNull().references(() => members.id, { onDelete: "cascade" }),
    recipientId: bigint("recipient_id", { mode: "number", unsigned: true }).notNull().references(() => members.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    anonymous: boolean("anonymous").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [uniqueIndex("draft_district_author_recipient_unique").on(table.districtId, table.authorId, table.recipientId)],
);

export const submissionStates = mysqlTable(
  "submission_states",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull().references(() => districts.id, { onDelete: "cascade" }),
    memberId: bigint("member_id", { mode: "number", unsigned: true }).notNull().references(() => members.id, { onDelete: "cascade" }),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("submission_district_member_unique").on(table.districtId, table.memberId)],
);

export const predictions = mysqlTable(
  "predictions",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull().references(() => districts.id, { onDelete: "cascade" }),
    memberId: bigint("member_id", { mode: "number", unsigned: true }).notNull().references(() => members.id, { onDelete: "cascade" }),
    picks: json("picks").$type<string[]>().notNull(),
    score: int("score").notNull().default(0),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    settledAt: timestamp("settled_at"),
  },
  (table) => [uniqueIndex("prediction_district_member_unique").on(table.districtId, table.memberId)],
);

export const riddleSets = mysqlTable(
  "riddle_sets",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull().references(() => districts.id, { onDelete: "cascade" }),
    nominationId: bigint("nomination_id", { mode: "number", unsigned: true }).notNull().unique().references(() => nominations.id, { onDelete: "cascade" }),
    position: int("position").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("riddle_set_district_position_unique").on(table.districtId, table.position)],
);

export const riddleAnswers = mysqlTable(
  "riddle_answers",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull().references(() => districts.id, { onDelete: "cascade" }),
    nominationId: bigint("nomination_id", { mode: "number", unsigned: true }).notNull().references(() => nominations.id, { onDelete: "cascade" }),
    memberId: bigint("member_id", { mode: "number", unsigned: true }).notNull().references(() => members.id, { onDelete: "cascade" }),
    pickedRecipientId: bigint("picked_recipient_id", { mode: "number", unsigned: true }).notNull().references(() => members.id, { onDelete: "cascade" }),
    correct: boolean("correct").notNull(),
    seconds: double("seconds").notNull(),
    score: int("score").notNull(),
    answeredAt: timestamp("answered_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("riddle_answer_unique").on(table.nominationId, table.memberId)],
);

export const matchGames = mysqlTable(
  "match_games",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull().references(() => districts.id, { onDelete: "cascade" }),
    memberId: bigint("member_id", { mode: "number", unsigned: true }).notNull().references(() => members.id, { onDelete: "cascade" }),
    cardIds: json("card_ids").$type<number[]>().notNull(),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
    totalScore: int("total_score").notNull().default(0),
    perfectBonus: boolean("perfect_bonus").notNull().default(false),
  },
  (table) => [uniqueIndex("match_game_district_member_unique").on(table.districtId, table.memberId)],
);

export const matchAnswers = mysqlTable(
  "match_answers",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull().references(() => districts.id, { onDelete: "cascade" }),
    gameId: bigint("game_id", { mode: "number", unsigned: true }).notNull().references(() => matchGames.id, { onDelete: "cascade" }),
    nominationId: bigint("nomination_id", { mode: "number", unsigned: true }).notNull().references(() => nominations.id, { onDelete: "cascade" }),
    attempts: int("attempts").notNull().default(0),
    solved: boolean("solved").notNull().default(false),
    pickedAuthorId: bigint("picked_author_id", { mode: "number", unsigned: true }).references(() => members.id, { onDelete: "cascade" }),
    secondsLeft: int("seconds_left").notNull().default(0),
    score: int("score").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [uniqueIndex("match_answer_unique").on(table.gameId, table.nominationId)],
);

export const scores = mysqlTable(
  "scores",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull().references(() => districts.id, { onDelete: "cascade" }),
    memberId: bigint("member_id", { mode: "number", unsigned: true }).notNull().references(() => members.id, { onDelete: "cascade" }),
    predict: int("predict").notNull().default(0),
    riddle: int("riddle").notNull().default(0),
    match: int("match").notNull().default(0),
    total: int("total").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [uniqueIndex("score_district_member_unique").on(table.districtId, table.memberId)],
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull().references(() => districts.id, { onDelete: "cascade" }),
    actorId: bigint("actor_id", { mode: "number", unsigned: true }).notNull().references(() => members.id, { onDelete: "restrict" }),
    action: varchar("action", { length: 64 }).notNull(),
    details: json("details").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("audit_district_created_idx").on(table.districtId, table.createdAt)],
);

// V11 uses additive, run-scoped tables so V10 data and rollback paths remain intact.
export const gameRuns = mysqlTable(
  "event_game_runs",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull(),
    mode: mysqlEnum("mode", GAME_MODES).notNull(),
    keywordVersionId: bigint("keyword_version_id", { mode: "number", unsigned: true }),
    matchStartedAt: timestamp("match_started_at", { fsp: 3 }),
    matchEndsAt: timestamp("match_ends_at", { fsp: 3 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("game_run_district_mode_unique").on(table.districtId, table.mode)],
);

export const collectionSnapshots = mysqlTable("collection_snapshots", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  districtId: varchar("district_id", { length: 64 }).notNull().unique(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  cardCount: int("card_count").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const snapshotCards = mysqlTable(
  "snapshot_cards",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull(),
    snapshotId: bigint("snapshot_id", { mode: "number", unsigned: true }).notNull(),
    nominationId: bigint("nomination_id", { mode: "number", unsigned: true }).notNull(),
    authorId: bigint("author_id", { mode: "number", unsigned: true }).notNull(),
    recipientId: bigint("recipient_id", { mode: "number", unsigned: true }).notNull(),
    reason: text("reason").notNull(),
    anonymous: boolean("anonymous").notNull(),
    submittedAt: timestamp("submitted_at").notNull(),
  },
  (table) => [
    uniqueIndex("snapshot_card_unique").on(table.snapshotId, table.nominationId),
    index("snapshot_card_recipient_idx").on(table.districtId, table.recipientId),
  ],
);

export const keywordVersions = mysqlTable(
  "keyword_versions",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull(),
    snapshotId: bigint("snapshot_id", { mode: "number", unsigned: true }).notNull(),
    version: int("version").notNull(),
    status: mysqlEnum("status", ["draft", "published"]).notNull().default("draft"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
    publishedAt: timestamp("published_at"),
  },
  (table) => [uniqueIndex("keyword_version_district_version_unique").on(table.districtId, table.version)],
);

export const keywordCards = mysqlTable(
  "keyword_cards",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull(),
    versionId: bigint("version_id", { mode: "number", unsigned: true }).notNull(),
    snapshotCardId: bigint("snapshot_card_id", { mode: "number", unsigned: true }).notNull(),
    status: mysqlEnum("status", ["pending", "ok", "failed"]).notNull().default("pending"),
    tags: json("tags").$type<{ label: string; rationale: string }[]>().notNull(),
    errorMessage: varchar("error_message", { length: 255 }),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [uniqueIndex("keyword_card_version_card_unique").on(table.versionId, table.snapshotCardId)],
);

export const riddleStatesV11 = mysqlTable("riddle_states_v11", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  districtId: varchar("district_id", { length: 64 }).notNull(),
  runId: bigint("run_id", { mode: "number", unsigned: true }).notNull().unique(),
  currentCardId: bigint("current_card_id", { mode: "number", unsigned: true }),
  status: mysqlEnum("status", ["idle", "ready", "answering", "closed", "revealed", "ended"]).notNull().default("idle"),
  startsAt: timestamp("starts_at", { fsp: 3 }),
  endsAt: timestamp("ends_at", { fsp: 3 }),
  usedCardIds: json("used_card_ids").$type<number[]>().notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const riddleAnswersV11 = mysqlTable(
  "riddle_answers_v11",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull(),
    runId: bigint("run_id", { mode: "number", unsigned: true }).notNull(),
    nominationId: bigint("nomination_id", { mode: "number", unsigned: true }).notNull(),
    memberId: bigint("member_id", { mode: "number", unsigned: true }).notNull(),
    pickedRecipientId: bigint("picked_recipient_id", { mode: "number", unsigned: true }).notNull(),
    correct: boolean("correct").notNull(),
    remainingMs: int("remaining_ms").notNull(),
    score: int("score").notNull(),
    answeredAt: timestamp("answered_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("riddle_answer_run_card_member_unique").on(table.runId, table.nominationId, table.memberId)],
);

export const predictionsV11 = mysqlTable(
  "predictions_v11",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull(),
    runId: bigint("run_id", { mode: "number", unsigned: true }).notNull(),
    memberId: bigint("member_id", { mode: "number", unsigned: true }).notNull(),
    keywordVersionId: bigint("keyword_version_id", { mode: "number", unsigned: true }).notNull(),
    picks: json("picks").$type<string[]>().notNull(),
    hitCount: int("hit_count").notNull().default(0),
    score: int("score").notNull().default(0),
    settledAt: timestamp("settled_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [uniqueIndex("prediction_run_member_unique").on(table.runId, table.memberId)],
);

export const matchGamesV11 = mysqlTable(
  "match_games_v11",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull(),
    runId: bigint("run_id", { mode: "number", unsigned: true }).notNull(),
    memberId: bigint("member_id", { mode: "number", unsigned: true }).notNull(),
    cardIds: json("card_ids").$type<number[]>().notNull(),
    startedAt: timestamp("started_at", { fsp: 3 }).notNull(),
    endsAt: timestamp("ends_at", { fsp: 3 }).notNull(),
    finishedAt: timestamp("finished_at"),
    finishReason: varchar("finish_reason", { length: 24 }),
    baseScore: int("base_score").notNull().default(0),
    perfectBonus: int("perfect_bonus").notNull().default(0),
    totalScore: int("total_score").notNull().default(0),
  },
  (table) => [uniqueIndex("match_game_run_member_unique").on(table.runId, table.memberId)],
);

export const matchAnswersV11 = mysqlTable(
  "match_answers_v11",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull(),
    runId: bigint("run_id", { mode: "number", unsigned: true }).notNull(),
    gameId: bigint("game_id", { mode: "number", unsigned: true }).notNull(),
    nominationId: bigint("nomination_id", { mode: "number", unsigned: true }).notNull(),
    attempts: int("attempts").notNull().default(0),
    wrongPicks: json("wrong_picks").$type<string[]>().notNull(),
    solved: boolean("solved").notNull().default(false),
    score: int("score").notNull().default(0),
    answeredAt: timestamp("answered_at"),
  },
  (table) => [uniqueIndex("match_answer_game_card_unique").on(table.gameId, table.nominationId)],
);

export const scoresV11 = mysqlTable(
  "scores_v11",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    districtId: varchar("district_id", { length: 64 }).notNull(),
    runId: bigint("run_id", { mode: "number", unsigned: true }).notNull(),
    memberId: bigint("member_id", { mode: "number", unsigned: true }).notNull(),
    predict: int("predict").notNull().default(0),
    riddle: int("riddle").notNull().default(0),
    match: int("match").notNull().default(0),
    total: int("total").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [uniqueIndex("score_run_member_unique").on(table.runId, table.memberId)],
);
