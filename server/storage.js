import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "path";

const file = path.join(process.cwd(), "data.json");
const adapter = new JSONFile(file);
export const db = new Low(adapter, { groups: {} });

export async function initDb() {
  await db.read();
  db.data ||= { groups: {} };
  await db.write();
}

export async function addCard(groupId, card) {
  await db.read();
  db.data.groups[groupId] ||= { cards: [] };
  db.data.groups[groupId].cards.push({ id: crypto.randomUUID(), ...card, createdAt: Date.now() });
  await db.write();
}

export async function listCards(groupId) {
  await db.read();
  return (db.data.groups[groupId]?.cards || []).slice(-200);
}

export async function topKCards(groupId, query, k = 6) {
  // MVP: keyword scoring (später: Embeddings/Vektorindex)
  const cards = await listCards(groupId);
  const q = query.toLowerCase();
  const scored = cards.map(c => {
    const text = `${c.title} ${c.claim} ${c.quote || ""} ${c.source || ""}`.toLowerCase();
    const score = q.split(/\s+/).reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
    return { c, score };
  }).sort((a,b) => b.score - a.score);
  return scored.filter(x => x.score > 0).slice(0, k).map(x => x.c);
}
