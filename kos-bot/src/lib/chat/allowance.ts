import { LIMITS, overLimit } from "@/lib/rate-limit";

/**
 * Whether a website chat message from this IP may reach the assistant at all.
 * Keyed by IP and by the whole site, so clearing cookies (which gives a new
 * anonymous contact and resets the per-contact limits) does not lift the cap.
 */
export async function chatAllowance(ip: string): Promise<"ok" | "minute" | "day"> {
  const { chatIpPerMinute: minute, chatIpPerDay: day, chatAllPerDay: all } = LIMITS;
  if (await overLimit("chat-ip", ip, minute.limit, minute.windowMs)) return "minute";
  if (await overLimit("chat-ip-day", ip, day.limit, day.windowMs)) return "day";
  if (await overLimit("chat-all-day", "all", all.limit, all.windowMs)) return "day";
  return "ok";
}
