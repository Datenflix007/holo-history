import { startHoloAvatar } from "./avatar.js";

const API = "http://localhost:8787";
const PERSONA = {
  name: "Louis-Philippe I",
  years: "1773-1850",
  title: "King of the French"
};

const app = document.getElementById("app");
const toStudio = document.getElementById("toStudio");
const toCards  = document.getElementById("toCards");
const toggleHolo = document.getElementById("toggleHolo");

toStudio.onclick = renderStudio;
toCards.onclick = renderCards;
toggleHolo.onclick = () => document.body.classList.toggle("holo");

renderStudio();

function renderStudio(){
  app.innerHTML = `
    <div class="grid">
      <section class="card">
        <div class="small" style="margin-bottom:6px;">
          Testhologramm: <b>${PERSONA.name}</b> (${PERSONA.years})
        </div>
        <canvas id="avatarCanvas"></canvas>
        <audio id="voice" controls></audio>
        <div class="subs" id="subs">
          <div class="small">Untertitel erscheinen hier…</div>
        </div>
        <div style="margin-top:10px;">
          <button id="btnTalk">Push-to-talk (halten)</button>
          <button id="btnFakeAnswer">Fake-Antwort abspielen</button>
        </div>
        <div style="margin-top:10px;">
          <div class="small">Spracheingabe / Frage</div>
          <textarea id="questionInput" rows="3" placeholder="Sprich oder tippe deine Frage..."></textarea>
          <div style="display:flex; gap:8px; align-items:center; margin-top:6px;">
            <button id="btnSend">Frage absenden</button>
            <div id="sttStatus" class="small"></div>
          </div>
        </div>
      </section>

      <aside class="card">
        <h3>Kontext / Quellen (Gruppe A)</h3>
        <div class="small">Diese Karten würdest du in der echten Demo automatisch als Kontext an die Realtime-Session schicken.</div>
        <div id="cardsList" style="margin-top:10px;"></div>
      </aside>
    </div>
  `;
  const audioEl = document.getElementById("voice");
  const unlock = startHoloAvatar(document.getElementById("avatarCanvas"), audioEl, PERSONA);

  const btnTalk = document.getElementById("btnTalk");
  const btnFakeAnswer = document.getElementById("btnFakeAnswer");
  const btnSend = document.getElementById("btnSend");
  const questionInput = document.getElementById("questionInput");
  const sttStatus = document.getElementById("sttStatus");

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  let isRecording = false;
  let micStream = null;
  let finalTranscript = "";
  const btnTalkLabel = btnTalk.textContent;

  function setRecording(active) {
    if (active) {
      btnTalk.textContent = "Aufnahme... (loslassen)";
      sttStatus.textContent = "Hoere zu...";
    } else {
      btnTalk.textContent = btnTalkLabel;
      if (sttStatus.textContent === "Hoere zu...") sttStatus.textContent = "";
    }
  }

  async function ensureMicPermission() {
    if (!navigator.mediaDevices?.getUserMedia || micStream) return;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      sttStatus.textContent = "Kein Mikrofonzugriff.";
    }
  }

  function startRecognition() {
    if (!recognizer || isRecording) return;
    isRecording = true;
    finalTranscript = questionInput.value.trim();
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
    recognizer.continuous = true;
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
      questionInput.value = (finalTranscript + interim).trim();
    };
    recognizer.onerror = (event) => {
      sttStatus.textContent = `STT Fehler: ${event.error}`;
    };
    recognizer.onend = () => {
      setRecording(false);
      isRecording = false;
    };
  } else {
    sttStatus.textContent = "Spracherkennung nicht verfuegbar. Bitte tippen.";
  }

  btnTalk.onpointerdown = async (e) => {
    e.preventDefault();
    await unlock();
    await ensureMicPermission();
    startRecognition();
  };
  btnTalk.onpointerup = stopRecognition;
  btnTalk.onpointerleave = stopRecognition;
  btnTalk.onpointercancel = stopRecognition;

  function renderAnswer(data) {
    const text = data?.text || "";
    const sources = data?.sources || [];
    const intent = data?.intent ? `<span class="pill">Modus: ${escapeHtml(data.intent)}</span>` : "";
    const sourcePills = sources.map(id => `<span class="pill">Beleg: ${escapeHtml(id)}</span>`).join(" ");
    document.getElementById("subs").innerHTML = `
      <div>${escapeHtml(text)}</div>
      <div style="margin-top:8px;">
        ${sourcePills} ${intent}
      </div>
    `;
  }

  function renderError(message) {
    document.getElementById("subs").innerHTML = `
      <div>${escapeHtml(message)}</div>
    `;
  }

  btnSend.onclick = async () => {
    const query = questionInput.value.trim();
    if (!query) {
      sttStatus.textContent = "Bitte erst eine Frage eingeben.";
      return;
    }
    await unlock();
    btnSend.disabled = true;
    sttStatus.textContent = "Sende Frage...";
    try {
      const res = await fetch(`${API}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: "group-a", query, persona: PERSONA })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Senden");
      renderAnswer(data);
    } catch (err) {
      renderError(err.message || "Fehler beim Senden");
    } finally {
      btnSend.disabled = false;
      if (sttStatus.textContent === "Sende Frage...") sttStatus.textContent = "";
    }
  };

  btnFakeAnswer.onclick = async () => {
    await unlock();
    btnFakeAnswer.disabled = true;
    sttStatus.textContent = "Hole Fake-Antwort...";
    try {
      const res = await fetch(`${API}/api/fake-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: "group-a", persona: PERSONA })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler bei Fake-Antwort");
      renderAnswer(data);
    } catch (err) {
      renderError(err.message || "Fehler bei Fake-Antwort");
    } finally {
      btnFakeAnswer.disabled = false;
      if (sttStatus.textContent === "Hole Fake-Antwort...") sttStatus.textContent = "";
    }
  };

  loadCards("group-a");
}

async function loadCards(groupId){
  const res = await fetch(`${API}/api/cards?groupId=${encodeURIComponent(groupId)}`);
  const data = await res.json();
  const el = document.getElementById("cardsList");
  el.innerHTML = (data.cards || []).slice(-10).map(c =>
    `<div class="small">• <b>${escapeHtml(c.title)}</b>: ${escapeHtml(c.claim)}</div>`
  ).join("") || `<div class="small">Noch keine Karten.</div>`;
}

function renderCards(){
  app.innerHTML = `
    <div class="grid">
      <section class="card">
        <h2>Quellenkarten eingeben (Gruppe A)</h2>
        <div class="small">Titel + Aussage reichen fürs MVP. Optional: Zitat + Quelle.</div>
        <div style="display:grid; gap:8px; margin-top:10px;">
          <input id="title" placeholder="Titel (z.B. 'Brief an …')"/>
          <textarea id="claim" placeholder="Aussage/Erkenntnis (1–3 Sätze)"></textarea>
          <textarea id="quote" placeholder="Zitat (optional)"></textarea>
          <input id="source" placeholder="Quelle (optional, z.B. Buch/Link)"/>
          <button id="save">Speichern</button>
        </div>
      </section>

      <aside class="card">
        <h3>Letzte Karten</h3>
        <div id="cardsList"></div>
      </aside>
    </div>
  `;

  document.getElementById("save").onclick = async () => {
    const payload = {
      groupId: "group-a",
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
    loadCards("group-a");
  };

  loadCards("group-a");
}

function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
