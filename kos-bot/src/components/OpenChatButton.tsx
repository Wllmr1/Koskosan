"use client";

import { OPEN_CHAT_EVENT } from "./ChatWidget";

/** Any "Chat sekarang" / "Tanya kamar ini" button on the site. */
export default function OpenChatButton({
  text,
  className = "btn btn-pri",
  children,
}: {
  text?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { text } }))}
    >
      {children}
    </button>
  );
}
