import fs from "fs/promises";
import path from "path";
import crypto from "node:crypto";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const dataAvatarDir = path.join(dataDir, "avatars");
const publicAvatarDir = path.join(rootDir, "public", "avatars");

const allowedStyles = new Set(["real", "illustration", "holo"]);
const allowedProviders = new Set(["heygen", "did"]);

function normalizeStyle(style) {
  const value = String(style || "").toLowerCase().trim();
  return allowedStyles.has(value) ? value : "real";
}

function normalizeProvider(provider) {
  const value = String(provider || "").toLowerCase().trim();
  return allowedProviders.has(value) ? value : "heygen";
}

function hasWebFormData() {
  return typeof fetch === "function" && typeof FormData !== "undefined" && typeof Blob !== "undefined";
}

function extensionFromMime(mimeType, fileName = "") {
  const map = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp"
  };
  if (map[mimeType]) return map[mimeType];
  const ext = path.extname(fileName).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  return ".png";
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function requestWithRetry(makeRequest, retries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await makeRequest(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await delay(500 + attempt * 250);
      }
    }
  }
  throw lastError;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function saveAvatarBundle({ avatarId, originalBuffer, originalExt, processedBuffer, meta }) {
  const avatarRoot = path.join(dataAvatarDir, avatarId);
  await fs.mkdir(avatarRoot, { recursive: true });
  await fs.mkdir(publicAvatarDir, { recursive: true });

  const originalName = `original${originalExt}`;
  const originalPath = path.join(avatarRoot, originalName);
  const processedPath = path.join(avatarRoot, "processed.png");
  const publicPath = path.join(publicAvatarDir, `${avatarId}.png`);

  await fs.writeFile(originalPath, originalBuffer);
  await fs.writeFile(processedPath, processedBuffer);
  await fs.writeFile(publicPath, processedBuffer);

  const metaPayload = {
    ...meta,
    avatarId,
    originalFile: originalName,
    processedFile: "processed.png",
    publicFile: `${avatarId}.png`
  };
  await fs.writeFile(path.join(avatarRoot, "meta.json"), JSON.stringify(metaPayload, null, 2));

  return {
    avatarUrl: `/avatars/${avatarId}.png`,
    avatarId,
    dataDir: path.join("data", "avatars", avatarId)
  };
}

function stylePrompt(style) {
  if (style === "illustration") {
    return "portrait, illustrated, clean lines, warm colors";
  }
  if (style === "holo") {
    return "portrait, holographic, blue glow, sci-fi, scanlines";
  }
  return "portrait, realistic lighting";
}

function mapHeyGenStyle(style) {
  if (style === "illustration") return "Illustration";
  return "Realistic";
}

async function downloadImage(url) {
  const res = await fetchWithTimeout(url, { method: "GET" }, 15000);
  if (!res.ok) {
    const body = await parseJsonSafe(res);
    throw new Error(`Image download failed: ${res.status} ${body?.message || ""}`.trim());
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function createScanlines(width, height) {
  const buffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const isLine = y % 6 === 0;
    const alpha = isLine ? 90 : 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      buffer[idx] = 40;
      buffer[idx + 1] = 170;
      buffer[idx + 2] = 255;
      buffer[idx + 3] = alpha;
    }
  }
  return sharp(buffer, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function applyLocalFilter(imageBuffer, style) {
  const size = 640;
  let base = sharp(imageBuffer)
    .resize(size, size, { fit: "cover" })
    .ensureAlpha();

  if (style === "illustration") {
    base = base
      .median(3)
      .modulate({ brightness: 1.05, saturation: 1.3 })
      .sharpen(2);
  } else if (style === "holo") {
    base = base
      .grayscale()
      .tint({ r: 80, g: 210, b: 255 })
      .modulate({ brightness: 1.05 });
  } else {
    base = base
      .modulate({ brightness: 1.02, saturation: 1.05 })
      .sharpen(1.2);
  }

  const baseBuffer = await base.png().toBuffer();
  const glow = await sharp(baseBuffer)
    .blur(18)
    .modulate({ brightness: 1.2 })
    .png()
    .toBuffer();
  const scanlines = await createScanlines(size, size);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    }
  })
    .composite([
      { input: glow, blend: "screen", opacity: style === "real" ? 0.45 : 0.7 },
      { input: baseBuffer, blend: "screen", opacity: 1 },
      { input: scanlines, blend: "overlay", opacity: 0.28 }
    ])
    .png()
    .toBuffer();
}

async function generateAvatarLocal(imageBuffer, style) {
  const buffer = await applyLocalFilter(imageBuffer, style);
  return {
    buffer,
    provider: "local",
    meta: { pipeline: "local-filter" }
  };
}

