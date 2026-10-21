import os from "node:os";
import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  if (!fileEnv.TEST_DATABASE_URL) {
    throw new Error("Set TEST_DATABASE_URL in .env — a separate database such as …/kos_test. It is wiped on every run.");
  }
  return {
    resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      globalSetup: ["tests/global-setup.ts"],
      fileParallelism: false,
      testTimeout: 20_000,
      env: {
        ...fileEnv,
        DATABASE_URL: fileEnv.TEST_DATABASE_URL,
        // Files written by tests (KTP, contracts, photos) never land in the real ./storage.
        STORAGE_DRIVER: "local",
        STORAGE_LOCAL_DIR: path.join(os.tmpdir(), "kos-bot-test-storage"),
        APP_URL: "http://localhost:3000",
        // Integrations are always off in tests: nothing ever reaches WhatsApp, Xendit or Resend.
        WA_PHONE_NUMBER_ID: "",
        WA_ACCESS_TOKEN: "",
        WA_APP_SECRET: "",
        WA_VERIFY_TOKEN: "",
        WA_BOT_PHONE_E164: "",
        OWNER_PHONE_E164: "",
        XENDIT_SECRET_KEY: "",
        XENDIT_WEBHOOK_TOKEN: "",
        RESEND_API_KEY: "",
      },
    },
  };
});
