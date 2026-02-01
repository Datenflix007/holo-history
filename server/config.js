import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, "..", ".env");

dotenv.config({ path: rootEnvPath });

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

const useOllama = toBool(process.env.USE_OLLAMA, false);
const port = Number.parseInt(process.env.PORT || "", 10) || 8787;

export const config = {
  port,
  llm: {
    provider: useOllama ? "ollama" : "openai",
    model: useOllama
      ? process.env.OLLAMA_MODEL || "gpt-oss:20b"
      : process.env.OPENAI_MODEL || "gpt-4o-mini",
    baseUrl: useOllama
      ? process.env.OLLAMA_BASE_URL || "http://localhost:11434"
      : undefined,
  },
};
