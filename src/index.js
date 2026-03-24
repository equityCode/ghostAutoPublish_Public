import { loadConfig } from "./config.js";
import { buildPromptsForRun } from "./prompts.js";
import { generatePostForProfile } from "./gemini.js";
import { createGhostJwt } from "./ghostAuth.js";
import { publishPost } from "./ghostApi.js";
import { logConsole, logPostAttempt } from "./logger.js";
import { appendHistoryEntry } from "./history.js";
import { addRelatedPostsToHtml } from "./relatedPosts.js";

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    logConsole(
      "ERROR",
      "Failed to load configuration.",
      { error: (err && err.message) || err }
    );
    process.exit(1);
  }

  const runId = new Date().toISOString();
  logConsole("INFO", "Starting ghostAutoPublish run", {
    runId,
    BLOG_SITE_URL: config.BLOG_SITE_URL
  });

  let promptEntries;
  try {
    promptEntries = buildPromptsForRun(config);
  } catch (err) {
    logConsole(
      "ERROR",
      "Failed to build content profile prompts.",
      { error: (err && err.message) || err }
    );
    process.exit(1);
  }

  const results = [];

  for (const { profile, prompt, usedKeywords } of promptEntries) {
    let post = null;
    try {
      post = await generatePostForProfile(profile, prompt, config);
      logConsole("INFO", "Generated Gemini content for profile", {
        profileId: profile.id,
        label: profile.label,
        wordCount: post.wordCount
      });
    } catch (err) {
      logPostAttempt(profile.id, {
        status: "failure",
        error: (err && err.message) || err,
        usedKeywords
      });
    }
    results.push({ profile, prompt, usedKeywords, post });
  }

  const anyPost = results.some((r) => r.post);
  if (!anyPost) {
    logConsole("ERROR", "All Gemini generations failed; aborting before publishing.");
    process.exit(1);
  }

  let ghostJwt;
  try {
    ghostJwt = createGhostJwt(config);
  } catch (err) {
    logConsole(
      "ERROR",
      "Failed to create Ghost JWT; cannot publish any posts.",
      { error: (err && err.message) || err }
    );
    for (const { profile, usedKeywords, post } of results) {
      if (!post) {
        continue;
      }
      logPostAttempt(profile.id, {
        status: "failure",
        error: "Ghost JWT creation failed; publish skipped.",
        usedKeywords,
        wordCount: post.wordCount
      });
    }
    process.exit(1);
  }

  const profileResults = [];

  for (const item of results) {
    const { profile, usedKeywords, post } = item;
    if (!post) {
      profileResults.push({ profileId: profile.id, success: false });
      continue;
    }

    let success = false;
    try {
      post.html = addRelatedPostsToHtml(
        profile.id,
        profile.label,
        post.html,
        usedKeywords,
        config
      );
      const result = await publishPost(profile, post, config, ghostJwt);
      logPostAttempt(profile.id, {
        status: "success",
        title: post.title,
        slug: post.slug,
        uniqueSlug: result.uniqueSlug,
        collision: result.collision,
        httpStatus: result.httpStatus,
        wordCount: post.wordCount,
        usedKeywords
      });
      appendHistoryEntry(profile.id, {
        date: new Date().toISOString(),
        title: post.title,
        slug: result.uniqueSlug,
        usedKeywords,
        wordCount: post.wordCount
      });
      success = true;
    } catch (err) {
      logPostAttempt(profile.id, {
        status: "failure",
        title: post.title,
        slug: post.slug,
        wordCount: post.wordCount,
        usedKeywords,
        error: (err && err.message) || err
      });
    }
    profileResults.push({ profileId: profile.id, success });
  }

  const allSuccess =
    profileResults.length > 0 &&
    profileResults.every((r) => r.success === true);

  if (allSuccess) {
    logConsole("INFO", "All profile posts published successfully.", {
      runId,
      profiles: profileResults
    });
    process.exit(0);
  }

  logConsole("ERROR", "One or more profile posts failed to publish.", {
    runId,
    profiles: profileResults
  });
  process.exit(1);
}

main().catch((err) => {
  logConsole("ERROR", "Unexpected error in main.", {
    error: (err && err.message) || err
  });
  process.exit(1);
});
