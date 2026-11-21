"use client";

import { OPEN_CHAT_EVENT } from "@/components/ChatWidget";

/** "Get payment details": WhatsApp with the ready message when set up, otherwise the website chat pre-filled. */
export default function PayChatButton({ link, text, label = "Minta info rekening" }: { link: string | null; text: string; label?: string }) {
  if (link) {
    return <a className="btn pri wa" href={link} target="_blank" rel="noreferrer">{label}</a>;
  }
  return (
    <button className="btn pri wa" type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { text } }))}>
      {label}
    </button>
  );
}
