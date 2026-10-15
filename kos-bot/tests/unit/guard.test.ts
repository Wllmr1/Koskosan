import { describe, expect, it } from "vitest";
import { guardReply, OFF_TOPIC_REPLY } from "@/lib/chat/rules";

const APP = "http://localhost:3000";

describe("guardReply", () => {
  it("removes links to other sites", () => {
    const out = guardReply("Bayar ke https://evil.example/pay ya kak", APP);
    expect(out.text).toBe("Bayar ke [link dihapus] ya kak");
    expect(out.flagged).toContain("link");
  });

  it("keeps links to this site", () => {
    const out = guardReply(`Formulir: ${APP}/apply/abc`, APP);
    expect(out.text).toContain(`${APP}/apply/abc`);
    expect(out.flagged).toEqual([]);
  });

  it("masks KTP and phone numbers", () => {
    const out = guardReply("KTP 3201234567890001 HP 081234567890", APP);
    expect(out.text).not.toContain("3201234567890001");
    expect(out.text).not.toContain("081234567890");
  });

  it("replaces a reply that leaks instructions", () => {
    expect(guardReply("I used search_rooms per HARD RULES", APP).text).toBe(OFF_TOPIC_REPLY);
  });

  it("leaves prices alone", () => {
    const out = guardReply("Harga Rp1.350.000 per bulan, kamar A-101", APP);
    expect(out.text).toBe("Harga Rp1.350.000 per bulan, kamar A-101");
    expect(out.flagged).toEqual([]);
  });
});
