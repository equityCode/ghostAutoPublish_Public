function stripHtmlToWords(html) {
  const text = html.replace(/<[^>]*>/g, " ");
  return text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

function validateWordCount(html) {
  const words = stripHtmlToWords(html);
  const wordCount = words.length;
  if (wordCount < 600 || wordCount > 1100) {
    throw new Error(
      `html word count ${wordCount} is outside the allowed range (600–1100).`
    );
  }
  return wordCount;
}

function normalizeSlug(rawSlug, title) {
  const source = (rawSlug && rawSlug.trim()) || title || "";
  let slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    slug = `post-${Date.now()}`;
  }

  const MAX_LEN = 120;
  if (slug.length > MAX_LEN) {
    slug = slug.slice(0, MAX_LEN).replace(/-+$/g, "");
  }

  return slug;
}

export function generateExcerptFromHtml(
  html,
  maxWords = 35,
  maxChars = 260
) {
  const words = stripHtmlToWords(html);
  if (words.length === 0) {
    return "";
  }

  const sliced = words.slice(0, maxWords);
  let excerpt = sliced.join(" ");

  if (excerpt.length > maxChars) {
    excerpt = `${excerpt.slice(0, maxChars).replace(/\s+\S*$/, "")}…`;
  }

  return excerpt;
}

export function validateGeminiPost(profile, rawPost, config) {
  const audience =
    (profile && (profile.id || profile.label)) || "unknown_profile";

  if (!rawPost || typeof rawPost !== "object") {
    throw new Error(`Gemini response for ${audience} is not a JSON object.`);
  }

  const { title, slug, html } = rawPost;

  if (typeof title !== "string" || !title.trim()) {
    throw new Error(`Missing or invalid title for ${audience}.`);
  }
  if (title.length > 120) {
    throw new Error(`Title too long for ${audience} (max 120 characters).`);
  }

  if (typeof html !== "string" || !html.trim()) {
    throw new Error(`Missing or invalid html for ${audience}.`);
  }
  if (!html.includes("<") || !html.includes(">")) {
    throw new Error(`html for ${audience} does not look like HTML.`);
  }

  let requiredBacklink =
    (profile && profile.backlinkUrl) || undefined;

  // Backwards-compatible fallback for legacy configs without profile.backlinkUrl
  if (!requiredBacklink && config) {
    if (audience === "new_agent" && config.NEW_AGENT_BACKLINK_URL) {
      requiredBacklink = config.NEW_AGENT_BACKLINK_URL;
    } else if (
      audience === "current_agent" &&
      config.CURRENT_AGENT_BACKLINK_URL
    ) {
      requiredBacklink = config.CURRENT_AGENT_BACKLINK_URL;
    }
  }

  if (!requiredBacklink) {
    throw new Error(
      `Missing required backlink URL configuration for profile ${audience}.`
    );
  }

  if (!html.includes(requiredBacklink)) {
    throw new Error(
      `html for ${audience} does not contain required backlink URL: ${requiredBacklink}`
    );
  }

  const wordCount = validateWordCount(html);
  const normalizedSlug = normalizeSlug(slug, title);

  return {
    title: title.trim(),
    slug: normalizedSlug,
    html,
    audience,
    wordCount
  };
}
