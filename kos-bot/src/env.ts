import { z } from "zod";

/** Fail fast at boot rather than halfway through a customer conversation. */
const schema = z.object({
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),

  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 64 hex chars"),
  SESSION_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(16),
  ADMIN_PASSWORD: z.string().min(8),

  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_MODEL: z.string().default("claude-haiku-4-5-20251001"),

  WA_GRAPH_VERSION: z.string().default("v21.0"),
  WA_PHONE_NUMBER_ID: z.string().min(1),
  /** The assistant's own WhatsApp number, for wa.me links. Never the owner's personal number. */
  WA_BOT_PHONE_E164: z.string().regex(/^\+\d{8,15}$/, "WA_BOT_PHONE_E164 must look like +628…"),
  WA_BUSINESS_ACCOUNT_ID: z.string().optional().default(""),
  WA_ACCESS_TOKEN: z.string().min(1),
  WA_APP_SECRET: z.string().min(1),
  WA_VERIFY_TOKEN: z.string().min(1),

  XENDIT_SECRET_KEY: z.string().min(1),
  XENDIT_WEBHOOK_TOKEN: z.string().min(1),

  OWNER_NAME: z.string().default("Pemilik kos"),
  OWNER_EMAIL: z.string().email(),
  OWNER_PHONE_E164: z.string().regex(/^\+\d{8,15}$/),
  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("Kos <noreply@example.com>"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().optional().default("auto"),
  S3_BUCKET: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${lines.join("\n")}\n\nCopy .env.example to .env and fill it in.`);
  }
  cached = parsed.data;
  return cached;
}
