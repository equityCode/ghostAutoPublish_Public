import { loadHistory } from "./history.js";

function escapeHtml(str) {
  if (typeof str !== "string") {
    return "";
  }
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function addRelatedPostsToHtml(
  profileId,
  profileLabel,
  html,
  usedKeywords,
  config,
  maxLinks = 3
) {
  if (
    typeof html !== "string" ||
    !html.trim() ||
    !config ||
    !config.BLOG_SITE_URL ||
    !Array.isArray(usedKeywords) ||
    usedKeywords.length === 0
  ) {
    return html;
  }

  const history = loadHistory();
  const audienceHistory = Array.isArray(history[profileId])
    ? history[profileId]
    : [];

  if (audienceHistory.length === 0) {
    return html;
  }

  const keywordSet = new Set(
    usedKeywords
      .map((kw) => (typeof kw === "string" ? kw.trim() : ""))
      .filter((kw) => kw.length > 0)
  );

  if (keywordSet.size === 0) {
    return html;
  }

  const candidates = [];

  for (let i = 0; i < audienceHistory.length; i += 1) {
    const entry = audienceHistory[i];
    if (!entry) continue;

    const entrySlug =
      typeof entry.slug === "string" && entry.slug.trim()
        ? entry.slug.trim()
        : null;
    if (!entrySlug) continue;

    const entryKeywords = Array.isArray(entry.usedKeywords)
      ? entry.usedKeywords
      : [];

    if (entryKeywords.length === 0) {
      continue;
    }

    let overlapCount = 0;
    for (const kw of entryKeywords) {
      if (typeof kw !== "string") continue;
      const trimmed = kw.trim();
      if (!trimmed) continue;
      if (keywordSet.has(trimmed)) {
        overlapCount += 1;
      }
    }

    if (overlapCount === 0) {
      continue;
    }

    const recencyBoost = i;
    const score = overlapCount * 10 + recencyBoost;

    candidates.push({
      entry,
      score,
      index: i
    });
  }

  if (candidates.length === 0) {
    return html;
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.index - a.index;
  });

  const selected = candidates.slice(0, Math.min(maxLinks, candidates.length));

  const base = config.BLOG_SITE_URL.replace(/\/+$/, "");
  const audienceLabel =
    (typeof profileLabel === "string" && profileLabel.trim()) ||
    profileId;

  let listItems = "";
  for (const { entry } of selected) {
    const rawSlug =
      typeof entry.slug === "string" && entry.slug.trim()
        ? entry.slug.trim()
        : "";
    if (!rawSlug) {
      continue;
    }
    const slug = rawSlug.replace(/^\/+/, "");
    const url = `${base}/${slug}/`;
    const title = escapeHtml(
      typeof entry.title === "string" && entry.title.trim()
        ? entry.title.trim()
        : slug
    );
    listItems += `    <li><a href="${url}">${title}</a></li>\n`;
  }

  if (!listItems) {
    return html;
  }

  const relatedSection = `\n\n<section class="related-posts">\n  <h2>More for ${audienceLabel}</h2>\n  <ul>\n${listItems}  </ul>\n</section>\n`;

  return `${html}${relatedSection}`;
}
