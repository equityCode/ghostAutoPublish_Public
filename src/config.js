import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  NEW_AGENT_KEYWORDS,
  CURRENT_AGENT_KEYWORDS
} from "./keywords.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const profilesFile = path.join(projectRoot, "content-profiles.json");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildDefaultProfiles(configValues) {
  const {
    NEW_AGENT_BACKLINK_URL,
    CURRENT_AGENT_BACKLINK_URL
  } = configValues;

  const newAgentProfile = {
    id: "new_agent",
    label: "New Agents",
    tag: "New Agents",
    backlinkUrl: NEW_AGENT_BACKLINK_URL,
    audienceDescription:
      "People exploring becoming a life insurance agent, new or unlicensed prospects.",
    intent: "Recruiting and onboarding into a supportive agency.",
    keywords: NEW_AGENT_KEYWORDS,
    topicOptions: [
      "how mentorship and support change the first year for new life insurance agents",
      "how new agents can build a pipeline without burning out",
      "how part-time new agents can set themselves up for full-time success",
      "how to avoid common onboarding mistakes new life insurance agents make when joining an agency",
      "how new life insurance agents can pass licensing exams quickly and confidently",
      "how new life insurance agents should structure their first 90 days",
      "how new agents can choose the right upline and mentorship team",
      "how new life insurance agents balance remote work with in-person meetings",
      "how new agents can build confidence with simple appointment scripts"
    ],
    enabled: true
  };

  const currentAgentProfile = {
    id: "current_agent",
    label: "Current Agents",
    tag: "Current Agents",
    backlinkUrl: CURRENT_AGENT_BACKLINK_URL,
    audienceDescription:
      "Currently licensed or experienced life insurance agents.",
    intent:
      "Encourage agents to evaluate a move to a better platform, agency, or team.",
    keywords: CURRENT_AGENT_KEYWORDS,
    topicOptions: [
      "why experienced life insurance agents switch agencies",
      "how better lead flow and marketing systems impact experienced agents",
      "how back-office support and virtual platforms help experienced agents scale",
      "signs it may be time to move to a better life insurance team or platform",
      "how experienced life insurance agents can evaluate new commission and override structures",
      "how to move your life insurance book of business without losing clients",
      "how team-building and recruiting incentives can change an experienced agent’s income",
      "how experienced agents can transition to a virtual or hybrid agency model",
      "how experienced agents should compare CRM and marketing automation platforms"
    ],
    enabled: true
  };

  return [newAgentProfile, currentAgentProfile];
}

function loadProfilesFromDisk(defaultProfiles) {
  try {
    if (!fs.existsSync(profilesFile)) {
      return defaultProfiles;
    }

    const raw = fs.readFileSync(profilesFile, "utf8");
    if (!raw.trim()) {
      return defaultProfiles;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return defaultProfiles;
    }

    const enabledProfiles = parsed.filter(
      (p) => p && p.enabled !== false
    );

    if (enabledProfiles.length === 0) {
      return defaultProfiles;
    }

    const limited = enabledProfiles.slice(0, 2);

    return limited.map((profile, idx) => {
      const fallback = defaultProfiles[idx] || defaultProfiles[0];
      return {
        id: String(profile.id || fallback.id || `profile_${idx + 1}`),
        label:
          typeof profile.label === "string" && profile.label.trim()
            ? profile.label.trim()
            : fallback.label || `Profile ${idx + 1}`,
        tag:
          typeof profile.tag === "string" && profile.tag.trim()
            ? profile.tag.trim()
            : fallback.tag || "",
        backlinkUrl:
          typeof profile.backlinkUrl === "string" &&
          profile.backlinkUrl.trim()
            ? profile.backlinkUrl.trim()
            : fallback.backlinkUrl,
        audienceDescription:
          typeof profile.audienceDescription === "string" &&
          profile.audienceDescription.trim()
            ? profile.audienceDescription.trim()
            : fallback.audienceDescription || "",
        intent:
          typeof profile.intent === "string" && profile.intent.trim()
            ? profile.intent.trim()
            : fallback.intent || "",
        keywords: Array.isArray(profile.keywords)
          ? profile.keywords
          : Array.isArray(fallback.keywords)
          ? fallback.keywords
          : [],
        topicOptions: Array.isArray(profile.topicOptions)
          ? profile.topicOptions
          : Array.isArray(fallback.topicOptions)
          ? fallback.topicOptions
          : [],
        enabled: profile.enabled !== false
      };
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "Failed to load content-profiles.json; falling back to default profiles.",
      err && err.message ? err.message : err
    );
    return defaultProfiles;
  }
}

export function loadConfig() {
  const GEMINI_API_KEY = requireEnv("GEMINI_API_KEY");
  const GEMINI_MODEL = requireEnv("GEMINI_MODEL");
  const GEMINI_REFORMAT_MODEL =
    process.env.GEMINI_REFORMAT_MODEL || GEMINI_MODEL;
  const GEMINI_REFORMAT_API_KEY =
    process.env.GEMINI_REFORMAT_API_KEY || GEMINI_API_KEY;

  const GHOST_ADMIN_API_KEY = requireEnv("GHOST_ADMIN_API_KEY");
  const GHOST_ADMIN_API_URL = requireEnv("GHOST_ADMIN_API_URL");

  const BLOG_SITE_URL = requireEnv("BLOG_SITE_URL");

  const NEW_AGENT_BACKLINK_URL = requireEnv("NEW_AGENT_BACKLINK_URL");

  const CURRENT_AGENT_BACKLINK_URL = requireEnv("CURRENT_AGENT_BACKLINK_URL");

  const defaultProfiles = buildDefaultProfiles({
    NEW_AGENT_BACKLINK_URL,
    CURRENT_AGENT_BACKLINK_URL
  });
  const profiles = loadProfilesFromDisk(defaultProfiles);

  const [keyId, secret] = GHOST_ADMIN_API_KEY.split(":");
  if (!keyId || !secret) {
    throw new Error(
      "GHOST_ADMIN_API_KEY must be in the format KEY_ID:SECRET (Admin API key)."
    );
  }

  return {
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GEMINI_REFORMAT_MODEL,
    GEMINI_REFORMAT_API_KEY,
    GHOST_ADMIN_API_KEY,
    GHOST_ADMIN_API_URL,
    BLOG_SITE_URL,
    NEW_AGENT_BACKLINK_URL,
    CURRENT_AGENT_BACKLINK_URL,
    profiles,
    keyId: keyId.trim(),
    secret: secret.trim()
  };
}
