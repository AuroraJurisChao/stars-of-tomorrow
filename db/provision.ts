import "dotenv/config";
import { randomInt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createConnection, type RowDataPacket } from "mysql2/promise";
import { hashPassword } from "../api/security";
import {
  DEFAULT_DISTRICT_ID,
  DISTRICTS,
  MEMBERS,
  ORGANIZER_NAME,
  ORGANIZER_PINYIN_KEY,
} from "../contracts/constants";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const DEMO_MEMBER_NAMES = ["陈晨", "林晓星", "孙嘉禾", "吴天宇", "许知远", "周雨桐"];

export function randomInitialPassword() {
  for (;;) {
    const value = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    if (/[A-Za-z]/.test(value) && /\d/.test(value)) return value;
  }
}

export function isDefaultDemoRoster() {
  return DISTRICTS.length === 1
    && DEFAULT_DISTRICT_ID === "demo-team"
    && ORGANIZER_NAME === "组织者"
    && MEMBERS.length === DEMO_MEMBER_NAMES.length
    && MEMBERS.every((member, index) => member.name === DEMO_MEMBER_NAMES[index]);
}

export function buildCredentialPlan(demo: boolean) {
  if (demo && !isDefaultDemoRoster()) {
    throw new Error("Demo passwords are only available with the original fictional roster.");
  }
  return [
    ...MEMBERS.map(member => ({
      ...member,
      role: "member" as const,
      password: demo ? "Demo1234" : randomInitialPassword(),
    })),
    {
      name: ORGANIZER_NAME,
      pinyinKey: ORGANIZER_PINYIN_KEY,
      role: "organizer" as const,
      password: demo ? "Organizer1234" : randomInitialPassword(),
    },
  ];
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function provision(demo: boolean) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required. Run npm run setup:env first.");
  const plan = buildCredentialPlan(demo);
  const connection = await createConnection(databaseUrl);
  const existingNames = new Set<string>();
  try {
    await connection.beginTransaction();
    const [accountRows] = await connection.query<RowDataPacket[]>(
      "SELECT id,name,role,active FROM members WHERE name IN (?) FOR UPDATE",
      [plan.map(account => account.name)],
    );
    for (const account of accountRows) {
      const expected = plan.find(item => item.name === account.name);
      if (!expected || expected.role !== account.role) throw new Error(`Existing account role mismatch: ${account.name}`);
      existingNames.add(account.name);
    }

    for (const district of DISTRICTS) {
      await connection.query(
        `INSERT INTO districts (id,name,enabled,sort_order) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name),enabled=VALUES(enabled),sort_order=VALUES(sort_order)`,
        [district.id, district.name, district.enabled ? 1 : 0, district.sortOrder],
      );
      await connection.query(
        `INSERT INTO event_state (district_id,id,phase,game_mode,step,payload,revision)
         VALUES (?,1,'collect','trial',0,JSON_OBJECT(),1)
         ON DUPLICATE KEY UPDATE district_id=VALUES(district_id)`,
        [district.id],
      );
    }

    const newAccounts = plan.filter(account => !existingNames.has(account.name));
    const hashes = new Map<string, { hash: string; salt: string }>();
    for (const account of newAccounts) hashes.set(account.name, await hashPassword(account.password));
    for (const account of newAccounts) {
      const credential = hashes.get(account.name)!;
      await connection.query(
        "INSERT INTO members (name,pinyin_key,role,password_hash,password_salt,active) VALUES (?,?,?,?,?,1)",
        [account.name, account.pinyinKey, account.role, credential.hash, credential.salt],
      );
    }

    const [allAccounts] = await connection.query<RowDataPacket[]>(
      "SELECT id,name FROM members WHERE name IN (?)",
      [plan.map(account => account.name)],
    );
    const ids = new Map(allAccounts.map(account => [account.name, Number(account.id)]));
    for (const account of plan) {
      const memberId = ids.get(account.name);
      if (!memberId) throw new Error(`Account was not available after provisioning: ${account.name}`);
      await connection.query(
        `INSERT INTO district_members (district_id,member_id,pinyin_key,active) VALUES (?,?,?,1)
         ON DUPLICATE KEY UPDATE pinyin_key=VALUES(pinyin_key)`,
        [DEFAULT_DISTRICT_ID, memberId, account.pinyinKey],
      );
    }
    await connection.commit();

    const rows = plan.map(account => [
      DISTRICTS.find(district => district.id === DEFAULT_DISTRICT_ID)?.name ?? DEFAULT_DISTRICT_ID,
      account.name,
      account.role === "organizer" ? "组织者" : "成员",
      existingNames.has(account.name) ? "" : account.password,
      existingNames.has(account.name)
        ? "账号已存在，未重置密码"
        : demo ? "公开演示初始密码，仅限本地体验" : "随机初始密码，请首次登录后修改",
    ]);
    const csv = `\uFEFF${[
      ["选区", "姓名", "角色", "初始密码", "备注"],
      ...rows,
    ].map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
    const directory = path.resolve(process.cwd(), "runtime-credentials");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const output = path.join(directory, `initial-credentials-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}.csv`);
    writeFileSync(output, csv, { encoding: "utf8", mode: 0o600, flag: "wx" });
    console.log(`Provisioning complete: ${newAccounts.length} new accounts; existing passwords were not changed.`);
    console.log(`Private credential list: ${output}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

if (process.argv[1]?.endsWith("provision.ts") || process.argv[1]?.endsWith("provision.js")) {
  const demo = process.argv.slice(2).includes("--demo");
  provision(demo).catch(error => {
    console.error(`Provisioning failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exitCode = 1;
  });
}
