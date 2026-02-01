import { startHoloAvatar } from "./avatar.js";

const API = "http://localhost:8787";
const PERSONA_GROUP_ID = "group-a";
const CARD_GROUP_ID = "group-a";
const CONTEXT_GROUP_ID = "all";
const DEFAULT_PERSONA = {
  name: "Louis-Philippe I",
  years: "1773-1850",
  title: "King of the French"
};

const app = document.getElementById("app");
const toStudio = document.getElementById("toStudio");
const toCards  = document.getElementById("toCards");
const toggleHolo = document.getElementById("toggleHolo");

let currentPersona = { ...DEFAULT_PERSONA };
let currentView = "studio";
let lastGeneratedAvatar = null;
let lastUserMessage = "";
let chatLogEl = null;
let chatInputEl = null;
const chatHistory = [];

toStudio.onclick = showStudio;
toCards.onclick = showCards;
toggleHolo.onclick = () => document.body.classList.toggle("holo");

showStudio();

async function showStudio() {
  currentView = "studio";
  await syncPersona(PERSONA_GROUP_ID);
  renderStudio();
}

function showCards() {
  currentView = "cards";
  chatLogEl = null;
  chatInputEl = null;
  renderCards();
}

function renderStudio(){
  const avatarBlock = currentPersona.avatarUrl
    ? `<div class="avatar-frame holo-pulse"><img id="avatarImage" src="${escapeAttribute(resolveAvatarUrl(currentPersona.avatarUrl))}" alt="Avatar"/></div>`
    : `<canvas id="avatarCanvas"></canvas>`;

  app.innerHTML = `
    <div class="grid">
      <section class="card">
        <div class="small" style="margin-bottom:6px;">
          Testhologramm: <b>${escapeHtml(currentPersona.name || DEFAULT_PERSONA.name)}</b> (${escapeHtml(currentPersona.years || DEFAULT_PERSONA.years)})
        </div>
        ${avatarBlock}
        <audio id="voice" class="audio-hidden"></audio>
        <div class="chat">
          <div id="chatLog" class="chat-log"></div>
          <div class="chat-input-row">
            <input id="chatInput" class="chat-input" type="text" placeholder="Gib eine Nachricht ein." autocomplete="off"/>
            <button id="chatMic" class="icon-btn" title="Spracheingabe">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a4 4 0 0 0-4 4v6a4 4 0 1 0 8 0V6a4 4 0 0 0-4-4zm6 10a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.94V22h2v-2.06A8 8 0 0 0 20 12z" fill="currentColor"/></svg>
            </button>
            <button id="chatSend" class="icon-btn send" title="Senden">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14l-5-5 1.4-1.4L22.8 12l-8.4 6.4L13 17l5-5H4z" fill="currentColor"/></svg>
            </button>
          </div>
          <div id="sttStatus" class="small status"></div>
        </div>
      </section>

      <aside class="card holo-hide">
        <h3>Kontext</h3>
        <div class="small">Diese Karten wuerdest du in der echten Demo automatisch als Kontext an die Realtime-Session schicken.</div>
        <div id="cardsList" style="margin-top:10px;"></div>
      </aside>
    </div>
  `;
  const audioEl = document.getElementById("voice");
  const canvas = document.getElementById("avatarCanvas");
  let unlock = async () => {};
  if (canvas) {
    unlock = startHoloAvatar(canvas, audioEl, currentPersona);
  }

  chatLogEl = document.getElementById("chatLog");
  chatInputEl = document.getElementById("chatInput");
  const chatSend = document.getElementById("chatSend");
  const chatMic = document.getElementById("chatMic");
  const sttStatus = document.getElementById("sttStatus");
  renderChatHistory();

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  let isRecording = false;
  let finalTranscript = "";
  function setRecording(active) {
    if (!chatMic) return;
    chatMic.classList.toggle("active", active);
    sttStatus.textContent = active ? "Hoere zu..." : "";
  }

  function startRecognition() {
    if (!recognizer || isRecording) return;
    isRecording = true;
    finalTranscript = chatInputEl.value.trim();
    if (finalTranscript) finalTranscript += " ";
    setRecording(true);
    try {
      recognizer.start();
    } catch (err) {
      setRecording(false);
    }
  }

  function stopRecognition() {
    if (!recognizer || !isRecording) return;
    isRecording = false;
    try {
      recognizer.stop();
    } catch (err) {
      // ignore
    }
    setRecording(false);
  }

  if (SpeechRecognition) {
    recognizer = new SpeechRecognition();
    recognizer.lang = "de-DE";
    recognizer.interimResults = true;
    recognizer.continuous = false;
    recognizer.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          finalTranscript += text + " ";
        } else {
          interim += text;
        }
      }
      chatInputEl.value = (finalTranscript + interim).trim();
    };
    recognizer.onerror = (event) => {
      sttStatus.textContent = `STT Fehler: ${event.error}`;
    };
    recognizer.onend = () => {
      setRecording(false);
      isRecording = false;
    };
  } else {
    if (sttStatus) sttStatus.textContent = "Spracherkennung nicht verfuegbar. Bitte tippen.";
    if (chatMic) chatMic.disabled = true;
  }

  if (chatMic) {
    chatMic.onclick = async () => {
      await unlock();
      if (!recognizer) return;
      if (isRecording) {
        stopRecognition();
      } else {
        startRecognition();
      }
    };
  }

  function renderAnswer(data) {
    const text = data?.text || "";
    const sources = data?.sources || [];
    const intent = data?.intent || "";
    addChatMessage({ role: "assistant", text, sources, intent });
    speakText(text);
  }

  function renderError(message) {
    addChatMessage({ role: "assistant", text: message || "Fehler beim Senden" });
  }

  async function sendMessage() {
    const query = chatInputEl.value.trim();
    if (!query) {
      sttStatus.textContent = "Bitte erst eine Frage eingeben.";
      return;
    }
    lastUserMessage = query;
    addChatMessage({ role: "user", text: query });
    chatInputEl.value = "";
    chatInputEl.focus();
    await unlock();
    chatSend.disabled = true;
    chatMic.disabled = true;
    sttStatus.textContent = "Sende Frage...";
    try {
      const res = await fetch(`${API}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: CONTEXT_GROUP_ID, query, persona: currentPersona })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Senden");
      renderAnswer(data);
    } catch (err) {
      renderError(err.message || "Fehler beim Senden");
    } finally {
      chatSend.disabled = false;
      chatMic.disabled = false;
      if (sttStatus.textContent === "Sende Frage...") sttStatus.textContent = "";
    }
  }

  if (chatSend) {
    chatSend.onclick = sendMessage;
  }

  if (chatInputEl) {
    chatInputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        sendMessage();
        return;
      }
      if (event.key === "ArrowUp" && !chatInputEl.value && lastUserMessage) {
        event.preventDefault();
        chatInputEl.value = lastUserMessage;
        chatInputEl.setSelectionRange(lastUserMessage.length, lastUserMessage.length);
      }
    });
  }

  loadCards(CONTEXT_GROUP_ID);
}

async function loadCards(groupId){
  const res = await fetch(`${API}/api/cards?groupId=${encodeURIComponent(groupId)}`);
  const data = await res.json();
  const el = document.getElementById("cardsList");
  if (!el) return;
  el.innerHTML = (data.cards || []).slice(-10).map(c =>
    `<div class="small">&bull; <b>${escapeHtml(c.title)}</b>: ${escapeHtml(c.claim)}</div>`
  ).join("") || `<div class="small">Noch keine Karten.</div>`;
}

function renderCards(){
  app.innerHTML = `
    <div class="grid">
      <section class="card">
        <h2>Quellenkarten eingeben (Gruppe A)</h2>
        <div class="small">Titel + Aussage reichen fuers MVP. Optional: Zitat + Quelle.</div>
        <div style="display:grid; gap:8px; margin-top:10px;">
          <input id="title" placeholder="Titel (z.B. 'Brief an ...')"/>
          <textarea id="claim" placeholder="Aussage/Erkenntnis (1-3 Saetze)"></textarea>
          <textarea id="quote" placeholder="Zitat (optional)"></textarea>
          <input id="source" placeholder="Quelle (optional, z.B. Buch/Link)"/>
          <button id="save">Speichern</button>
        </div>
      </section>

      <aside class="card">
        <h3>Letzte Karten</h3>
        <div id="cardsList"></div>
      </aside>

      <section class="card">
        <h2>Avatar erstellen</h2>
        <div class="small">Bild hochladen, Provider waehlen und Avatar erzeugen.</div>
        <div class="form-grid">
          <input id="avatarFile" type="file" accept="image/*"/>
          <div class="row">
            <label for="avatarProvider" class="small">Provider</label>
            <select id="avatarProvider">
              <option value="heygen" selected>heygen</option>
              <option value="did">d-id</option>
            </select>
          </div>
          <div class="row">
            <label for="avatarStyle" class="small">Style</label>
            <select id="avatarStyle">
              <option value="real" selected>real</option>
              <option value="illustration">illustration</option>
              <option value="holo">holo</option>
            </select>
          </div>
          <button id="avatarGenerate">Avatar erzeugen</button>
          <div id="avatarStatus" class="small status"></div>
          <div class="avatar-preview">
            <img id="avatarPreview" alt="Avatar preview"/>
          </div>
          <button id="avatarSet" disabled>Als Persona setzen</button>
        </div>
      </section>
    </div>
  `;

  document.getElementById("save").onclick = async () => {
    const payload = {
      groupId: CARD_GROUP_ID,
      title: document.getElementById("title").value.trim(),
      claim: document.getElementById("claim").value.trim(),
      quote: document.getElementById("quote").value.trim(),
      source: document.getElementById("source").value.trim(),
    };
    const r = await fetch(`${API}/api/cards`, {
      method:"POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    if (!r.ok) alert("Fehler beim Speichern");
    document.getElementById("title").value = "";
    document.getElementById("claim").value = "";
    document.getElementById("quote").value = "";
    document.getElementById("source").value = "";
    loadCards(CARD_GROUP_ID);
  };

  initAvatarSection(PERSONA_GROUP_ID);
  loadCards(CARD_GROUP_ID);
}

function initAvatarSection(groupId) {
  const avatarFile = document.getElementById("avatarFile");
  const avatarProvider = document.getElementById("avatarProvider");
  const avatarStyle = document.getElementById("avatarStyle");
  const avatarGenerate = document.getElementById("avatarGenerate");
  const avatarStatus = document.getElementById("avatarStatus");
  const avatarPreview = document.getElementById("avatarPreview");
  const avatarSet = document.getElementById("avatarSet");

  function setPreview(url) {
    if (!url) return;
    avatarPreview.src = resolveAvatarUrl(url);
  }

  if (currentPersona.avatarUrl) {
    setPreview(currentPersona.avatarUrl);
    avatarStatus.textContent = `Aktuelle Persona: ${currentPersona.provider || "local"}`;
  }

  avatarGenerate.onclick = async () => {
    const file = avatarFile.files?.[0];
    if (!file) {
      avatarStatus.textContent = "Bitte erst ein Bild auswaehlen.";
      return;
    }
    avatarGenerate.disabled = true;
    avatarSet.disabled = true;
    avatarStatus.textContent = "Avatar wird erzeugt...";

    const form = new FormData();
    form.append("image", file);
    form.append("groupId", groupId);
    form.append("provider", avatarProvider.value);
    form.append("style", avatarStyle.value);

    try {
      const res = await fetch(`${API}/api/avatar`, {
        method: "POST",
        body: form
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Avatar-Erzeugen");
      lastGeneratedAvatar = data;
      setPreview(data.avatarUrl);
      avatarStatus.textContent = `Avatar bereit (Provider: ${data.provider})`;
      avatarSet.disabled = false;
    } catch (err) {
      avatarStatus.textContent = err.message || "Fehler beim Avatar-Erzeugen";
    } finally {
      avatarGenerate.disabled = false;
    }
  };

  avatarSet.onclick = async () => {
    if (!lastGeneratedAvatar?.avatarUrl) {
      avatarStatus.textContent = "Bitte erst einen Avatar erzeugen.";
      return;
    }
    avatarSet.disabled = true;
    const persona = {
      avatarUrl: lastGeneratedAvatar.avatarUrl,
      provider: lastGeneratedAvatar.provider,
      style: lastGeneratedAvatar.meta?.style || avatarStyle.value || "real",
      updatedAt: Date.now()
    };
    await savePersona(groupId, persona);
    currentPersona = { ...DEFAULT_PERSONA, ...persona };
    avatarStatus.textContent = "Persona gesetzt.";
  };
}

function resolveAvatarUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API}${url}`;
}

function getLocalPersona(groupId) {
  try {
    const raw = localStorage.getItem(`persona:${groupId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setLocalPersona(groupId, persona) {
  localStorage.setItem(`persona:${groupId}`, JSON.stringify(persona));
}

async function fetchPersona(groupId) {
  try {
    const res = await fetch(`${API}/api/persona?groupId=${encodeURIComponent(groupId)}`);
    const data = await res.json();
    if (!res.ok) return null;
    return data.persona || null;
  } catch {
    return null;
  }
}

async function pushPersona(groupId, persona) {
  try {
    await fetch(`${API}/api/persona`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, persona })
    });
  } catch {
    // ignore
  }
}

function newestPersona(localPersona, remotePersona) {
  if (!localPersona) return remotePersona;
  if (!remotePersona) return localPersona;
  if (remotePersona.avatarUrl && !localPersona.avatarUrl) return remotePersona;
  if (localPersona.avatarUrl && !remotePersona.avatarUrl) return localPersona;
  const localTs = Number(localPersona.updatedAt || 0);
  const remoteTs = Number(remotePersona.updatedAt || 0);
  return localTs >= remoteTs ? localPersona : remotePersona;
}

async function syncPersona(groupId) {
  const localPersona = getLocalPersona(groupId);
  const remotePersona = await fetchPersona(groupId);
  const selected = newestPersona(localPersona, remotePersona);

  if (selected) {
    currentPersona = { ...DEFAULT_PERSONA, ...selected };
  }

  if (localPersona && !remotePersona) {
    await pushPersona(groupId, localPersona);
  } else if (!localPersona && remotePersona) {
    setLocalPersona(groupId, remotePersona);
  } else if (localPersona && remotePersona) {
    const localTs = Number(localPersona.updatedAt || 0);
    const remoteTs = Number(remotePersona.updatedAt || 0);
    if (remotePersona.avatarUrl && !localPersona.avatarUrl) {
      setLocalPersona(groupId, remotePersona);
    } else if (localPersona.avatarUrl && !remotePersona.avatarUrl) {
      await pushPersona(groupId, localPersona);
    } else if (localTs > remoteTs) {
      await pushPersona(groupId, localPersona);
    } else if (remoteTs > localTs) {
      setLocalPersona(groupId, remotePersona);
    }
  }

  return currentPersona;
}

async function savePersona(groupId, persona) {
  const payload = { ...persona, updatedAt: persona.updatedAt || Date.now() };
  setLocalPersona(groupId, payload);
  await pushPersona(groupId, payload);
  return payload;
}

function addChatMessage(message) {
  chatHistory.push(message);
  renderChatMessage(message);
}

function renderChatHistory() {
  if (!chatLogEl) return;
  chatLogEl.innerHTML = "";
  chatHistory.forEach(renderChatMessage);
}

function renderChatMessage(message) {
  if (!chatLogEl || !message) return;
  const row = document.createElement("div");
  row.className = `chat-row ${message.role}`;
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  const safeText = escapeHtml(message.text || "");
  let metaHtml = "";
  if (message.sources && message.sources.length) {
    const sourcePills = message.sources.map(id => `<span class="pill">Beleg: ${escapeHtml(id)}</span>`).join(" ");
    metaHtml += `<div class="chat-meta">${sourcePills}</div>`;
  }
  if (message.intent) {
    metaHtml += `<div class="chat-meta"><span class="pill">Modus: ${escapeHtml(message.intent)}</span></div>`;
  }
  bubble.innerHTML = `<div>${safeText}</div>${metaHtml}`;
  row.appendChild(bubble);
  chatLogEl.appendChild(row);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

function speakText(text) {
  if (!text) return;
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "de-DE";
  utter.rate = 1;
  utter.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function escapeAttribute(s){
  return escapeHtml(s);
}
