import Anthropic from "@anthropic-ai/sdk";
import { MessageRole } from "@prisma/client";
import { env } from "@/env";
import { log } from "@/lib/logger";
import { wibNow } from "@/lib/money";
import { identityHeader, loadHistory, saveMessage, type ChatCtx } from "./context";
import { OFF_TOPIC_REPLY, RULES } from "./rules";
import { anthropicTools, toolsFor } from "./tools";
import type { ChatAction } from "./actions";

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY }));

/** A tool loop that cannot run away: at most this many round trips per message. */
const MAX_TOOL_ROUNDS = 5;
/**
 * Haiku 5.5 thinks by default and thinking counts toward max_tokens, so this
 * leaves room for it. Reply length is kept short by the rules, not this cap.
 */
const MAX_OUTPUT_TOKENS = 2000;

export type AssistantResult = {
  text: string;
  actions: ChatAction[];
  toolLog: { tool: string; ok: boolean }[];
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

/**
 * Runs one turn: history in, reply out, with the model calling our own
 * functions in between. Every tool runs server-side against ctx, so the model
 * decides WHAT to ask for but never WHOSE data it gets.
 */
export async function runAssistant(ctx: ChatCtx): Promise<AssistantResult> {
  const tools = toolsFor(ctx);
  const messages: Anthropic.MessageParam[] = (await loadHistory(ctx)).map((t) => ({
    role: t.role,
    content: t.content,
  }));

  if (!messages.length) {
    return { text: OFF_TOPIC_REPLY, actions: ctx.actions, toolLog: [], usage: zeroUsage() };
  }

  const toolLog: { tool: string; ok: boolean }[] = [];
  const usage = zeroUsage();
  const now = wibNow();

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic().messages.create({
      model: env().CLAUDE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      // Chat replies are short; low effort keeps thinking (and cost) small.
      output_config: { effort: "low" },
      system: [
        // Static block first and marked cacheable: identical bytes on every
        // request for every user, so this is a cache read after the first call.
        { type: "text", text: RULES, cache_control: { type: "ephemeral" } },
        // Volatile block last: per-person identity and the clock.
        {
          type: "text",
          text: `${identityHeader(ctx)}\nCurrent time: ${now.weekday}, ${now.date}, ${now.time} WIB. Today is ${now.date}; tomorrow is ${new Date(Date.now() + 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10)}.`,
        },
      ],
      tools: anthropicTools(tools),
      messages,
    });

    usage.input += response.usage.input_tokens ?? 0;
    usage.output += response.usage.output_tokens ?? 0;
    usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;

    if (response.stop_reason === "refusal") {
      const text = OFF_TOPIC_REPLY;
      await saveMessage(ctx, MessageRole.ASSISTANT, withLog(text, toolLog), { toolLog, actions: ctx.actions });
      return { text, actions: ctx.actions, toolLog, usage };
    }

    const toolCalls = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (response.stop_reason !== "tool_use" || toolCalls.length === 0) {
      const text = textOf(response.content) || OFF_TOPIC_REPLY;
      await saveMessage(ctx, MessageRole.ASSISTANT, withLog(text, toolLog), { toolLog, actions: ctx.actions });
      return { text, actions: ctx.actions, toolLog, usage };
    }

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolCalls) {
      const tool = tools.find((t) => t.name === call.name);
      try {
        if (!tool) throw new Error("Unknown tool.");
        const output = await tool.run((call.input ?? {}) as Record<string, unknown>, ctx);
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(output).slice(0, 8000),
        });
        toolLog.push({ tool: call.name, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // The model sees why it failed and can recover, e.g. by asking again.
        results.push({ type: "tool_result", tool_use_id: call.id, content: message.slice(0, 500), is_error: true });
        toolLog.push({ tool: call.name, ok: false });
        log.warn("tool failed", { tool: call.name, message });
      }
    }
    messages.push({ role: "user", content: results });
  }

  const fallback = "Maaf kak, ini perlu dicek dulu sama admin. Saya teruskan ya 🙏";
  await saveMessage(ctx, MessageRole.ASSISTANT, withLog(fallback, toolLog), { toolLog, actions: ctx.actions });
  return { text: fallback, actions: ctx.actions, toolLog, usage };
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * The stored assistant turn keeps a tiny trace of which tools ran, so the next
 * turn knows what it already did. The rules tell the model never to echo it,
 * and it is stripped before anything is sent to the customer.
 */
function withLog(text: string, toolLog: { tool: string; ok: boolean }[]): string {
  if (!toolLog.length) return text;
  const trace = toolLog.map((t) => (t.ok ? t.tool : `${t.tool}:failed`)).join(", ");
  return `${text}\n[log: ${trace}]`;
}

export const stripLog = (text: string) => text.replace(/\n?\[log:[^\]]*\]/g, "").trim();

function zeroUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

/**
 * Rough running cost in USD, written to the audit log so you can watch spend.
 * claude-haiku-5-5, prompts up to 100K tokens: $0.10 input / $0.50 output per
 * million tokens; cache writes 1.25× input, cache reads 0.1× input.
 */
export function estimateCostUsd(u: AssistantResult["usage"]): number {
  const IN = 0.1 / 1_000_000;
  const OUT = 0.5 / 1_000_000;
  return u.input * IN + u.cacheWrite * IN * 1.25 + u.cacheRead * IN * 0.1 + u.output * OUT;
}
