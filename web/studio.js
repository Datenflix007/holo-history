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
          <button id="btnTalk">🎙️ Push-to-talk (Demo)</button>
          <button id="btnFakeAnswer">✨ Fake-Antwort abspielen</button>
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

  document.getElementById("btnTalk").onclick = async () => {
    // Hier würdest du WebRTC Realtime starten. :contentReference[oaicite:9]{index=9}
    await unlock();
    alert("In dieser Vorlage ist Realtime noch nicht verdrahtet. Nächster Schritt: /api/realtime-token implementieren und WebRTC verbinden.");
  };

  document.getElementById("btnFakeAnswer").onclick = async () => {
    await unlock();
    // Beliebige lokale Audiodatei einspielen (optional)
    // Oder einfach stumm lassen – Avatar reagiert dann nur minimal.
    document.getElementById("subs").innerHTML = `
      <div>"Ich wurde 1830 nach der Julirevolution zum Koenig der Franzosen."</div>
      <div style="margin-top:8px;">
        <span class="pill">Beleg: LP-1830</span>
        <span class="pill">Beleg: LP-JUL</span>
        <span class="pill">Perspektive: Legitimisten sahen mich nicht als rechtmaessigen Koenig.</span>
      </div>
    `;
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
