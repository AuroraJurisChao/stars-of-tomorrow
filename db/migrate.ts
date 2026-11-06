import "dotenv/config";
import path from "node:path";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { getDb } from "../api/queries/connection";

async function run() {
  const migrationsFolder = path.resolve(process.cwd(), "db/migrations");
  await migrate(getDb(), { migrationsFolder });
  console.log("Database schema is up to date.");
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(`Database migration failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exit(1);
});
