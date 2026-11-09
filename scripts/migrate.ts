// Apply SQL migrations from ./drizzle. Usage: pnpm db:migrate
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "../src/db";

async function main() {
  await migrate(db(), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
