import { describe, expect, it } from "vitest";
import type { Env } from "@/env";
import { assertProductionReady, emailEnabled, fakePaymentsAllowed, paymentsLive, whatsappEnabled } from "@/lib/features";

const base = {
  WA_PHONE_NUMBER_ID: "",
  WA_ACCESS_TOKEN: "",
  WA_APP_SECRET: "",
  WA_VERIFY_TOKEN: "",
  WA_BOT_PHONE_E164: "",
  OWNER_PHONE_E164: "",
  XENDIT_SECRET_KEY: "",
  XENDIT_WEBHOOK_TOKEN: "",
  RESEND_API_KEY: "",
} as Env;

const wa = {
  ...base,
  WA_PHONE_NUMBER_ID: "1",
  WA_ACCESS_TOKEN: "t",
  WA_APP_SECRET: "s",
  WA_VERIFY_TOKEN: "v",
  WA_BOT_PHONE_E164: "+628111",
  OWNER_PHONE_E164: "+628222",
} as Env;

describe("feature flags", () => {
  it("everything is off with blank settings", () => {
    expect(whatsappEnabled(base)).toBe(false);
    expect(paymentsLive(base)).toBe(false);
    expect(emailEnabled(base)).toBe(false);
  });

  it("WhatsApp needs every value in its group", () => {
    expect(whatsappEnabled(wa)).toBe(true);
    expect(whatsappEnabled({ ...wa, OWNER_PHONE_E164: "" })).toBe(false);
  });

  it("payments need both Xendit values", () => {
    expect(paymentsLive({ ...base, XENDIT_SECRET_KEY: "k" })).toBe(false);
    expect(paymentsLive({ ...base, XENDIT_SECRET_KEY: "k", XENDIT_WEBHOOK_TOKEN: "t" })).toBe(true);
  });

  it("fake payments only without Xendit and outside production", () => {
    expect(fakePaymentsAllowed(base, "development")).toBe(true);
    expect(fakePaymentsAllowed(base, "production")).toBe(false);
    expect(fakePaymentsAllowed({ ...base, XENDIT_SECRET_KEY: "k", XENDIT_WEBHOOK_TOKEN: "t" }, "development")).toBe(false);
  });

  it("production refuses to start without Xendit", () => {
    expect(() => assertProductionReady(base, "production")).toThrow(/XENDIT/);
    expect(() => assertProductionReady(base, "development")).not.toThrow();
  });
});
