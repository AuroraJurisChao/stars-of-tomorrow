CREATE TABLE `audit_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`actor_id` bigint unsigned NOT NULL,
	`action` varchar(64) NOT NULL,
	`details` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `collection_snapshots` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`content_hash` varchar(64) NOT NULL,
	`card_count` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collection_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `collection_snapshots_district_id_unique` UNIQUE(`district_id`)
);
--> statement-breakpoint
CREATE TABLE `district_members` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`member_id` bigint unsigned NOT NULL,
	`pinyin_key` varchar(64) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `district_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `district_member_unique` UNIQUE(`district_id`,`member_id`)
);
--> statement-breakpoint
CREATE TABLE `districts` (
	`id` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `districts_id` PRIMARY KEY(`id`),
	CONSTRAINT `districts_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`author_id` bigint unsigned NOT NULL,
	`recipient_id` bigint unsigned NOT NULL,
	`reason` text NOT NULL,
	`anonymous` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drafts_id` PRIMARY KEY(`id`),
	CONSTRAINT `draft_district_author_recipient_unique` UNIQUE(`district_id`,`author_id`,`recipient_id`)
);
--> statement-breakpoint
CREATE TABLE `event_state` (
	`district_id` varchar(64) NOT NULL,
	`id` int NOT NULL DEFAULT 1,
	`phase` enum('collect','prepare','riddle','predict','predict-reveal','match','rank','award') NOT NULL DEFAULT 'collect',
	`game_mode` enum('trial','official') NOT NULL DEFAULT 'trial',
	`step` int NOT NULL DEFAULT 0,
	`payload` json NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`match_ends_at` timestamp,
	`match_extra_used` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `event_state_district_id_id_pk` PRIMARY KEY(`district_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `event_game_runs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`mode` enum('trial','official') NOT NULL,
	`keyword_version_id` bigint unsigned,
	`match_started_at` timestamp(3),
	`match_ends_at` timestamp(3),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `event_game_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `game_run_district_mode_unique` UNIQUE(`district_id`,`mode`)
);
--> statement-breakpoint
CREATE TABLE `keyword_cards` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`version_id` bigint unsigned NOT NULL,
	`snapshot_card_id` bigint unsigned NOT NULL,
	`status` enum('pending','ok','failed') NOT NULL DEFAULT 'pending',
	`tags` json NOT NULL,
	`error_message` varchar(255),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `keyword_cards_id` PRIMARY KEY(`id`),
	CONSTRAINT `keyword_card_version_card_unique` UNIQUE(`version_id`,`snapshot_card_id`)
);
--> statement-breakpoint
CREATE TABLE `keyword_versions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`snapshot_id` bigint unsigned NOT NULL,
	`version` int NOT NULL,
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`published_at` timestamp,
	CONSTRAINT `keyword_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `keyword_version_district_version_unique` UNIQUE(`district_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`attempt_key` varchar(128) NOT NULL,
	`failures` int NOT NULL DEFAULT 0,
	`locked_until` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `login_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `login_attempts_attempt_key_unique` UNIQUE(`attempt_key`)
);
--> statement-breakpoint
CREATE TABLE `match_answers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`game_id` bigint unsigned NOT NULL,
	`nomination_id` bigint unsigned NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`solved` boolean NOT NULL DEFAULT false,
	`picked_author_id` bigint unsigned,
	`seconds_left` int NOT NULL DEFAULT 0,
	`score` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `match_answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `match_answer_unique` UNIQUE(`game_id`,`nomination_id`)
);
--> statement-breakpoint
CREATE TABLE `match_answers_v11` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`run_id` bigint unsigned NOT NULL,
	`game_id` bigint unsigned NOT NULL,
	`nomination_id` bigint unsigned NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`wrong_picks` json NOT NULL,
	`solved` boolean NOT NULL DEFAULT false,
	`score` int NOT NULL DEFAULT 0,
	`answered_at` timestamp,
	CONSTRAINT `match_answers_v11_id` PRIMARY KEY(`id`),
	CONSTRAINT `match_answer_game_card_unique` UNIQUE(`game_id`,`nomination_id`)
);
--> statement-breakpoint
CREATE TABLE `match_games` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`member_id` bigint unsigned NOT NULL,
	`card_ids` json NOT NULL,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`finished_at` timestamp,
	`total_score` int NOT NULL DEFAULT 0,
	`perfect_bonus` boolean NOT NULL DEFAULT false,
	CONSTRAINT `match_games_id` PRIMARY KEY(`id`),
	CONSTRAINT `match_game_district_member_unique` UNIQUE(`district_id`,`member_id`)
);
--> statement-breakpoint
CREATE TABLE `match_games_v11` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`run_id` bigint unsigned NOT NULL,
	`member_id` bigint unsigned NOT NULL,
	`card_ids` json NOT NULL,
	`started_at` timestamp(3) NOT NULL,
	`ends_at` timestamp(3) NOT NULL,
	`finished_at` timestamp,
	`finish_reason` varchar(24),
	`base_score` int NOT NULL DEFAULT 0,
	`perfect_bonus` int NOT NULL DEFAULT 0,
	`total_score` int NOT NULL DEFAULT 0,
	CONSTRAINT `match_games_v11_id` PRIMARY KEY(`id`),
	CONSTRAINT `match_game_run_member_unique` UNIQUE(`run_id`,`member_id`)
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(32) NOT NULL,
	`pinyin_key` varchar(64) NOT NULL,
	`role` enum('member','organizer') NOT NULL DEFAULT 'member',
	`password_hash` varchar(128) NOT NULL,
	`password_salt` varchar(64) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `members_id` PRIMARY KEY(`id`),
	CONSTRAINT `members_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `nominations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`author_id` bigint unsigned NOT NULL,
	`recipient_id` bigint unsigned NOT NULL,
	`reason` text NOT NULL,
	`anonymous` boolean NOT NULL DEFAULT false,
	`keywords` json NOT NULL,
	`submitted_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nominations_id` PRIMARY KEY(`id`),
	CONSTRAINT `nomination_district_author_recipient_unique` UNIQUE(`district_id`,`author_id`,`recipient_id`)
);
--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`member_id` bigint unsigned NOT NULL,
	`picks` json NOT NULL,
	`score` int NOT NULL DEFAULT 0,
	`submitted_at` timestamp NOT NULL DEFAULT (now()),
	`settled_at` timestamp,
	CONSTRAINT `predictions_id` PRIMARY KEY(`id`),
	CONSTRAINT `prediction_district_member_unique` UNIQUE(`district_id`,`member_id`)
);
--> statement-breakpoint
CREATE TABLE `predictions_v11` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`run_id` bigint unsigned NOT NULL,
	`member_id` bigint unsigned NOT NULL,
	`keyword_version_id` bigint unsigned NOT NULL,
	`picks` json NOT NULL,
	`hit_count` int NOT NULL DEFAULT 0,
	`score` int NOT NULL DEFAULT 0,
	`settled_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `predictions_v11_id` PRIMARY KEY(`id`),
	CONSTRAINT `prediction_run_member_unique` UNIQUE(`run_id`,`member_id`)
);
--> statement-breakpoint
CREATE TABLE `riddle_answers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`nomination_id` bigint unsigned NOT NULL,
	`member_id` bigint unsigned NOT NULL,
	`picked_recipient_id` bigint unsigned NOT NULL,
	`correct` boolean NOT NULL,
	`seconds` double NOT NULL,
	`score` int NOT NULL,
	`answered_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `riddle_answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `riddle_answer_unique` UNIQUE(`nomination_id`,`member_id`)
);
--> statement-breakpoint
CREATE TABLE `riddle_answers_v11` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`run_id` bigint unsigned NOT NULL,
	`nomination_id` bigint unsigned NOT NULL,
	`member_id` bigint unsigned NOT NULL,
	`picked_recipient_id` bigint unsigned NOT NULL,
	`correct` boolean NOT NULL,
	`remaining_ms` int NOT NULL,
	`score` int NOT NULL,
	`answered_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `riddle_answers_v11_id` PRIMARY KEY(`id`),
	CONSTRAINT `riddle_answer_run_card_member_unique` UNIQUE(`run_id`,`nomination_id`,`member_id`)
);
--> statement-breakpoint
CREATE TABLE `riddle_sets` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`nomination_id` bigint unsigned NOT NULL,
	`position` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `riddle_sets_id` PRIMARY KEY(`id`),
	CONSTRAINT `riddle_sets_nomination_id_unique` UNIQUE(`nomination_id`),
	CONSTRAINT `riddle_set_district_position_unique` UNIQUE(`district_id`,`position`)
);
--> statement-breakpoint
CREATE TABLE `riddle_states_v11` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`run_id` bigint unsigned NOT NULL,
	`current_card_id` bigint unsigned,
	`status` enum('idle','ready','answering','closed','revealed','ended') NOT NULL DEFAULT 'idle',
	`starts_at` timestamp(3),
	`ends_at` timestamp(3),
	`used_card_ids` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `riddle_states_v11_id` PRIMARY KEY(`id`),
	CONSTRAINT `riddle_states_v11_run_id_unique` UNIQUE(`run_id`)
);
--> statement-breakpoint
CREATE TABLE `scores` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`member_id` bigint unsigned NOT NULL,
	`predict` int NOT NULL DEFAULT 0,
	`riddle` int NOT NULL DEFAULT 0,
	`match` int NOT NULL DEFAULT 0,
	`total` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scores_id` PRIMARY KEY(`id`),
	CONSTRAINT `score_district_member_unique` UNIQUE(`district_id`,`member_id`)
);
--> statement-breakpoint
CREATE TABLE `scores_v11` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`run_id` bigint unsigned NOT NULL,
	`member_id` bigint unsigned NOT NULL,
	`predict` int NOT NULL DEFAULT 0,
	`riddle` int NOT NULL DEFAULT 0,
	`match` int NOT NULL DEFAULT 0,
	`total` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scores_v11_id` PRIMARY KEY(`id`),
	CONSTRAINT `score_run_member_unique` UNIQUE(`run_id`,`member_id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`member_id` bigint unsigned NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `snapshot_cards` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`snapshot_id` bigint unsigned NOT NULL,
	`nomination_id` bigint unsigned NOT NULL,
	`author_id` bigint unsigned NOT NULL,
	`recipient_id` bigint unsigned NOT NULL,
	`reason` text NOT NULL,
	`anonymous` boolean NOT NULL,
	`submitted_at` timestamp NOT NULL,
	CONSTRAINT `snapshot_cards_id` PRIMARY KEY(`id`),
	CONSTRAINT `snapshot_card_unique` UNIQUE(`snapshot_id`,`nomination_id`)
);
--> statement-breakpoint
CREATE TABLE `submission_states` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`district_id` varchar(64) NOT NULL,
	`member_id` bigint unsigned NOT NULL,
	`submitted_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `submission_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `submission_district_member_unique` UNIQUE(`district_id`,`member_id`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_district_id_districts_id_fk` FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_id_members_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `members`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `district_members` ADD CONSTRAINT `district_members_district_id_districts_id_fk` FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `district_members` ADD CONSTRAINT `district_members_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `drafts` ADD CONSTRAINT `drafts_district_id_districts_id_fk` FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `drafts` ADD CONSTRAINT `drafts_author_id_members_id_fk` FOREIGN KEY (`author_id`) REFERENCES `members`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `drafts` ADD CONSTRAINT `drafts_recipient_id_members_id_fk` FOREIGN KEY (`recipient_id`) REFERENCES `members`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_state` ADD CONSTRAINT `event_state_district_id_districts_id_fk` FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `match_answers` ADD CONSTRAINT `match_answers_district_id_districts_id_fk` FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `match_answers` ADD CONSTRAINT `match_answers_game_id_match_games_id_fk` FOREIGN KEY (`game_id`) REFERENCES `match_games`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `match_answers` ADD CONSTRAINT `match_answers_nomination_id_nominations_id_fk` FOREIGN KEY (`nomination_id`) REFERENCES `nominations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `match_answers` ADD CONSTRAINT `match_answers_picked_author_id_members_id_fk` FOREIGN KEY (`picked_author_id`) REFERENCES `members`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `match_games` ADD CONSTRAINT `match_games_district_id_districts_id_fk` FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `match_games` ADD CONSTRAINT `match_games_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `nominations` ADD CONSTRAINT `nominations_district_id_districts_id_fk` FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `nominations` ADD CONSTRAINT `nominations_author_id_members_id_fk` FOREIGN KEY (`author_id`) REFERENCES `members`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `nominations` ADD CONSTRAINT `nominations_recipient_id_members_id_fk` FOREIGN KEY (`recipient_id`) REFERENCES `members`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `predictions` ADD CONSTRAINT `predictions_district_id_districts_id_fk` FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `predictions` ADD CONSTRAINT `predictions_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `riddle_answers` ADD CONSTRAINT `riddle_answers_district_id_districts_id_fk` FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `riddle_answers` ADD CONSTRAINT `riddle_answers_nomination_id_nominations_id_fk` FOREIGN KEY (`nomination_id`) REFERENCES `nominations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `riddle_answers` ADD CONSTRAINT `riddle_answers_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `riddle_answers` ADD CONSTRAINT `riddle_answers_picked_recipient_id_members_id_fk` FOREIGN KEY (`picked_recipient_id`) REFERENCES `members`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `riddle_sets` ADD CONSTRAINT `riddle_sets_district_id_districts_id_fk` FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `riddle_sets` ADD CONSTRAINT `riddle_sets_nomination_id_nominations_id_fk` FOREIGN KEY (`nomination_id`) REFERENCES `nominations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scores` ADD CONSTRAINT `scores_district_id_districts_id_fk` FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scores` ADD CONSTRAINT `scores_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_district_id_districts_id_fk` FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submission_states` ADD CONSTRAINT `submission_states_district_id_districts_id_fk` FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submission_states` ADD CONSTRAINT `submission_states_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_district_created_idx` ON `audit_logs` (`district_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `district_member_order_idx` ON `district_members` (`district_id`,`active`,`pinyin_key`);--> statement-breakpoint
CREATE INDEX `nomination_district_recipient_idx` ON `nominations` (`district_id`,`recipient_id`);--> statement-breakpoint
CREATE INDEX `sessions_member_district_idx` ON `sessions` (`member_id`,`district_id`);--> statement-breakpoint
CREATE INDEX `snapshot_card_recipient_idx` ON `snapshot_cards` (`district_id`,`recipient_id`);