const SESSION_TTL_MS = 60 * 60 * 1000;
const MAX_HISTORY_MESSAGES = 20;

const sessions = new Map();

function getHistory(userId) {
  const session = sessions.get(userId);
  if (!session) return [];

  if (Date.now() - session.lastActive > SESSION_TTL_MS) {
    sessions.delete(userId);
    return [];
  }

  return session.messages;
}

function appendTurn(userId, userMessage, assistantReply) {
  const messages = getHistory(userId);
  messages.push({ role: "user", content: userMessage });
  messages.push({ role: "assistant", content: assistantReply });

  while (messages.length > MAX_HISTORY_MESSAGES) {
    messages.shift();
  }

  sessions.set(userId, { messages, lastActive: Date.now() });
}

module.exports = { getHistory, appendTurn };
