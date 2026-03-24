export const NEW_AGENT_KEYWORDS = [
  "become a life insurance agent",
  "how to start as a life insurance agent",
  "life insurance agent training",
  "support for new life insurance agents",
  "life insurance agent onboarding",
  "first year as a life insurance agent",
  "life insurance agent mentorship",
  "part time life insurance agent",
  "life insurance agent career change",
  "life insurance agent success tips",
  "how to get licensed as a life insurance agent",
  "best agency for new life insurance agents",
  "life insurance agent leads for beginners",
  "new life insurance agent mistakes to avoid",
  "how new life insurance agents get paid",
  "life insurance licensing exam tips",
  "life insurance agent state licensing requirements",
  "life insurance agent daily schedule for beginners",
  "life insurance agent phone scripts for first appointments",
  "life insurance sales training for beginners",
  "remote life insurance agent jobs",
  "online life insurance agent training",
  "life insurance agent product training for new agents",
  "life insurance agent compliance basics"
];

export const CURRENT_AGENT_KEYWORDS = [
  "switch life insurance agency",
  "better life insurance agent commission",
  "life insurance agent overrides and bonuses",
  "life insurance agent leads",
  "independent life insurance agent platform",
  "life insurance agent contract review",
  "life insurance agent support and training",
  "life insurance agent marketing systems",
  "high comp life insurance agency",
  "life insurance agent recruiting incentives",
  "move your life insurance book of business",
  "life insurance agent partnership opportunities",
  "life insurance agent virtual agency",
  "life insurance agent team building",
  "life insurance agent back office support",
  "life insurance agent contract buyout options",
  "life insurance agent vesting and renewals",
  "life insurance agent remote selling platform",
  "life insurance agent crm and marketing automation",
  "life insurance agent override structures",
  "life insurance agent training for experienced producers",
  "life insurance agent cross-selling strategies"
];

export const DEFAULT_KEYWORD_COUNT = 3;

export function chooseRandomKeywords(list, count = DEFAULT_KEYWORD_COUNT) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

export function chooseFreshKeywords(
  audience,
  history,
  baseList,
  count = DEFAULT_KEYWORD_COUNT
) {
  const audienceHistory = (history && history[audience]) || [];
  const recent = audienceHistory.slice(-10);

  const comboSet = new Set(
    recent
      .map((entry) =>
        Array.isArray(entry.usedKeywords)
          ? JSON.stringify([...entry.usedKeywords].sort())
          : null
      )
      .filter(Boolean)
  );

  const freq = new Map();
  for (const entry of recent) {
    if (Array.isArray(entry.usedKeywords)) {
      for (const kw of entry.usedKeywords) {
        freq.set(kw, (freq.get(kw) || 0) + 1);
      }
    }
  }

  const candidates = [...baseList];
  candidates.sort((a, b) => {
    const fa = freq.get(a) || 0;
    const fb = freq.get(b) || 0;
    return fa - fb || a.localeCompare(b);
  });

  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const pickSet = new Set();
  const result = [];
  for (const kw of shuffled) {
    if (result.length >= count) break;
    if (pickSet.has(kw)) continue;
    pickSet.add(kw);
    result.push(kw);
  }

  const sortedComboKey = JSON.stringify([...result].sort());
  if (comboSet.has(sortedComboKey)) {
    return chooseRandomKeywords(baseList, count);
  }

  return result;
}
