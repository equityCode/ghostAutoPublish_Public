import { validateGeminiPost } from "./validators.js";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1/models";
const GEMINI_REFORMAT_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

function safeParseGeminiJson(rawText, audience) {
  try {
    return JSON.parse(rawText);
  } catch (strictErr) {
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw strictErr;
    }

    const candidate = rawText.slice(firstBrace, lastBrace + 1);

    try {
      const parsed = JSON.parse(candidate);
      // eslint-disable-next-line no-console
      console.warn(
        `safeParseGeminiJson: salvaged JSON for audience ${audience} by trimming to outer braces.`
      );
      return parsed;
    } catch {
      throw strictErr;
    }
  }
}

async function reformatGeminiResponse(rawText, audience, config) {
  const promptObject = {
    role: "You are a strict JSON formatter.",
    output_contract: {
      format: "json_only",
      rules: [
        "Return ONLY valid JSON.",
        "No markdown.",
        "No code fences.",
        "No commentary.",
        "If the input text already contains a JSON object, fix any syntax issues.",
        "If fields are missing, reconstruct them conservatively from the text."
      ],
      fields: {
        title: "Short, human-readable title for the article.",
        slug:
          "Long-tail, SEO-friendly slug: lowercase, hyphen-separated, no spaces.",
        html: "Full article body as HTML."
      }
    },
    input_text: rawText,
    final_reminder:
      "Return exactly one JSON object with fields 'title', 'slug', and 'html'."
  };

  const reformatPrompt = JSON.stringify(promptObject);

  const url = `${GEMINI_REFORMAT_BASE}/${encodeURIComponent(
    config.GEMINI_REFORMAT_MODEL
  )}:generateContent?key=${encodeURIComponent(
    config.GEMINI_REFORMAT_API_KEY
  )}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: reformatPrompt }]
      }
    ]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Gemini reformat API error (${audience}): ${res.status} ${
        res.statusText
      } – ${text.slice(0, 300)}`
    );
  }

  const data = await res.json();
  const candidates = data.candidates || [];
  const first = candidates[0];
  if (!first || !first.content || !Array.isArray(first.content.parts)) {
    throw new Error(
      `Gemini reformat response for ${audience} missing expected content.parts.`
    );
  }
  const textPart = first.content.parts.find(
    (p) => typeof p.text === "string" && p.text.trim()
  );
  if (!textPart) {
    throw new Error(
      `Gemini reformat response for ${audience} did not contain any text parts.`
    );
  }

  return textPart.text;
}

export async function callGemini(prompt, config) {
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(
    config.GEMINI_MODEL
  )}:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY)}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const error = new Error(
      `Gemini API error: ${res.status} ${res.statusText} – ${text.slice(
        0,
        300
      )}`
    );
    error.status = res.status;
    error.body = text;
    throw error;
  }

  const data = await res.json();
  const candidates = data.candidates || [];
  const first = candidates[0];
  if (!first || !first.content || !Array.isArray(first.content.parts)) {
    throw new Error("Gemini response missing expected content.parts.");
  }
  const textPart = first.content.parts.find(
    (p) => typeof p.text === "string" && p.text.trim()
  );
  if (!textPart) {
    throw new Error("Gemini response did not contain any text parts.");
  }
  return textPart.text;
}

async function callGeminiBackup(prompt, config) {
  const url = `${GEMINI_REFORMAT_BASE}/${encodeURIComponent(
    config.GEMINI_REFORMAT_MODEL
  )}:generateContent?key=${encodeURIComponent(
    config.GEMINI_REFORMAT_API_KEY
  )}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const error = new Error(
      `Gemini backup API error: ${res.status} ${
        res.statusText
      } – ${text.slice(0, 300)}`
    );
    error.status = res.status;
    error.body = text;
    throw error;
  }

  const data = await res.json();
  const candidates = data.candidates || [];
  const first = candidates[0];
  if (!first || !first.content || !Array.isArray(first.content.parts)) {
    throw new Error("Gemini backup response missing expected content.parts.");
  }
  const textPart = first.content.parts.find(
    (p) => typeof p.text === "string" && p.text.trim()
  );
  if (!textPart) {
    throw new Error(
      "Gemini backup response did not contain any text parts."
    );
  }
  return textPart.text;
}

export async function generatePostForProfile(profile, prompt, config) {
  const audience = (profile && (profile.id || profile.label)) || "profile";

  let text;
  try {
    text = await callGemini(prompt, config);
  } catch (err) {
    if (err && err.status === 429) {
      text = await callGeminiBackup(prompt, config);
    } else {
      throw err;
    }
  }
  let parsed;
  try {
    parsed = safeParseGeminiJson(text, audience);
  } catch (err) {
    const reformattedRaw = await reformatGeminiResponse(
      text,
      audience,
      config
    );

    try {
      parsed = safeParseGeminiJson(reformattedRaw, audience);
    } catch (reErr) {
      throw new Error(
        `Failed to parse Gemini JSON after reformat for ${audience}: ${
          (reErr && reErr.message) || reErr
        }`
      );
    }
  }
  return validateGeminiPost(
    {
      ...profile,
      id: audience
    },
    parsed,
    config
  );
}

// Backwards-compatible wrapper for any existing callers.
export async function generatePostForAudience(audience, prompt, config) {
  const legacyProfile = {
    id: audience
  };
  return generatePostForProfile(legacyProfile, prompt, config);
}
