const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export const AI_ASSISTANT_ID = "__ai__";
export const AI_DISPLAY_NAME = "AI Assistant";

export function sendAiMessage(userId, message, conversationId, onToken, onMeta, onDone, onError) {
  const controller = new AbortController();

  fetch(`${API_URL}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, message, conversationId }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        onError?.(`Server error: ${response.status} ${text}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;

          try {
            const parsed = JSON.parse(raw);
            switch (parsed.type) {
              case "meta":
                onMeta?.(parsed.conversationId);
                break;
              case "token":
                onToken?.(parsed.content);
                break;
              case "done":
                onDone?.(parsed.conversationId);
                break;
              case "error":
                onError?.(parsed.message);
                break;
            }
          } catch (e) {
            /* skip malformed JSON */
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError?.(err.message || "Network error");
      }
    });

  return controller;
}

export async function fetchAiConversations(userId) {
  const res = await fetch(
    `${API_URL}/api/ai/conversations?userId=${encodeURIComponent(userId)}`
  );
  if (!res.ok) throw new Error("Failed to fetch conversations");
  return res.json();
}

export async function deleteAiConversation(conversationId) {
  const res = await fetch(
    `${API_URL}/api/ai/conversations/${conversationId}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error("Failed to delete conversation");
  return res.json();
}
