import { execSync } from "node:child_process";
import { loadEnv } from "vite";

/**
 * Brings the test database up to the current schema and seeds it, once per
 * `npm test`. No reset: tests use run-unique ids, so leftover rows from
 * earlier runs never collide and nothing is ever wiped.
 */
export default function setup() {
  const fileEnv = loadEnv("test", process.cwd(), "");
  const env = { ...process.env, DATABASE_URL: fileEnv.TEST_DATABASE_URL };
  execSync("npx prisma db push --skip-generate", { env, stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });
}
