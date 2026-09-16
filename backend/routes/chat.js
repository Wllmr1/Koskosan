const express = require("express");
const router = express.Router();

const { askClaude } = require("../lib/claude");
const { getHistory, appendTurn } = require("../lib/sessionStore");
const { loadKnowledgeBase, buildSystemPrompt } = require("../config");

const systemPrompt = buildSystemPrompt(loadKnowledgeBase());

router.post("/chat", async (req, res) => {
  const message = req.body.message;
  if (!message) return res.status(400).json({ error: "message is required" });

  const sessionId = req.body.sessionId || "local-demo";

  const history = getHistory(sessionId);
  const reply = await askClaude(systemPrompt, history, message);
  appendTurn(sessionId, message, reply);

  res.json({ reply });
});

module.exports = router;
