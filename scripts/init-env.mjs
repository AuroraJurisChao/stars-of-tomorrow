import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const output = path.resolve(process.cwd(), ".env");
if (existsSync(output)) {
  console.error(".env already exists; leave it unchanged or edit it manually.");
  process.exit(1);
}

const databasePassword = randomBytes(24).toString("hex");
const rootPassword = randomBytes(32).toString("hex");
const appSecret = randomBytes(48).toString("hex");
const content = `# Generated locally. Never commit or share this file.
APP_ID=stars-of-tomorrow
APP_SECRET=${appSecret}
MYSQL_DATABASE=stars_of_tomorrow
MYSQL_USER=stars
MYSQL_PASSWORD=${databasePassword}
MYSQL_ROOT_PASSWORD=${rootPassword}
DATABASE_URL=mysql://stars:${databasePassword}@127.0.0.1:3306/stars_of_tomorrow
DB_BIND=127.0.0.1
DB_PORT=3306
APP_BIND=127.0.0.1
APP_PORT=3000
APP_LOG_DIR=runtime-logs
APP_LOG_FILE=runtime-logs/app.log
LLM_API_KEY=
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-flash
DOMAIN=
ACME_EMAIL=
`;

writeFileSync(output, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
console.log("Created .env with random local secrets. No secret values were printed.");
