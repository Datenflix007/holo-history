import express from "express";
import cors from "cors";
import { initDb, addCard, listCards, topKCards } from "./storage.js";
import { config } from "./config.js";
import { buildSystemPrompt } from "./prompts.js";
import { chatCompletion } from "./llm.js";

await initDb();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req,res)=>res.json({ ok:true }));

app.post("/api/cards", async (req,res) => {
  const { groupId, title, claim, quote, source, reliability } = req.body || {};
  if (!groupId || !title || !claim) return res.status(400).json({ error:"missing fields" });
  await addCard(groupId, { title, claim, quote, source, reliability: reliability ?? 3 });
  res.json({ ok:true });
});

app.get("/api/cards", async (req,res) => {
  const groupId = req.query.groupId;
  res.json({ cards: await listCards(groupId) });
});

app.post("/api/retrieve", async (req,res) => {
  const { groupId, query } = req.body || {};
  res.json({ cards: await topKCards(groupId, query, 6) });
});

function formatCards(cards) {
  if (!cards || cards.length === 0) return "Keine Karten vorhanden.";
  return cards.map(c => {
    const parts = [`[${c.id}] ${c.title}: ${c.claim}`];
    if (c.quote) parts.push(`Zitat: ${c.quote}`);
    if (c.source) parts.push(`Quelle: ${c.source}`);
    return `- ${parts.join(" | ")}`;
  }).join("\n");
}

function normalizePersona(persona = {}) {
  return {
    name: persona.name || "Unbekannt",
    year: persona.year || persona.years || "unbekannt",
    place: persona.place || "unbekannt",
  };
}

app.post("/api/ask", async (req,res) => {
  try {
    const { groupId, query, persona } = req.body || {};
    if (!groupId || !query) return res.status(400).json({ error:"missing fields" });
    const cards = await topKCards(groupId, query, 6);
    const system = `${buildSystemPrompt(normalizePersona(persona))}\nKARTEN:\n${formatCards(cards)}\nANTWORT:`;
    const user = `Frage: ${query}\nBitte antworte kurz. Gib nur den Antworttext, keine Labels.`;
    const text = await chatCompletion({ system, user, temperature: 0.4 });
    res.json({ text, sources: cards.map(c => c.id) });
  } catch (err) {
    res.status(500).json({ error: err.message || "LLM error" });
  }
});

app.post("/api/fake-answer", async (req,res) => {
  try {
    const { groupId, persona } = req.body || {};
    if (!groupId) return res.status(400).json({ error:"missing fields" });
    const intents = [
      { id: "self", instruction: "Sag in 1-2 kurzen Saetzen etwas ueber dich selbst." },
      { id: "cabinet", instruction: "Stelle eine kurze Frage an dein Kabinett." },
      { id: "people", instruction: "Stelle eine kurze Frage an die Bevoelkerung." },
      { id: "opposition", instruction: "Stelle eine kurze Frage an politische Gegner." },
      { id: "decision", instruction: "Nenne eine Entscheidung deiner Regentschaft in 1-2 Saetzen." },
    ];
    const intent = intents[Math.floor(Math.random() * intents.length)];
    const cards = await topKCards(groupId, intent.instruction, 6);
    const system = `${buildSystemPrompt(normalizePersona(persona))}\nKARTEN:\n${formatCards(cards)}\nSTIL: ${intent.instruction}\nGib nur den Text aus, ohne Labels.`;
    const user = "Erzeuge eine kurze Aussage oder Frage.";
    const text = await chatCompletion({ system, user, temperature: 0.8 });
    res.json({ text, sources: cards.map(c => c.id), intent: intent.id });
  } catch (err) {
    res.status(500).json({ error: err.message || "LLM error" });
  }
});

/**
 * Realtime-Credentials (Ephemeral)
 * Idee: Browser bekommt kurzlebige Credentials vom Server,
 * damit OPENAI_API_KEY niemals im Frontend liegt. :contentReference[oaicite:7]{index=7}
 *
 * Implementierung orientiert sich an der Realtime WebRTC Doku. :contentReference[oaicite:8]{index=8}
 */
app.post("/api/realtime-token", async (req,res) => {
  // TODO: Implementiere nach OpenAI Doku (ephemeral token / call create)
  // Rückgabe: { token, expiresAt, ... } oder { sdpAnswer, ... } je nach Flow
  res.status(501).json({ error: "Not implemented: follow OpenAI Realtime WebRTC guide." });
});

const port = config.port;
app.listen(port, () => {
  console.log(`Server on http://localhost:${port}`);
  console.log(`LLM: ${config.llm.provider} (${config.llm.model})`);
  if (config.llm.provider === "ollama") {
    console.log(`Ollama base URL: ${config.llm.baseUrl}`);
  }
});