function extractHeyGenImageKey(payload) {
  const data = payload?.data || payload || {};
  if (data.image_key) return data.image_key;
  if (data.imageKey) return data.imageKey;
  if (data.key) return data.key;
  if (data.url) {
    const match = String(data.url).match(/\/(image\/[^?]+)/i);
    if (match) return match[1];
  }
  if (data.id) return `image/${data.id}/original`;
  return null;
}

async function generateAvatarHeyGen({ imageBuffer, mimeType, style, fileName }) {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return null;
  if (!hasWebFormData()) {
    throw new Error("HeyGen integration requires FormData support in this Node runtime.");
  }

  const uploadPayload = await requestWithRetry(async () => {
    const form = new FormData();
    form.append("file", new Blob([imageBuffer], { type: mimeType }), fileName || "avatar.png");
    const res = await fetchWithTimeout("https://upload.heygen.com/v1/asset", {
      method: "POST",
      headers: { "X-Api-Key": apiKey, "Accept": "application/json" },
      body: form
    }, 15000);
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      throw new Error(`HeyGen upload failed: ${res.status} ${body?.message || body?.error || ""}`.trim());
    }
    return body;
  });

  const imageKey = extractHeyGenImageKey(uploadPayload);
  if (!imageKey) {
    throw new Error("HeyGen upload did not return image_key.");
  }

  const groupPayload = await requestWithRetry(async () => {
    const res = await fetchWithTimeout("https://api.heygen.com/v2/photo_avatar/avatar_group/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "Accept": "application/json"
      },
      body: JSON.stringify({
        name: "holo-history",
        image_key: imageKey
      })
    }, 15000);
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      throw new Error(`HeyGen avatar group failed: ${res.status} ${body?.message || body?.error || ""}`.trim());
    }
    return body;
  });

  const groupData = groupPayload?.data || groupPayload || {};
  const groupId = groupData.group_id || groupData.groupId || groupData.id;
  let imageUrl = groupData.image_url || groupData.imageUrl || groupData.url;
  let generationId = null;

  if (groupId && style !== "real") {
    const prompt = stylePrompt(style);
    const styleParam = mapHeyGenStyle(style);
    const generationPayload = await requestWithRetry(async () => {
      const res = await fetchWithTimeout("https://api.heygen.com/v2/photo_avatar/look/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
          "Accept": "application/json"
        },
        body: JSON.stringify({
          group_id: groupId,
          prompt,
          style: styleParam,
          orientation: "square",
          pose: "half_body"
        })
      }, 20000);
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(`HeyGen look generate failed: ${res.status} ${body?.message || body?.error || ""}`.trim());
      }
      return body;
    });

    generationId = generationPayload?.data?.generation_id || generationPayload?.data?.generationId;
    if (generationId) {
      let statusPayload = null;
      for (let i = 0; i < 6; i++) {
        statusPayload = await requestWithRetry(async () => {
          const res = await fetchWithTimeout(`https://api.heygen.com/v2/photo_avatar/generation/${generationId}`, {
            method: "GET",
            headers: { "X-Api-Key": apiKey, "Accept": "application/json" }
          }, 15000);
          const body = await parseJsonSafe(res);
          if (!res.ok) {
            throw new Error(`HeyGen generation status failed: ${res.status} ${body?.message || body?.error || ""}`.trim());
          }
          return body;
        });
        const status = statusPayload?.data?.status || statusPayload?.status;
        if (status === "success" || status === "completed") break;
        if (status === "failed") break;
        await delay(2500);
      }
      const statusData = statusPayload?.data || statusPayload || {};
      const imageList = statusData.image_url_list || statusData.imageUrlList || [];
      if (imageList.length) {
        imageUrl = imageList[0];
      }
      if (!imageUrl && statusData.image_key_list?.length) {
        imageUrl = `https://files2.heygen.ai/${statusData.image_key_list[0]}`;
      }
    }
  }

  if (!imageUrl && groupData.image_key) {
    imageUrl = `https://files2.heygen.ai/${groupData.image_key}`;
  }

  if (!imageUrl) {
    throw new Error("HeyGen did not return an image URL.");
  }

  const buffer = await downloadImage(imageUrl);
  return {
    buffer,
    provider: "heygen",
    meta: {
      groupId,
      imageKey,
      generationId,
      imageUrl
    }
  };
}

