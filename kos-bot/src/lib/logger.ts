/** Structured logs with personal data stripped. Never log a full ID or phone. */
const SENSITIVE = /\b(\d{16})\b|\b(\+?62\d{8,13})\b/g;

function scrub(value: unknown): unknown {
  if (typeof value === "string") return value.replace(SENSITIVE, "[redacted]");
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
  }
  return value;
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) =>
    console.log(JSON.stringify({ level: "info", msg, ...(meta ? (scrub(meta) as object) : {}), t: new Date().toISOString() })),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    console.warn(JSON.stringify({ level: "warn", msg, ...(meta ? (scrub(meta) as object) : {}), t: new Date().toISOString() })),
  error: (msg: string, meta?: Record<string, unknown>) =>
    console.error(JSON.stringify({ level: "error", msg, ...(meta ? (scrub(meta) as object) : {}), t: new Date().toISOString() })),
};
