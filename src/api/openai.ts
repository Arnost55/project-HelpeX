import type { Message } from "../types/chat";

interface OpenAIChunkDelta {
  content?: string;
}

interface OpenAIChunkChoice {
  delta?: OpenAIChunkDelta;
  finish_reason: string | null;
}

interface OpenAIChunk {
  choices?: OpenAIChunkChoice[];
}

export async function streamOpenAiResponse(params: {
  apiKey: string;
  model: string;
  messages: Message[];
  onToken: (token: string) => void;
}): Promise<void> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: params.model,
      stream: true,
      messages: params.messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    })
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(errorText || "OpenAI request failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }

      const payload = trimmed.replace("data:", "").trim();
      if (payload === "[DONE]") {
        return;
      }

      try {
        const json = JSON.parse(payload) as OpenAIChunk;
        const token = json.choices?.[0]?.delta?.content;
        if (token) {
          params.onToken(token);
        }
      } catch {
        continue;
      }
    }
  }
}
