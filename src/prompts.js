import {
  NEW_AGENT_KEYWORDS,
  CURRENT_AGENT_KEYWORDS,
  DEFAULT_KEYWORD_COUNT,
  chooseFreshKeywords
} from "./keywords.js";
import { loadHistory } from "./history.js";

function buildBaseJsonPrompt({
  backlinkUrl,
  audienceDescription,
  intent,
  recentTopics,
  keywords,
  topicOptions
}) {
  const promptObject = {
    role:
      "You are an SEO-focused content writer for a life insurance recruiting organization.",
    output_contract: {
      format: "json_only",
      rules: [
        "Return ONLY valid JSON.",
        "No markdown.",
        "No code fences.",
        "No commentary."
      ],
      fields: {
        title: "A short, human-readable blog post title.",
        slug:
          "A long-tail, keyword-rich, lowercase, hyphen-separated slug with no spaces or special characters.",
        html: "The full article body as HTML."
      }
    },
    content_requirements: {
      word_count: {
        min: 600,
        max: 1100,
        target_range: [800, 1000]
      },
      guidelines: [
        "Write for readability first, SEO second.",
        "Use natural language; avoid keyword stuffing.",
        "Include at least one natural contextual backlink to the required URL in the HTML body.",
        "Do not use placeholders such as 'insert link here'."
      ]
    },
    output_rules: [
      "Respond with a single JSON object only.",
      "Do NOT wrap the JSON in markdown code fences.",
      "Do NOT include any explanation or text outside the JSON."
    ],
    audience_and_intent: {
      audience_description: audienceDescription,
      intent
    },
    backlink_requirement: {
      url: backlinkUrl,
      rules: [
        "Include at least one natural contextual link to this URL in the HTML body."
      ]
    },
    recent_topics_to_avoid: recentTopics,
    freshness_requirement: {
      rules: [
        "Do NOT simply restate or lightly rephrase any of the recent topics listed in 'recent_topics_to_avoid'.",
        "Pick a distinct angle or scenario.",
        "You may cover related ideas, but the headline, framing, and main sections should be clearly different from the recent topics."
      ]
    },
    seo_keywords: {
      description:
        "Incorporate these SEO keywords naturally in the article body and where appropriate in the slug, without keyword stuffing.",
      keywords
    },
    topic_guidance: {
      description: "Choose one strong angle for this run.",
      options: topicOptions
    },
    final_reminder:
      "Use all of the above sections as constraints and guidance. Produce a single JSON object with the fields 'title', 'slug', and 'html' that satisfies the output_contract, content_requirements, backlink_requirement, freshness_requirement, seo_keywords, and topic_guidance."
  };

  return JSON.stringify(promptObject);
}

export function buildPromptForProfile(profile, history) {
  const profileId = profile.id;
  const audienceHistory = Array.isArray(history[profileId])
    ? history[profileId]
    : [];
  const recent = audienceHistory.slice(-10);
  const recentTopics = recent.map((entry) => entry.title).filter(Boolean);

  const keywordPool = Array.isArray(profile.keywords)
    ? profile.keywords
    : [];

  const usedKeywords = chooseFreshKeywords(
    profileId,
    history,
    keywordPool,
    DEFAULT_KEYWORD_COUNT
  );

  const prompt = buildBaseJsonPrompt({
    backlinkUrl: profile.backlinkUrl,
    audienceDescription: profile.audienceDescription,
    intent: profile.intent,
    recentTopics,
    keywords: usedKeywords,
    topicOptions: Array.isArray(profile.topicOptions)
      ? profile.topicOptions
      : []
  });

  return { prompt, usedKeywords };
}

export function buildPromptsForRun(config) {
  const history = loadHistory();
  const profiles = Array.isArray(config.profiles) ? config.profiles : [];
  const enabledProfiles = profiles.filter(
    (p) => p && p.enabled !== false
  );

  if (enabledProfiles.length === 0) {
    throw new Error("No enabled content profiles found in configuration.");
  }

  const limited = enabledProfiles.slice(0, 2);
  return limited.map((profile) => {
    const { prompt, usedKeywords } = buildPromptForProfile(
      profile,
      history
    );
    return { profile, prompt, usedKeywords };
  });
}

// Backwards-compatible helpers for the legacy test harness and flows.
export function buildNewAgentPrompt(config) {
  const history = loadHistory();
  const audienceKey = "new_agent";
  const audienceHistory = history[audienceKey] || [];
  const recent = audienceHistory.slice(-10);
  const recentTopics = recent.map((entry) => entry.title).filter(Boolean);

  const usedKeywords = chooseFreshKeywords(
    audienceKey,
    history,
    NEW_AGENT_KEYWORDS,
    DEFAULT_KEYWORD_COUNT
  );

  const prompt = buildBaseJsonPrompt({
    backlinkUrl: config.NEW_AGENT_BACKLINK_URL,
    audienceDescription:
      "People exploring becoming a life insurance agent, new or unlicensed prospects.",
    intent: "Recruiting and onboarding into a supportive agency.",
    recentTopics,
    keywords: usedKeywords,
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
    ]
  });

  return { prompt, usedKeywords };
}

export function buildCurrentAgentPrompt(config) {
  const history = loadHistory();
  const profile = {
    id: "current_agent",
    label: "Current Agents",
    tag: "Current Agents",
    backlinkUrl: config.CURRENT_AGENT_BACKLINK_URL,
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

  return buildPromptForProfile(profile, history);
}
