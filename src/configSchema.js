export const CONFIG_FIELDS = [
  {
    key: "GEMINI_API_KEY",
    label: "Gemini API key",
    description: "Primary Gemini API key used for content generation.",
    group: "Gemini",
    required: true,
    validate(value) {
      if (!value || !value.trim()) {
        return "GEMINI_API_KEY is required.";
      }
      return true;
    }
  },
  {
    key: "GEMINI_MODEL",
    label: "Gemini model",
    description: "Default model used for generation (e.g. gemini-2.5-flash).",
    group: "Gemini",
    required: true,
    validate(value) {
      if (!value || !value.trim()) {
        return "GEMINI_MODEL is required.";
      }
      return true;
    }
  },
  {
    key: "GEMINI_REFORMAT_API_KEY",
    label: "Gemini reformat API key",
    description: "Optional backup key for JSON reformatting and 429 fallback.",
    group: "Gemini",
    required: false,
    validate() {
      return true;
    }
  },
  {
    key: "GEMINI_REFORMAT_MODEL",
    label: "Gemini reformat model",
    description:
      "Optional model used for JSON cleanup (defaults to GEMINI_MODEL).",
    group: "Gemini",
    required: false,
    validate() {
      return true;
    }
  },
  {
    key: "BLOG_SITE_URL",
    label: "Blog site URL",
    description: "Public blog URL (e.g. https://your-blog-domain).",
    group: "Ghost",
    required: true,
    validate(value) {
      if (!value || !/^https?:\/\//i.test(value.trim())) {
        return "BLOG_SITE_URL must start with http:// or https://.";
      }
      return true;
    }
  },
  {
    key: "GHOST_ADMIN_API_URL",
    label: "Ghost Admin API URL",
    description:
      "Ghost Admin API base (e.g. https://your-blog-domain/ghost/api/admin).",
    group: "Ghost",
    required: true,
    validate(value) {
      if (!value || !/^https?:\/\//i.test(value.trim())) {
        return "GHOST_ADMIN_API_URL must start with http:// or https://.";
      }
      return true;
    }
  },
  {
    key: "GHOST_ADMIN_API_KEY",
    label: "Ghost Admin API key",
    description: "Admin API key in KEY_ID:SECRET format.",
    group: "Ghost",
    required: true,
    validate(value) {
      if (!value || !value.includes(":")) {
        return "GHOST_ADMIN_API_KEY must contain KEY_ID:SECRET.";
      }
      const [keyId, secret] = value.split(":");
      if (!keyId || !secret) {
        return "GHOST_ADMIN_API_KEY must contain non-empty KEY_ID and SECRET.";
      }
      return true;
    }
  },
  {
    key: "NEW_AGENT_BACKLINK_URL",
    label: "Legacy backlink URL (profile 1)",
    description:
      "Fallback backlink URL for the first example profile (used if profile.backlinkUrl is missing).",
    group: "Backlinks",
    required: true,
    validate(value) {
      if (!value || !/^https?:\/\//i.test(value.trim())) {
        return "NEW_AGENT_BACKLINK_URL must start with http:// or https://.";
      }
      return true;
    }
  },
  {
    key: "CURRENT_AGENT_BACKLINK_URL",
    label: "Legacy backlink URL (profile 2)",
    description:
      "Fallback backlink URL for the second example profile (used if profile.backlinkUrl is missing).",
    group: "Backlinks",
    required: true,
    validate(value) {
      if (!value || !/^https?:\/\//i.test(value.trim())) {
        return "CURRENT_AGENT_BACKLINK_URL must start with http:// or https://.";
      }
      return true;
    }
  }
];

