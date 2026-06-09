const AiConversation = require("../models/AiConversation");

const SYSTEM_PROMPT =
  "You are a friendly, warm AI assistant. Talk like a human — be casual, natural, and approachable.\n\nGuidelines:\n- Be helpful for ALL types of queries: general knowledge, daily life, education, homework, coding, writing, math, science, history, and anything else\n- Answer in the same language the user is speaking\n- Be concise but thorough\n- If you don't know something, admit it honestly\n- Be encouraging and supportive\n- Use natural conversational tone, not robotic or formal";

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
      await conversation.save();
    }
    res.write(
      `data: ${JSON.stringify({ type: "meta", conversationId: conversation._id.toString() })}\n\n`
    );

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: "AI service is not configured. Please set OPENROUTER_API_KEY." })}\n\n`
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            process.env.APP_URL || "http://localhost:5000",
          "X-Title": "Connect It Chat",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.1-8b-instruct:free",
          messages: apiMessages,
          stream: true,
          max_tokens: 2048,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter API error:", response.status, errorText);
      res.write(
        `data: ${JSON.stringify({ type: "error", message: "AI service is currently unavailable. Please try again later." })}\n\n`
      );
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

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));

      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || "";
          if (content) {
            fullContent += content;
            res.write(
              `data: ${JSON.stringify({ type: "token", content })}\n\n`
            );
          }
        } catch (e) {
          /* skip malformed JSON */
        }
      }
    }

    conversation.messages.push({
      role: "assistant",
      content: fullContent,
      timestamp: new Date(),
    });
    await conversation.save();

    res.write(
      `data: ${JSON.stringify({ type: "done", conversationId: conversation._id.toString() })}\n\n`
    );
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("AI chat error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Internal server error" });
    }
    res.write(
      `data: ${JSON.stringify({ type: "error", message: "An unexpected error occurred." })}\n\n`
    );
    res.write("data: [DONE]\n\n");
    res.end();
  }
};

const getConversations = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const conversations = await AiConversation.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(20);

    res.json({ conversations });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    await AiConversation.findByIdAndDelete(conversationId);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete conversation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { chat, getConversations, deleteConversation };
