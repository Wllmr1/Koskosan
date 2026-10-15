import { z } from "zod";

const optional = z.string().optional().default("");
const optionalE164 = z
  .union([z.literal(""), z.string().regex(/^\+\d{8,15}$/, "must look like +628…")])
  .optional()
  .default("");

/** Fail fast at boot rather than halfway through a customer conversation. */
const schema = z.object({
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),

  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 64 hex chars"),
  SESSION_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(16),
  ADMIN_PASSWORD: z.string().min(8),

  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_MODEL: z.string().default("claude-haiku-5-5"),

  // WhatsApp — optional. Switched on only when every value is set (lib/features.ts).
  WA_GRAPH_VERSION: z.string().default("v21.0"),
  WA_PHONE_NUMBER_ID: optional,
  WA_BUSINESS_ACCOUNT_ID: optional,
  WA_ACCESS_TOKEN: optional,
  WA_APP_SECRET: optional,
  WA_VERIFY_TOKEN: optional,
  /** The assistant's own WhatsApp number, for wa.me links. Never the owner's personal number. */
  WA_BOT_PHONE_E164: optionalE164,
  OWNER_PHONE_E164: optionalE164,

  // Xendit — optional in development (fake payments), required in production.
  XENDIT_SECRET_KEY: optional,
  XENDIT_WEBHOOK_TOKEN: optional,

  OWNER_NAME: z.string().default("Pemilik kos"),
  OWNER_EMAIL: z.string().email(),
  RESEND_API_KEY: optional,
  EMAIL_FROM: z.string().default("Kos <noreply@example.com>"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: optional,
  S3_REGION: z.string().optional().default("auto"),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
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
