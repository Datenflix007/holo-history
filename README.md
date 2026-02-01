# holo-history

## Quick start

1) Backend starten:
   - `cd server`
   - `npm install`
   - `node index.js`

2) Frontend oeffnen:
   - `web/index.html` im Browser oeffnen (oder `http://localhost:8787/index.html`).

3) Avatar erstellen:
   - Ansicht "Quellenkarten" -> "Avatar erstellen" -> Bild hochladen -> "Avatar erzeugen".
   - Optional: Provider-Keys in `server/.env` setzen (siehe `server/.env.example`).
   - Ohne Keys laeuft der lokale Holo-Filter als Fallback.



Ja — du kannst dir eine **“WOW-Demo”** bauen, die auf **Windows** läuft (und genauso auf macOS/Linux), indem du sie als **lokale Web-App** baust und bei Bedarf als **Desktop-App (Electron)** verpackst. Die Ausgabe ist dann immer “ein Bildschirm/HDMI-Signal” → das funktioniert **auf normalem Display** *und* auf “Hologramm-Geräten” (die in der Praxis fast immer einfach HDMI/WebView nehmen).

Unten ist ein  **konkretes Demo-Blueprint** , das du 1:1 umsetzen kannst.

---

## Zielbild der Demo (was am Ende “wow” macht)

**Ein Browser-Fenster im Vollbild:**

* links: “Studio”-View (Avatar-Video/Animation + Untertitel)
* rechts: “Quellen-Konsole” (Karten, die die SuS live hinzufügen)
* Knopf: **“Holo-Mode”** (schwarzer Hintergrund, UI weg, optional spiegeln)

**Interaktion:**

* Push-to-talk → die KI antwortet **mit Stimme** (niedrige Latenz) über die **Realtime API** (Speech↔Speech).
* “Quellenkarten” der Gruppe werden in Echtzeit als Kontext genutzt (RAG-Style statt Training).

---

## Architektur, die schnell zum Laufen kommt

### 1) Frontend (Web)

* **/studio** : Interview-Modus + Avatar-Ausgabe + Untertitel
* **/cards** : Karten-Editor (Erkenntnisse/Quellen eingeben)
* **Holo-Mode** : CSS-Toggle (schwarz, minimal, optional Mirror)

### 2) Backend (Node.js)

* speichert Karten pro Gruppe (lokal in SQLite oder JSON)
* liefert “Top-K Karten” zur Frage
* erzeugt **kurzlebige Realtime-Credentials** für den Browser (damit dein API-Key nicht im Frontend steckt) – genau dafür sind “Server-side controls” gedacht.

### 3) LLM / Audio

* Browser verbindet sich via **WebRTC** an die Realtime API (für niedrige Latenz).

### 4) Avatar-Darstellung (zwei Optionen)

**Option A (schnell, keine Fremd-APIs):**

* Eine stylische “Hologramm-Figur” als **Canvas/Three.js** (z. B. Silhouette + Partikel + Glow), die mit **Audio-Amplitude** “lip-synct” (Mund/Glow pulsiert).

  → sieht überraschend gut aus und ist robust.

**Option B (max wow):**

* Streaming-Avatar via **HeyGen** (WebRTC-Streaming)

  oder **D-ID Agents Streams** (WebRTC).

  → mehr “menschlich”, aber mehr Setup (Keys, Limits, Firewall in Schulen etc.).

Ich skizziere dir unten eine Demo, die **Option A** direkt kann und **Option B** als Plug-in vorsieht.

---

## Projektstruktur (Copy/Paste-fähig)

<pre class="overflow-visible! px-0!" data-start="2497" data-end="2699"><div class="contain-inline-size rounded-2xl corner-superellipse/1.1 relative bg-token-sidebar-surface-primary"><div class="sticky top-[calc(var(--sticky-padding-top)+9*var(--spacing))]"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre!"><span><span>holo-history-wow/
  .env
  .env.example
  </span><span>server</span><span>/
    </span><span>index</span><span>.js
    </span><span>storage</span><span>.js
    prompts.js
    package.json
    .env.example
  web/
    </span><span>index</span><span>.html
    studio.js
    cards.js
    holo.css
    avatar.js
    webrtc.js
