export function startHoloAvatar(canvas, audioEl, persona = {}) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  function resize() {
    canvas.width  = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  }
  resize();
  window.addEventListener("resize", resize);

  // WebAudio: Amplitude messen
  const ac = new AudioContext();
  const src = ac.createMediaElementSource(audioEl);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  analyser.connect(ac.destination);

  const data = new Uint8Array(analyser.frequencyBinCount);

  const labelLines = [];
  if (persona.name) labelLines.push(persona.name);
  const meta = [persona.title, persona.years].filter(Boolean).join(" - ");
  if (meta) labelLines.push(meta);

  let t = 0;
  function draw() {
    t += 0.016;

    analyser.getByteTimeDomainData(data);
    let rms = 0;
    for (let i=0;i<data.length;i++){
      const v = (data[i]-128)/128;
      rms += v*v;
    }
    rms = Math.sqrt(rms/data.length); // 0..~1
    const mouth = Math.min(1, rms*6);

    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);

    // Hintergrund + Scanlines
    ctx.fillStyle = "#000";
    ctx.fillRect(0,0,w,h);

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#2aa6ff";
    for (let y=0; y<h; y+=6) ctx.fillRect(0,y,w,1);
    ctx.globalAlpha = 1;

    // Label (Persona)
    if (labelLines.length) {
      ctx.save();
      const pad = 10 * dpr;
      const x = 16 * dpr;
      const y = 16 * dpr;
      const fontSize = 16 * dpr;
      const lineHeight = Math.round(fontSize * 1.25);
      ctx.font = `${fontSize}px "Trebuchet MS", "Segoe UI", sans-serif`;
      const widths = labelLines.map(line => ctx.measureText(line).width);
      const boxW = Math.max(...widths) + pad * 2;
      const boxH = lineHeight * labelLines.length + pad * 1.5;
      ctx.fillStyle = "rgba(0, 18, 26, 0.7)";
      ctx.fillRect(x, y, boxW, boxH);
      ctx.fillStyle = "rgba(150, 230, 255, 0.95)";
      labelLines.forEach((line, i) => {
        ctx.fillText(line, x + pad, y + pad + lineHeight * (i + 0.8));
      });
      ctx.restore();
    }

    // “Holo-Glow”
    const cx = w*0.45, cy = h*0.52;
    const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, h*0.55);
    glow.addColorStop(0, `rgba(80,200,255,${0.35+mouth*0.25})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0,0,w,h);

    // Silhouette (super simpel)
    ctx.save();
    ctx.translate(cx, cy);

    ctx.strokeStyle = `rgba(120,220,255,${0.9})`;
    ctx.lineWidth = 3*dpr;
    ctx.beginPath();
    ctx.ellipse(0, -h*0.12, w*0.11, h*0.16, 0, 0, Math.PI*2); // head
    ctx.stroke();

    // Simple crown for the Louis-Philippe test hologram
    ctx.lineWidth = 2.2*dpr;
    ctx.beginPath();
    ctx.moveTo(-w*0.06, -h*0.24);
    ctx.lineTo(-w*0.03, -h*0.28);
    ctx.lineTo(0, -h*0.24);
    ctx.lineTo(w*0.03, -h*0.28);
    ctx.lineTo(w*0.06, -h*0.24);
    ctx.stroke();

    ctx.lineWidth = 3*dpr;
    ctx.beginPath();
    ctx.ellipse(0, h*0.08, w*0.16, h*0.22, 0, 0, Math.PI*2); // torso
    ctx.stroke();

    // “Mund” als pulsierender Strich
    ctx.lineWidth = (2 + mouth*10)*dpr;
    ctx.beginPath();
    ctx.moveTo(-w*0.03, -h*0.06);
    ctx.lineTo(w*0.03, -h*0.06);
    ctx.stroke();

    // Partikelring
    ctx.globalAlpha = 0.8;
    for (let i=0;i<80;i++){
      const a = i/80*Math.PI*2 + t*0.35;
      const r = w*0.18 + Math.sin(t*2 + i)*w*0.008 + mouth*w*0.02;
      const x = Math.cos(a)*r;
      const y = Math.sin(a)*r*0.75;
      ctx.fillStyle = `rgba(90,210,255,${0.15+mouth*0.25})`;
      ctx.fillRect(x, y, 2*dpr, 2*dpr);
    }
    ctx.restore();

    requestAnimationFrame(draw);
  }

  // Browser blockt AudioContext bis User-Geste:
  return async function unlockAudio() {
    if (ac.state !== "running") await ac.resume();
    requestAnimationFrame(draw);
  };
}
