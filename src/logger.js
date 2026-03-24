import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const logsDir = path.join(projectRoot, "logs");
const logFile = path.join(logsDir, "publish-log.md");

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export function logConsole(level, message, context = {}) {
  const payload = Object.keys(context).length
    ? ` ${JSON.stringify(context)}`
    : "";
  // eslint-disable-next-line no-console
  console.log(`[${level}] ${message}${payload}`);
}

export function appendMarkdownLog(entry) {
  const {
    audience,
    status,
    title,
    slug,
    uniqueSlug,
    collision,
    httpStatus,
    wordCount,
    usedKeywords,
    error,
    timestamp
  } = entry;

  const ts = timestamp || new Date().toISOString();
  const lines = [];
  lines.push(`## ${ts} – ${audience}`);
  lines.push("");
  lines.push(`- status: ${status}`);
  if (title) lines.push(`- title: ${title}`);
  if (slug) lines.push(`- slug: ${slug}`);
  if (uniqueSlug) lines.push(`- uniqueSlug: ${uniqueSlug}`);
  if (typeof collision === "boolean")
    lines.push(`- collision: ${collision ? "true" : "false"}`);
  if (httpStatus) lines.push(`- httpStatus: ${httpStatus}`);
  if (typeof wordCount === "number") lines.push(`- wordCount: ${wordCount}`);
  if (Array.isArray(usedKeywords) && usedKeywords.length > 0) {
    lines.push(`- usedKeywords: ${JSON.stringify(usedKeywords)}`);
  }
  if (error) lines.push(`- error: ${error}`);
  lines.push("");

  fs.appendFileSync(logFile, `${lines.join("\n")}\n`);
}

export function logPostAttempt(audience, data) {
  const entry = { audience, timestamp: new Date().toISOString(), ...data };
  logConsole(
    data.status === "success" ? "INFO" : "ERROR",
    `Post attempt for ${audience}`,
    entry
  );
  appendMarkdownLog(entry);
}

