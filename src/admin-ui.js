import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvFromFile, saveEnvAtomic, listEnvBackups } from "./envFile.js";
import { CONFIG_FIELDS } from "./configSchema.js";
import { testGemini, testGhost } from "./healthChecks.js";
import { loadConfig } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const profilesFile = path.join(projectRoot, "content-profiles.json");

function loadProfiles() {
  try {
    if (!fs.existsSync(profilesFile)) {
      return [];
    }
    const raw = fs.readFileSync(profilesFile, "utf8");
    if (!raw.trim()) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function atomicWriteProfiles(profiles) {
  const payload = JSON.stringify(profiles, null, 2);
  const tmp = `${profilesFile}.new`;
  fs.writeFileSync(tmp, payload, "utf8");
  fs.renameSync(tmp, profilesFile);
}

async function editProfile(profile, index) {
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log(`Editing Profile ${index + 1} (${profile.id || "unnamed"})`);

  const { label, audienceDescription, intent, tag, backlinkUrl } =
    await inquirer.prompt([
      {
        name: "label",
        type: "input",
        message: "Profile label:",
        default: profile.label || `Profile ${index + 1}`
      },
      {
        name: "audienceDescription",
        type: "input",
        message: "Short audience description:",
        default:
          profile.audienceDescription ||
          "Describe who this content is for."
      },
      {
        name: "intent",
        type: "input",
        message: "Intent (what should posts achieve?):",
        default:
          profile.intent ||
          "Educate, build trust, and encourage readers to take the next step."
      },
      {
        name: "tag",
        type: "input",
        message: "Ghost tag to apply:",
        default: profile.tag || ""
      },
      {
        name: "backlinkUrl",
        type: "input",
        message: "Required backlink URL to include in posts:",
        default: profile.backlinkUrl || ""
      }
    ]);

  const { keywordsInput, topicsInput, enabled } = await inquirer.prompt([
    {
      name: "keywordsInput",
      type: "input",
      message:
        "Comma-separated SEO keywords (e.g. keyword1, keyword2, ...):",
      default: Array.isArray(profile.keywords)
        ? profile.keywords.join(", ")
        : ""
    },
    {
      name: "topicsInput",
      type: "input",
      message:
        "Optional: comma-separated topic ideas/angles (leave blank to skip):",
      default: Array.isArray(profile.topicOptions)
        ? profile.topicOptions.join(", ")
        : ""
    },
    {
      name: "enabled",
      type: "confirm",
      message: "Enable this profile?",
      default: profile.enabled !== false
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

  return {
    ...profile,
    id: profile.id || (index === 0 ? "new_agent" : "current_agent"),
    label,
    audienceDescription,
    intent,
    tag,
    backlinkUrl,
    keywords,
    topicOptions,
    enabled
  };
}

async function manageContentProfiles() {
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("Content profiles control who each post is for, and");
  // eslint-disable-next-line no-console
  console.log("how many posts per run are published.");
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("Tip: Using two content profiles is recommended:");
  // eslint-disable-next-line no-console
  console.log("- You get twice the posts per run (and per month).");
  // eslint-disable-next-line no-console
  console.log(
    "- You can target multiple segments from the same blog (e.g., beginners and experts)."
  );
  // eslint-disable-next-line no-console
  console.log(
    "- You send more varied, SEO-friendly signals via different keywords and internal links."
  );
  // eslint-disable-next-line no-console
  console.log("");

  let profiles = loadProfiles();
  if (profiles.length === 0) {
    profiles = [
      {
        id: "new_agent",
        label: "New Agents (example)",
        enabled: true
      }
    ];
  }

  // Limit to at most 2 profiles in UI as well
  profiles = profiles.slice(0, 2);

  const menuChoices = [];
  profiles.forEach((p, idx) => {
    menuChoices.push({
      name: `Edit Profile ${idx + 1} – ${p.label || p.id || "unnamed"}`,
      value: `edit_${idx}`
    });
  });
  if (profiles.length < 2) {
    menuChoices.push({
      name: "Add second profile (recommended)",
      value: "add_second"
    });
  }
  menuChoices.push({ name: "Save and return", value: "save" });
  menuChoices.push({ name: "Cancel (discard changes)", value: "cancel" });

  let done = false;
  while (!done) {
    const { action } = await inquirer.prompt([
      {
        name: "action",
        type: "list",
        message: "Manage Content Profiles",
        choices: menuChoices
      }
    ]);

    if (action === "cancel") {
      // eslint-disable-next-line no-console
      console.log("Cancelled. No changes were saved.");
      return;
    }

    if (action === "save") {
      const enabledCount = profiles.filter((p) => p.enabled !== false).length;
      if (enabledCount === 0) {
        // eslint-disable-next-line no-console
        console.log(
          "At least one profile must be enabled; otherwise no posts will be generated."
        );
        // Loop again without saving
        // eslint-disable-next-line no-continue
        continue;
      }
      if (enabledCount > 2) {
        // Just in case future extensions add more
        // eslint-disable-next-line no-console
        console.log(
          "Only up to two profiles can be enabled per run. Disable extras before saving."
        );
        // eslint-disable-next-line no-continue
        continue;
      }

      atomicWriteProfiles(profiles);
      // eslint-disable-next-line no-console
      console.log(
        `Content profiles saved to ${profilesFile}. ghostAutoPublish will publish one post per enabled profile each run.`
      );
      done = true;
      continue;
    }

    if (action === "add_second") {
      const newProfile = await editProfile(
        {
          id: "current_agent",
          label: "Current Agents (example)",
          enabled: true
        },
        profiles.length
      );
      profiles.push(newProfile);
      // Update menu choices after adding
      return manageContentProfiles();
    }

    if (action.startsWith("edit_")) {
      const idx = parseInt(action.split("_")[1], 10);
      const updated = await editProfile(profiles[idx], idx);
      profiles[idx] = updated;
    }
  }
}

async function editEnvGroup(groupName) {
  const { envObject } = loadEnvFromFile();
  const fields = CONFIG_FIELDS.filter((f) => f.group === groupName);

  const answers = await inquirer.prompt(
    fields.map((field) => ({
      name: field.key,
      type: field.key.includes("KEY") ? "password" : "input",
      message: `${field.label}:`,
      default: envObject[field.key] || "",
      mask: field.key.includes("KEY") ? "*" : undefined,
      validate: (value) => {
        if (!field.required && !value) return true;
        const result = field.validate(value);
        return result === true || typeof result === "undefined"
          ? true
          : result;
      }
    }))
  );

  const newEnv = { ...envObject, ...answers };
  saveEnvAtomic(newEnv);
  // eslint-disable-next-line no-console
  console.log(".env updated successfully.");
}

async function runConnectivityTests() {
  try {
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
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "Failed to run connectivity tests:",
      err && err.message ? err.message : err
    );
  }
}

async function manageEnvBackups() {
  const backups = listEnvBackups();
  if (!backups.length) {
    // eslint-disable-next-line no-console
    console.log("No .env backups found.");
    return;
  }

  const { choice } = await inquirer.prompt([
    {
      name: "choice",
      type: "list",
      message: "Select a backup to restore:",
      choices: backups.map((b) => ({
        name: b.name,
        value: b.path
      }))
    }
  ]);

  const targetPath = choice;
  const envPath = path.join(projectRoot, ".env");
  const tmp = `${envPath}.restore`;

  try {
    fs.copyFileSync(targetPath, tmp);
    fs.renameSync(tmp, envPath);
    // eslint-disable-next-line no-console
    console.log(`Restored ${targetPath} to .env`);
  } catch (err) {
    if (fs.existsSync(tmp)) {
      fs.unlinkSync(tmp);
    }
    // eslint-disable-next-line no-console
    console.error(
      "Failed to restore backup:",
      err && err.message ? err.message : err
    );
  }
}

async function main() {
  try {
    let exit = false;
    while (!exit) {
      const { choice } = await inquirer.prompt([
        {
          name: "choice",
          type: "list",
          message: "Admin Home",
          choices: [
            {
              name: "Manage Content Profiles (recommended)",
              value: "profiles"
            },
            {
              name: "Edit Gemini settings",
              value: "gemini"
            },
            {
              name: "Edit Ghost settings",
              value: "ghost"
            },
            {
              name: "Edit backlink URLs (legacy defaults)",
              value: "backlinks"
            },
            {
              name: "Run connectivity tests (Gemini + Ghost)",
              value: "tests"
            },
            {
              name: "Manage .env backups",
              value: "backups"
            },
            { name: "Exit", value: "exit" }
          ]
        }
      ]);

      if (choice === "profiles") {
        await manageContentProfiles();
      } else if (choice === "gemini") {
        await editEnvGroup("Gemini");
      } else if (choice === "ghost") {
        await editEnvGroup("Ghost");
      } else if (choice === "backlinks") {
        await editEnvGroup("Backlinks");
      } else if (choice === "tests") {
        await runConnectivityTests();
      } else if (choice === "backups") {
        await manageEnvBackups();
      } else if (choice === "exit") {
        exit = true;
      }
    }

    // eslint-disable-next-line no-console
    console.log("Exiting admin UI.");
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "Admin UI failed:",
      err && err.message ? err.message : err
    );
    process.exit(1);
  }
}

main();

