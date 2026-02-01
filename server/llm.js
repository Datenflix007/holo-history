import { config } from "./config.js";

export async function chatCompletion({ system, user, temperature = 0.6 }) {
  if (config.llm.provider === "ollama") {
    return chatWithOllama({ system, user, temperature });
  }
  return chatWithOpenAI({ system, user, temperature });
}

async function chatWithOpenAI({ system, user, temperature }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

async function chatWithOllama({ system, user, temperature }) {
  const baseUrl = config.llm.baseUrl || "http://localhost:11434";
  const url = new URL("/api/chat", baseUrl).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.llm.model,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      options: { temperature },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.message?.content || "").trim();
}
