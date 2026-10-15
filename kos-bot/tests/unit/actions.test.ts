import { describe, expect, it } from "vitest";
import { addAction, parseActions, type ChatAction } from "@/lib/chat/actions";

const target = () => ({ actions: [] as ChatAction[] });

describe("chat actions", () => {
  it("accepts same-site paths", () => {
    const t = target();
    addAction(t, "Buka formulir", "/apply/abc_DEF-123");
    expect(t.actions).toEqual([{ kind: "link", label: "Buka formulir", path: "/apply/abc_DEF-123" }]);
  });

  it.each(["https://evil.example/x", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", "apply/x"])(
    "refuses %s",
    (path) => {
      expect(() => addAction(target(), "x", path)).toThrow(/only pages on this site/);
    }
  );

  it("cuts labels to 20 characters, skips duplicates, keeps at most 5", () => {
    const t = target();
    addAction(t, "Label yang sangat panjang sekali", "/a");
    addAction(t, "Lagi", "/a");
    for (const p of ["/b", "/c", "/d", "/e", "/f"]) addAction(t, "x", p);
    expect(t.actions[0].label).toHaveLength(20);
    expect(t.actions.map((a) => a.path)).toEqual(["/a", "/b", "/c", "/d", "/e"]);
  });

  it("parseActions drops malformed or unsafe rows", () => {
    expect(
      parseActions([
        { kind: "link", label: "Ok", path: "/p/INV-1" },
        { kind: "link", label: "Bad", path: "https://evil.example" },
        "junk",
        null,
      ])
    ).toEqual([{ kind: "link", label: "Ok", path: "/p/INV-1" }]);
    expect(parseActions(null)).toEqual([]);
  });
});