</span></span></code></div></div></pre>

---

## Schritt 1: Backend (Node) – Karten + “ephemeral creds” + Retrieval

> Hinweis: Die Realtime-API-Details (Call-Erstellung/SDP-Flow) stehen in den offiziellen Guides.
>
> Ich gebe dir hier **bewusst** ein robustes Muster (Server als “Broker”), und du füllst die 1–2 konkreten Requests anhand der Doku ein.
>



mit dem Server hast du:

Karten-Einpflegen ✅

* Retrieval ✅
* Guardrail-Prompt ✅
* Security-Pattern für Realtime ✅ (nur noch konkret nach Doku einhängen)

mit dem Web hast du  **sofort** :

* Karten-UI ✅
* Studio-UI ✅
* Holo-Look ✅
* Avatar “lebt” ✅

Was noch fehlt, ist nur die  **Realtime-WebRTC-Verdrahtung** .

---

## Schritt 5: Realtime WebRTC einhängen (der “WOW”-Sprung)

Die offiziellen Flows sind hier:

* Realtime WebRTC Guide
* Realtime API Reference (Call Create etc.)
* Conversation Event Flows
* Server-side controls (damit Keys privat bleiben)

**Praktisches Muster für deine Demo:**

1. Frontend ruft `/api/realtime-token` beim Server
2. Server holt die nötigen Realtime-Credentials/SDP-Antworten von OpenAI
3. Frontend baut PeerConnection auf, sendet Mikrofon-Track, empfängt Audio-Track
4. Jede Nutzerfrage → Backend liefert Top-K Karten → Frontend “injectet” Kontext in die laufende Realtime-Session (als System/Context Update Event)

Wenn du willst, schreibe ich dir als nächsten Schritt **die komplette `webrtc.js`** (PeerConnection + Events) passend zur aktuellen Doku, damit du wirklich **Voice-to-Voice** live bekommst. (Das ist etwas zu lang für diesen einzelnen Post, aber mechanisch.)

---

## Schritt 6: “Hologramm-Gerät” kompatibel machen

Du brauchst fast nie Spezialcode. Du brauchst nur  **einen Presenter-Screen** :

* `http://localhost:xxxx/#/studio?holo=1`
* CSS: schwarzer Hintergrund + zentriert + keine UI
* Optional:
  * **Mirror** (für Pepper’s Ghost / bestimmte Aufbauten)
  * **Crop-Safe-Frame** (damit Kopf nicht abgeschnitten wird)

Das gleiche Fenster geht:

* Beamer/TV via HDMI ✅
* “Hologramm-Box” (HDMI) ✅
* Geräte mit eingebautem Browser/WebView ✅

---

## Packaging für Windows (und OS-unabhängig)

**Variante 1 (am einfachsten):**

* Server: `node server/index.js`
* Frontend: einfach `web/index.html` im Browser öffnen

  → läuft überall.

**Variante 2 (WOW-Feeling, 1-Klick-App): Electron**

* Electron lädt lokal deine `web/index.html`
* startet im Hintergrund den Node-Server
* kiosk mode / fullscreen

Das ist die beste “auf einen Windows-Laptop packen und los”-Option.

---

## Wenn du den “echten Menschen-Avatar” willst (HeyGen / D-ID)

Dann ersetzt du in `/studio` das Canvas durch einen Video-Stream:

* **HeyGen Streaming API** (WebRTC)
* **D-ID Agents Streams** (WebRTC)

In Schulen wichtig: Firewalls können WebRTC stören → HeyGen hat dafür eine Firewall-Checkliste.

---

## Was ich von dir brauche (ohne Rückfragen-Orgie, nur Entscheidung)

Sag mir einfach  **eins** :

* Willst du die WOW-Demo **mit Canvas-Holo-Avatar (Option A)** oder  **mit HeyGen/D-ID Video-Avatar (Option B)** ?

Dann gebe ich dir im nächsten Schritt den **kompletten verdrahteten Realtime-Code** (inkl. `/api/realtime-token` + `webrtc.js`) passend zur gewählten Option und so, dass du es auf Windows im Kiosk-Mode starten kannst.
