/**
 * A button attached to an assistant reply. Tools add them; each channel
 * renders them its own way (web: buttons in the bubble, WhatsApp: cta_url).
 * Paths only — the host is always our own site, so a tricked model can never
 * attach an outside payment link.
 */
export type ChatAction = { kind: "link"; label: string; path: string };

const SAFE_PATH = /^\/(?![/\\])[A-Za-z0-9\-._~/?=&%]*$/;
const MAX_ACTIONS = 5;
const MAX_LABEL = 20; // WhatsApp's button text limit

export function addAction(target: { actions: ChatAction[] }, label: string, path: string): void {
  if (!SAFE_PATH.test(path)) {
    throw new Error(`Refusing a button to "${path.slice(0, 60)}": only pages on this site are allowed.`);
  }
  const clean = label.trim().slice(0, MAX_LABEL);
  if (!clean) throw new Error("A button needs a label.");
  if (target.actions.length >= MAX_ACTIONS || target.actions.some((a) => a.path === path)) return;
  target.actions.push({ kind: "link", label: clean, path });
}

/** Reads actions back from a stored message, dropping anything malformed or unsafe. */
export function parseActions(raw: unknown): ChatAction[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const a = item as Partial<ChatAction> | null;
    if (!a || a.kind !== "link" || typeof a.label !== "string" || typeof a.path !== "string") return [];
    if (!SAFE_PATH.test(a.path)) return [];
    return [{ kind: "link" as const, label: a.label.slice(0, MAX_LABEL), path: a.path }];
  });
}
