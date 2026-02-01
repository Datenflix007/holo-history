import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "path";
import fs from "fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const file = path.join(dataDir, "data.json");
const legacyFile = path.join(__dirname, "data.json");

const adapter = new JSONFile(file);
export const db = new Low(adapter, { groups: {} });

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureDataFile() {
  await fs.mkdir(dataDir, { recursive: true });
  const hasNew = await pathExists(file);
  if (!hasNew && await pathExists(legacyFile)) {
    await fs.copyFile(legacyFile, file);
  }
}

export async function initDb() {
  await ensureDataFile();
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
  if (!groupId || groupId === "all") {
    return collectAllCards(db.data);
  }
  return (db.data.groups[groupId]?.cards || []).slice(-200);
}

export async function getPersona(groupId) {
  await db.read();
  return db.data.groups[groupId]?.persona || null;
}

export async function setPersona(groupId, persona) {
  await db.read();
  db.data.groups[groupId] ||= {};
  db.data.groups[groupId].persona = { ...persona };
  await db.write();
  return db.data.groups[groupId].persona;
}

export async function topKCards(groupId, query, k = 6) {
  // MVP: keyword scoring (spaeter: Embeddings/Vektorindex)
  const cards = await listCards(groupId);
  const q = query.toLowerCase();
  const scored = cards.map(c => {
    const text = `${c.title} ${c.claim} ${c.quote || ""} ${c.source || ""}`.toLowerCase();
    const score = q.split(/\s+/).reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
    return { c, score };
  }).sort((a,b) => b.score - a.score);
  return scored.filter(x => x.score > 0).slice(0, k).map(x => x.c);
}

function collectAllCards(data) {
  return Object.values(data.groups || {}).flatMap(group => group.cards || []);
}
