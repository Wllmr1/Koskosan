import { Channel, ContactType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { toolsFor } from "@/lib/chat/tools";
import { makeCtx } from "../helpers";

const names = (...args: Parameters<typeof makeCtx>) => toolsFor(makeCtx(...args)).map((t) => t.name);

describe("toolsFor", () => {
  it("prospects never see renter tools", () => {
    const list = names();
    expect(list).toContain("search_rooms");
    expect(list).not.toContain("get_my_account");
    expect(list).not.toContain("register_guest");
  });

  it("the WhatsApp verification link is offered only on WhatsApp, only before verification", () => {
    expect(names({ channel: Channel.WHATSAPP, type: ContactType.MEMBER })).toContain("send_verification_link");
    expect(names({ channel: Channel.WEB, type: ContactType.MEMBER })).not.toContain("send_verification_link");
    expect(names({ channel: Channel.WHATSAPP, type: ContactType.MEMBER, verified: true })).not.toContain(
      "send_verification_link"
    );
  });

  it("verified renters get renter tools", () => {
    const list = names({ type: ContactType.MEMBER, verified: true, tenantId: "t1" });
    expect(list).toContain("get_my_account");
    expect(list).toContain("register_guest");
  });

  it("the login button is offered only to website visitors who are not logged in", () => {
    expect(names()).toContain("prompt_login");
    expect(names({ channel: Channel.WHATSAPP })).not.toContain("prompt_login");
    expect(names({ type: ContactType.MEMBER, verified: true, tenantId: "t1" })).not.toContain("prompt_login");
  });
});