async function generateAvatarDID({ imageBuffer, mimeType, style, fileName }) {
  const apiKey = process.env.DID_API_KEY;
  if (!apiKey) return null;
  if (!hasWebFormData()) {
    throw new Error("D-ID integration requires FormData support in this Node runtime.");
  }

  const uploadPayload = await requestWithRetry(async () => {
    const form = new FormData();
    form.append("image", new Blob([imageBuffer], { type: mimeType }), fileName || "avatar.png");
    const res = await fetchWithTimeout("https://api.d-id.com/images", {
      method: "POST",
      headers: { "Authorization": `Basic ${apiKey}`, "Accept": "application/json" },
      body: form
    }, 15000);
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      throw new Error(`D-ID image upload failed: ${res.status} ${body?.message || body?.error || ""}`.trim());
    }
    return body;
  });

  const imageUrl = uploadPayload?.url || uploadPayload?.data?.url || uploadPayload?.result?.url;
  let talkId = null;
  let resultUrl = null;
  let talkStatus = null;

  if (!imageUrl) {
    throw new Error("D-ID image upload did not return a url.");
  }

  try {
    const talkPayload = await requestWithRetry(async () => {
      const res = await fetchWithTimeout("https://api.d-id.com/talks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${apiKey}`,
          "Accept": "application/json"
        },
        body: JSON.stringify({
          source_url: imageUrl,
          script: {
            type: "text",
            input: style === "holo" ? "Hello from the hologram." : "Hello."
          }
        })
      }, 15000);
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(`D-ID talk create failed: ${res.status} ${body?.message || body?.error || ""}`.trim());
      }
      return body;
    });

    talkId = talkPayload?.id || talkPayload?.data?.id;
    if (talkId) {
      for (let i = 0; i < 6; i++) {
        const statusPayload = await requestWithRetry(async () => {
          const res = await fetchWithTimeout(`https://api.d-id.com/talks/${talkId}`, {
            method: "GET",
            headers: { "Authorization": `Basic ${apiKey}`, "Accept": "application/json" }
          }, 15000);
          const body = await parseJsonSafe(res);
          if (!res.ok) {
            throw new Error(`D-ID talk status failed: ${res.status} ${body?.message || body?.error || ""}`.trim());
          }
          return body;
        });
        talkStatus = statusPayload?.status || statusPayload?.data?.status;
        resultUrl = statusPayload?.result_url || statusPayload?.data?.result_url;
        if (talkStatus === "done" || talkStatus === "completed") break;
        if (talkStatus === "error" || talkStatus === "failed") break;
        await delay(2500);
      }
    }
  } catch (err) {
    talkStatus = "error";
  }

  let buffer = null;
  if (imageUrl && String(imageUrl).startsWith("http")) {
    buffer = await downloadImage(imageUrl);
  } else {
    buffer = await applyLocalFilter(imageBuffer, style);
  }

  return {
    buffer,
    provider: "did",
    meta: {
      imageUrl,
      talkId,
      talkStatus,
      resultUrl
    }
  };
}

export async function generateAvatar({ imageBuffer, mimeType, style, provider, fileName, groupId }) {
  const normalizedStyle = normalizeStyle(style);
  const requestedProvider = normalizeProvider(provider);
  let result = null;
  const meta = {
    style: normalizedStyle,
    providerRequested: requestedProvider,
    groupId: groupId || null
  };

  if (requestedProvider === "heygen") {
    try {
      result = await generateAvatarHeyGen({ imageBuffer, mimeType, style: normalizedStyle, fileName });
    } catch (err) {
      meta.heygenError = err.message || String(err);
    }
  }

  if (!result && requestedProvider === "did") {
    try {
      result = await generateAvatarDID({ imageBuffer, mimeType, style: normalizedStyle, fileName });
    } catch (err) {
      meta.didError = err.message || String(err);
    }
  }

  if (!result) {
    result = await generateAvatarLocal(imageBuffer, normalizedStyle);
  }

  const avatarId = crypto.randomUUID();
  const originalExt = extensionFromMime(mimeType, fileName || "");
  const createdAt = Date.now();
  const stored = await saveAvatarBundle({
    avatarId,
    originalBuffer: imageBuffer,
    originalExt,
    processedBuffer: result.buffer,
    meta: {
      ...meta,
      ...result.meta,
      providerUsed: result.provider,
      sourceFileName: fileName || `upload${originalExt}`,
      createdAt
    }
  });

  return {
    ...stored,
    provider: result.provider,
    meta: {
      ...meta,
      ...result.meta,
      providerUsed: result.provider,
      sourceFileName: fileName || `upload${originalExt}`,
      createdAt
    }
  };
}

export async function listAvatars() {
  await fs.mkdir(dataAvatarDir, { recursive: true });
  const entries = await fs.readdir(dataAvatarDir, { withFileTypes: true });
  const avatars = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const avatarId = entry.name;
    const metaPath = path.join(dataAvatarDir, avatarId, "meta.json");
    let meta = {};
    try {
      const raw = await fs.readFile(metaPath, "utf-8");
      meta = JSON.parse(raw);
    } catch {
      // ignore missing meta
    }
    const publicFile = (meta.publicFile || `${avatarId}.png`).replace(/^\//, "");
    const displayName = meta.displayName || meta.name || avatarId.replace(/[-_]/g, " ");
    avatars.push({
      avatarId: meta.avatarId || avatarId,
      avatarUrl: `/avatars/${publicFile}`,
      provider: meta.provider || "local",
      style: meta.style || "real",
      displayName,
      dataDir: path.join("data", "avatars", avatarId)
    });
  }

  avatars.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return avatars;
}
