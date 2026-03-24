import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvFromFile, saveEnvAtomic } from "./envFile.js";
import { CONFIG_FIELDS } from "./configSchema.js";
import { testGemini, testGhost } from "./healthChecks.js";
import { loadConfig } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const profilesFile = path.join(projectRoot, "content-profiles.json");

function loadExistingProfiles() {
  try {
    if (!fs.existsSync(profilesFile)) {
      return null;
    }
    const raw = fs.readFileSync(profilesFile, "utf8");
    if (!raw.trim()) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function atomicWriteProfiles(profiles) {
  const payload = JSON.stringify(profiles, null, 2);
  const tmp = `${profilesFile}.new`;
  fs.writeFileSync(tmp, payload, "utf8");
  fs.renameSync(tmp, profilesFile);
}

async function collectEnvConfig() {
  const { envObject } = loadEnvFromFile();

  // Intro
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("Welcome to the ghostAutoPublish setup wizard.");
  // eslint-disable-next-line no-console
  console.log(
    "This wizard will collect Gemini and Ghost configuration, run tests, and write a .env file atomically."
  );
  // eslint-disable-next-line no-console
  console.log("");

  const newEnv = { ...envObject };

  // Gemini
  // eslint-disable-next-line no-console
  console.log("--- Gemini configuration ---");
  const geminiQuestions = CONFIG_FIELDS.filter(
    (f) => f.group === "Gemini"
  ).map((field) => ({
    name: field.key,
    type: field.key.includes("KEY") ? "password" : "input",
    message: `${field.label}:`,
    default: newEnv[field.key] || "",
    mask: field.key.includes("KEY") ? "*" : undefined,
    validate: (value) => {
      const result = field.validate(value);
      return result === true || typeof result === "undefined"
        ? true
        : result;
    }
  }));
  const geminiAnswers = await inquirer.prompt(geminiQuestions);
  Object.assign(newEnv, geminiAnswers);

  // Ghost + backlinks
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("--- Ghost configuration ---");
  const ghostFields = CONFIG_FIELDS.filter(
    (f) => f.group === "Ghost" || f.group === "Backlinks"
  );

  const ghostQuestions = ghostFields.map((field) => ({
    name: field.key,
    type: field.key.includes("KEY") ? "password" : "input",
    message: `${field.label}:`,
    default: newEnv[field.key] || "",
    mask: field.key.includes("KEY") ? "*" : undefined,
    validate: (value) => {
      const result = field.validate(value);
      return result === true || typeof result === "undefined"
        ? true
        : result;
    }
  }));

  const ghostAnswers = await inquirer.prompt(ghostQuestions);
  Object.assign(newEnv, ghostAnswers);

  return newEnv;
}

async function runHealthChecks(tempEnv) {
  // Build a runtime config from the proposed env without writing it yet
  const original = { ...process.env };
  try {
    Object.assign(process.env, tempEnv);
    const config = loadConfig();

    const [geminiResult, ghostResult] = await Promise.all([
      testGemini(config),
      testGhost(config)
    ]);

    // eslint-disable-next-line no-console
    console.log("");
    // eslint-disable-next-line no-console
    console.log("--- Connectivity tests ---");
    // eslint-disable-next-line no-console
    console.log(`Gemini: ${geminiResult.ok ? "✅" : "❌"} ${geminiResult.message}`);
    // eslint-disable-next-line no-console
    console.log(`Ghost:  ${ghostResult.ok ? "✅" : "❌"} ${ghostResult.message}`);

    return geminiResult.ok && ghostResult.ok;
  } finally {
    // restore env
    Object.keys(process.env).forEach((k) => {
      if (!(k in original)) {
        delete process.env[k];
      }
    });
    Object.assign(process.env, original);
  }
}

async function promptForProfiles(existingProfiles, blogSiteUrl) {
  // Intro + why 2 profiles
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log(
    "ghostAutoPublish can manage up to two content profiles per run."
  );
  // eslint-disable-next-line no-console
  console.log("We recommend setting up 2 profiles because:");
  // eslint-disable-next-line no-console
  console.log(
    "- You publish more posts per month from the same automation run (2 posts instead of 1)."
  );
  // eslint-disable-next-line no-console
  console.log(
    "- You can serve different audiences or funnels with the same blog (e.g. beginners vs advanced, local vs national)."
  );
  // eslint-disable-next-line no-console
  console.log(
    "- You send more varied signals to search engines over time (more topics, more internal links)."
  );
  // eslint-disable-next-line no-console
  console.log("");

  const defaultCount =
    existingProfiles && existingProfiles.length >= 2 ? 2 : 2;

  const { profileCount } = await inquirer.prompt([
    {
      name: "profileCount",
      type: "list",
      message: "How many content profiles do you want to configure now?",
      default: defaultCount === 2 ? "2" : "1",
      choices: [
        { name: "2 profiles (recommended)", value: "2" },
        { name: "1 profile", value: "1" }
      ]
    }
  ]);

  const count = profileCount === "2" ? 2 : 1;

  const profiles = [];

  for (let i = 0; i < count; i += 1) {
    const existing = existingProfiles && existingProfiles[i];

    // Simple defaults if nothing exists yet
    const defaultLabel =
      existing?.label ||
      (i === 0 ? "New Agents (example)" : "Current Agents (example)");
    const defaultTag =
      existing?.tag || (i === 0 ? "New Agents" : "Current Agents");
    const defaultBacklink =
      existing?.backlinkUrl ||
      (blogSiteUrl
        ? `${blogSiteUrl.replace(/\/+$/, "")}/${
            i === 0 ? "new-agents" : "current-agents"
          }`
        : "");

    const { label, audienceDescription, intent, tag, backlinkUrl } =
      await inquirer.prompt([
        {
          name: "label",
          type: "input",
          message: `Profile ${i + 1} label (who is this for?)`,
          default: defaultLabel
        },
        {
          name: "audienceDescription",
          type: "input",
          message: "Short audience description:",
          default:
            existing?.audienceDescription ||
            (i === 0
              ? "People considering getting started in this topic."
              : "People already experienced in this topic.")
        },
        {
          name: "intent",
          type: "input",
          message: "Intent for this profile (what should posts achieve?):",
          default:
            existing?.intent ||
            "Educate, build trust, and encourage readers to take the next step."
        },
        {
          name: "tag",
          type: "input",
          message: "Ghost tag to apply for this profile:",
          default: defaultTag
        },
        {
          name: "backlinkUrl",
          type: "input",
          message:
            "Required backlink URL to include in every post for this profile:",
          default: defaultBacklink
        }
      ]);

    const { keywordsInput, topicsInput } = await inquirer.prompt([
      {
        name: "keywordsInput",
        type: "input",
        message:
          "Comma-separated SEO keywords for this profile (e.g. keyword1, keyword2, ...):",
        default: Array.isArray(existing?.keywords)
          ? existing.keywords.join(", ")
          : ""
      },
      {
        name: "topicsInput",
        type: "input",
        message:
          "Optional: comma-separated topic ideas/angles (leave blank to skip):",
        default: Array.isArray(existing?.topicOptions)
          ? existing.topicOptions.join(", ")
          : ""
      }
    ]);

    const keywords =
      keywordsInput
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0) || [];

    const topicOptions =
      topicsInput
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0) || [];

    profiles.push({
      id: existing?.id || (i === 0 ? "new_agent" : "current_agent"),
      label,
      tag,
      backlinkUrl,
      audienceDescription,
      intent,
      keywords,
      topicOptions,
      enabled: existing?.enabled !== false
    });
  }

  const confirm = await inquirer.prompt([
    {
      name: "ok",
      type: "confirm",
      message: "Save these content profiles to content-profiles.json?",
      default: true
    }
  ]);

  if (!confirm.ok) {
    // eslint-disable-next-line no-console
    console.log(
      "Cancelled profile changes. Existing profiles (if any) were left unchanged."
    );
    return null;
  }

  return profiles;
}

