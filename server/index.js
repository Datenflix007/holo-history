import express from "express";
import cors from "cors";
import { initDb, addCard, listCards, topKCards } from "./storage.js";
import { config } from "./config.js";

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
