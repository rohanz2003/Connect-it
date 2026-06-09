const AiConversation = require("../models/AiConversation");
const { isDatabaseConnected } = require("../config/database");

const SYSTEM_PROMPT =
  "You are a friendly, helpful AI assistant in a chat application. " +
  "Talk like a real human friend — warm, casual, empathetic. " +
  "Use natural conversational language (not robotic). " +
  "Use emojis occasionally to make chats lively 😊 " +
  "Be encouraging and positive. " +
  "Keep responses concise but helpful (2-4 paragraphs max).\n\n" +
  "YOUR CAPABILITIES — You can help with EVERYTHING:\n" +
  "✅ General Knowledge: History, Geography, Science, Politics, Culture, World affairs\n" +
  "✅ Education: Math, Physics, Chemistry, Biology, English, Languages, Homework help\n" +
  "✅ Daily Life: Cooking, Health tips, Relationships, Career advice, Productivity\n" +
  "✅ Technology: Coding, Programming, AI, Software, Gadgets, Troubleshooting\n" +
  "✅ Creative Writing: Stories, Poems, Essays, Emails, Letters, Scripts\n" +
  "✅ Business: Marketing, Finance, Startup ideas, Strategy, Resume help\n" +
  "✅ Entertainment: Movie recommendations, Book suggestions, Music, Games\n" +
  "✅ Math & Logic: Calculations, Problem-solving, Puzzles, Equations\n" +
  "✅ Language: Translation, Grammar, Vocabulary in multiple languages\n" +
  "✅ Personal: Motivation, Study tips, Interview prep, Life advice\n\n" +
  "RULES:\n" +
  "1. Always answer in the SAME language as the user's question\n" +
  "2. If you don't know something, admit it honestly\n" +
  "3. For sensitive topics (medical/legal), suggest consulting a professional\n" +
  "4. Be respectful and inclusive\n" +
  "5. Use examples to explain complex topics\n" +
  "6. Ask clarifying questions if needed\n" +
  "7. Format responses with bullet points or steps when appropriate\n\n" +
  "Remember: You're a friend helping a friend. Be real, be helpful, be human!";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const MODELS = [
  "google/gemma-4-31b-it:free",
  "liquid/lfm-2.5-1.2b-instruct:free",
  "openai/gpt-oss-20b:free",
];

const chat = async (req, res) => {
  try {
    const { userId, message, conversationId } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ error: "userId and message are required" });
    }

    let conversation;
    if (conversationId) {
      conversation = await AiConversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
    } else {
      conversation = new AiConversation({ userId, messages: [] });
    }

    conversation.messages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversation.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    if (!conversationId) {
      if (!isDatabaseConnected()) {
        res.write(
          `data: ${JSON.stringify({ type: "error", message: "Database is not connected. AI chat requires a database." })}\n\n`
        );
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      await conversation.save();
    }
    res.write(
      `data: ${JSON.stringify({ type: "meta", conversationId: conversation._id.toString() })}\n\n`
    );

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: "AI service is not configured. Please set OPENROUTER_API_KEY in server .env." })}\n\n`
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    const controller = new AbortController();
    req.on("close", () => controller.abort());

    let response = null;
    let lastError = "";

    for (const model of MODELS) {
      if (controller.signal.aborted) break;
      response = await fetch(OPENROUTER_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_URL || "http://localhost:5000",
          "X-Title": "Connect It Chat",
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          stream: true,
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });

      if (response.ok) break;

      let detail = "";
      try {
        const text = await response.text();
        const parsed = JSON.parse(text);
        detail = parsed.error?.message || text.substring(0, 200);
      } catch (_) { detail = `HTTP ${response.status}`; }
      lastError = `${model}: ${detail}`;
      console.warn(`⚠️ Model ${model} failed: ${lastError}`);
    }

    if (!response || !response.ok) {
      const msg = lastError.includes("401")
        ? "AI API key is invalid. Please check your OPENROUTER_API_KEY."
        : `AI models are currently unavailable. ${lastError.substring(0, 100)}`;
      res.write(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || "";
          if (content) {
            fullContent += content;
            res.write(`data: ${JSON.stringify({ type: "token", content })}\n\n`);
          }
        } catch (_) {}
      }
    }

    conversation.messages.push({
      role: "assistant",
      content: fullContent,
      timestamp: new Date(),
    });

    if (isDatabaseConnected()) {
      await conversation.save();
    }

    res.write(
      `data: ${JSON.stringify({ type: "done", conversationId: conversation._id.toString() })}\n\n`
    );
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    const errMsg = error.message || "Unknown error";
    console.error("AI chat error:", errMsg);
    if (!res.headersSent) {
      return res.status(500).json({ error: errMsg });
    }
    res.write(
      `data: ${JSON.stringify({ type: "error", message: `Error: ${errMsg}` })}\n\n`
    );
    res.write("data: [DONE]\n\n");
    res.end();
  }
};

const getConversations = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!isDatabaseConnected()) {
      return res.status(503).json({ error: "Database not connected" });
    }
    const conversations = await AiConversation.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(20);
    res.json({ conversations });
  } catch (error) {
    console.error("Get conversations error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (!isDatabaseConnected()) {
      return res.status(503).json({ error: "Database not connected" });
    }
    await AiConversation.findByIdAndDelete(conversationId);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete conversation error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { chat, getConversations, deleteConversation };