async function main() {
  try {
    const newEnv = await collectEnvConfig();

    // Summary
    // eslint-disable-next-line no-console
    console.log("");
    // eslint-disable-next-line no-console
    console.log("--- Summary ---");
    CONFIG_FIELDS.forEach((field) => {
      const value = newEnv[field.key];
      const masked =
        field.key.includes("KEY") && value
          ? `${value.slice(0, 4)}…${value.slice(-4)}`
          : value || "";
      // eslint-disable-next-line no-console
      console.log(`${field.key}: ${masked}`);
    });

    const { action } = await inquirer.prompt([
      {
        name: "action",
        type: "list",
        message: "What would you like to do next?",
        choices: [
          {
            name: "Run connectivity tests and then save .env",
            value: "test_and_save"
          },
          {
            name: "Save .env without running tests",
            value: "save_only"
          },
          {
            name: "Cancel setup without saving",
            value: "cancel"
          }
        ]
      }
    ]);

    if (action === "cancel") {
      // eslint-disable-next-line no-console
      console.log("Setup cancelled. .env was not changed.");
      process.exit(0);
    }

    let testsOk = true;
    if (action === "test_and_save") {
      testsOk = await runHealthChecks(newEnv);

      if (!testsOk) {
        const { proceed } = await inquirer.prompt([
          {
            name: "proceed",
            type: "confirm",
            message:
              "Tests did not fully succeed. Save configuration anyway?",
            default: false
          }
        ]);
        if (!proceed) {
          // eslint-disable-next-line no-console
          console.log("Aborting without saving .env.");
          process.exit(1);
        }
      }
    }

    saveEnvAtomic(newEnv);
    // eslint-disable-next-line no-console
    console.log("");
    // eslint-disable-next-line no-console
    console.log(".env saved successfully.");

    // Profiles step
    const existingProfiles = loadExistingProfiles();
    const blogSiteUrl = newEnv.BLOG_SITE_URL || "";

    const profiles = await promptForProfiles(
      existingProfiles,
      blogSiteUrl
    );

    if (profiles) {
      atomicWriteProfiles(profiles);
      // eslint-disable-next-line no-console
      console.log(
        `Content profiles saved to ${profilesFile}. ghostAutoPublish will generate one post per enabled profile per run.`
      );
    }

    // eslint-disable-next-line no-console
    console.log("");
    // eslint-disable-next-line no-console
    console.log("Setup complete. You can now run 'npm start'.");
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "Setup wizard failed:",
      err && err.message ? err.message : err
    );
    process.exit(1);
  }
}

main();
