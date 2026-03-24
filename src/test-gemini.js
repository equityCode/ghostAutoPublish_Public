import dotenv from "dotenv";
import { loadConfig } from "./config.js";
import { buildPromptsForRun } from "./prompts.js";
import { callGemini } from "./gemini.js";
import { validateGeminiPost } from "./validators.js";

dotenv.config();

async function main() {
  try {
    const config = loadConfig();

    const [first] = buildPromptsForRun(config);
    const { profile, prompt, usedKeywords } = first;

    // For debugging: show which keywords we chose.
    // eslint-disable-next-line no-console
    console.log(`Selected keywords for profile ${profile.id}:`, usedKeywords);

    const rawText = await callGemini(prompt, config);

    // Show full raw Gemini output for debugging.
    // eslint-disable-next-line no-console
    console.log("Raw Gemini text length:", rawText.length);
    // eslint-disable-next-line no-console
    console.log("Raw Gemini text (full):", rawText);

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        "JSON.parse error on Gemini output:",
        err && err.message ? err.message : err
      );
      process.exit(1);
    }

    const post = validateGeminiPost(profile, parsed, config);

    // Summarize the result without dumping full HTML.
    // eslint-disable-next-line no-console
    console.log(`Gemini result summary for profile ${profile.id}:`, {
      title: post.title,
      slug: post.slug,
      wordCount: post.wordCount
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Gemini test failed:", err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();
