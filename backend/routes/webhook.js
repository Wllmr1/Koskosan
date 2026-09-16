const express = require("express");
const router = express.Router();

const { askClaude } = require("../lib/claude");
const { sendWhatsAppMessage } = require("../lib/whatsapp");
const { getHistory, appendTurn } = require("../lib/sessionStore");
const { loadKnowledgeBase, buildSystemPrompt } = require("../config");

const systemPrompt = buildSystemPrompt(loadKnowledgeBase());

router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || message.type !== "text") return;

    const from = message.from;
    const text = message.text.body;

    const history = getHistory(from);
    const reply = await askClaude(systemPrompt, history, text);

    appendTurn(from, text, reply);
    await sendWhatsAppMessage(from, reply);
  } catch (err) {
    console.error("Webhook error:", err.message);
  }
});

module.exports = router;
