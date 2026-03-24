import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, "data");
const historyFile = path.join(dataDir, "post-history.json");

const EMPTY_HISTORY = {};

export function loadHistory() {
  try {
    if (!fs.existsSync(historyFile)) {
      return { ...EMPTY_HISTORY };
    }
    const raw = fs.readFileSync(historyFile, "utf8");
    if (!raw.trim()) {
      return { ...EMPTY_HISTORY };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...EMPTY_HISTORY };
    }

    const result = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) {
        result[key] = value;
      }
    }

    return result;
  } catch {
    return { ...EMPTY_HISTORY };
  }
}

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export function saveHistory(history) {
  ensureDataDir();
  const payload = JSON.stringify(history, null, 2);
  fs.writeFileSync(historyFile, payload, "utf8");
}

export function appendHistoryEntry(audience, entry) {
  const history = loadHistory();
  if (!history[audience]) {
    history[audience] = [];
  }
  history[audience].push(entry);

  const MAX_ENTRIES = 60;
  if (history[audience].length > MAX_ENTRIES) {
    history[audience] = history[audience].slice(
      history[audience].length - MAX_ENTRIES
    );
  }

  saveHistory(history);
}
