# Technical Plan: Main Admin Home UI (`mainUITechSpec.md`)

## 1. Summary

- Introduce a **unified Admin Home UI** for ghostAutoPublish, implemented in `src/admin-ui.js` and launched via `npm run admin`.
- The home UI:
  - Detects configuration health: **missing**, **invalid**, or **healthy**.
  - For **first‑time users** (no `.env`): shows a **minimal “setup‑first” home screen** that strongly guides them into the setup wizard.
  - For **returning users**: shows a **full admin home** that clearly separates:
    - Full setup / reconfiguration (setup wizard),
    - Ongoing config & health checks (Admin Config UI),
    - Schedule/cron management (Scheduler UI).
- This spec orchestrates existing feature modules defined in:
  - `uiTechnicalSpec.md` – Setup wizard (`src/setup.js`, `npm run setup`).
  - `adminUI-updates-technicalSpec.md` – Admin Config UI (`src/admin-ui.js`, config editing).
  - `cronSetupTechnicalSpec.md` – Schedule/Cron UI (`src/scheduler*.js`).

`mainUITechSpec.md` defines the **top‑level admin UX and control flow**; the referenced specs define underlying modules.

---

## 2. Entry Points and Responsibilities

### 2.1 `package.json` Scripts

Ensure the following scripts exist in `package.json`:

```jsonc
"scripts": {
  "start": "node src/index.js",
  "test:gemini": "node src/test-gemini.js",
  "setup": "node src/setup.js",      // setup wizard (uiTechnicalSpec.md)
  "admin": "node src/admin-ui.js"    // unified Admin Home UI (this spec)
}
```

Behavior:

- `npm run admin` → unified Admin Home UI (main entry for all admin flows).
- `npm run setup` → setup wizard only (direct shortcut; bypasses home).

### 2.2 Module Responsibilities

- `src/setup.js`
  - Implements interactive setup wizard (per `uiTechnicalSpec.md`).
  - Exposes a callable API for use by the Admin Home:

    ```ts
    export type SetupOutcome = "completed" | "cancelled" | "failed";

    export interface SetupResult {
      outcome: SetupOutcome;
      errorMessage?: string;
    }

    export async function runSetupWizardInteractive(
      options?: { invokedFromAdmin?: boolean }
    ): Promise<SetupResult>;
    ```

- `src/admin-ui.js`
  - Implements the **Admin Home UI** (this spec).
  - Responsibilities:
    - Detect configuration and schedule status.
    - Render appropriate home screen variant (first‑time / invalid config / healthy).
    - Route to:
      - Setup wizard (`runSetupWizardInteractive`),
      - Config submenu (Admin Config UI),
      - Schedule submenu (Scheduler UI),
      - Help/docs view.

- `src/envFile.js`, `src/config.js`, `src/configSchema.js`, `src/healthChecks.js`
  - As defined in `adminUI-updates-technicalSpec.md` and `uiTechnicalSpec.md`.
  - Provide configuration loading, `.env` I/O, schema validation, and Gemini/Ghost health checks.

- `src/scheduler.js`, `src/scheduler-unix.js`, `src/scheduler-windows.js`
  - As defined in `cronSetupTechnicalSpec.md`.
  - Provide schedule status detection and schedule management APIs.

---

## 3. State Detection Contracts

### 3.1 Configuration Status

Add a helper (either in `src/config.js` or a new `src/adminState.js`) to compute config health for the home UI.

**Types:**

```ts
export type ConfigHealth = "missingEnv" | "invalidEnv" | "healthy";

export interface ConfigStatus {
  health: ConfigHealth;
  envExists: boolean;
  validationErrors: string[]; // user-facing errors (empty when healthy)
  summary?: {
    blogSiteUrl?: string;
    ghostAdminApiUrl?: string;
    geminiModel?: string;
  };
}
```

**Behavior:**

- Use `loadEnvFromFile()` from `src/envFile.js`:
  - If `.env` does not exist:
    - `envExists = false`
    - `health = "missingEnv"`
    - `validationErrors = []`
    - `summary = undefined`

- If `.env` exists:
  - Attempt to construct runtime config using `loadConfig()` in combination with `configSchema`:
    - On success:
      - `envExists = true`
      - `health = "healthy"`
      - `validationErrors = []`
      - `summary` populated from config (e.g. `BLOG_SITE_URL`, `GHOST_ADMIN_API_URL`, `GEMINI_MODEL`).
    - On failure (throw or schema errors):
      - `envExists = true`
      - `health = "invalidEnv"`
      - `validationErrors` populated with user‑friendly messages, e.g.:
        - “Missing required env: GHOST_ADMIN_API_URL”
        - “Invalid URL for BLOG_SITE_URL”

### 3.2 Schedule Status

Extend the scheduler facade (per `cronSetupTechnicalSpec.md`) with a home‑friendly status API.

**Types:**

```ts
export type ScheduleTypeUI =
  | "disabled"
  | "daily"
  | "intervalHours"
  | "intervalMinutes"
  | "customUnixCron"
  | "unsupportedPlatform";

export interface ScheduleStatus {
  platformLabel: string;   // e.g. "macOS (user crontab)", "Windows (Task Scheduler)"
  type: ScheduleTypeUI;
  description: string;     // human-readable, e.g. "Disabled", "Daily at 06:30"
  commandSummary?: string; // wrapper script path only, no secrets
  isForThisClone: boolean; // true if job points to this repo root
  errorMessage?: string;   // optional, if detection failed
}
```

**API:**

```ts
export async function getScheduleStatus(): Promise<ScheduleStatus>;
```

Implementation:

- Delegate to platform‑specific helpers from `cronSetupTechnicalSpec.md`.
- Map detected cron/task configuration to `type` and human‑readable `description`.
- Set `isForThisClone` by comparing job path to `process.cwd()`.
- On detection failure, return:

  - `type = "disabled"` or `"unsupportedPlatform"`
  - `description = "Error checking schedule"`
  - `errorMessage` with a short explanation.

### 3.3 Setup Result

`src/setup.js` must implement `SetupResult` as in Section 2.2 and:

- `outcome = "completed"` when `.env` is successfully written and validated.
- `outcome = "cancelled"` when user explicitly cancels before saving.
- `outcome = "failed"` when an unexpected error occurs, with `errorMessage` populated.

---

## 4. Home Screen UX and Flows

`src/admin-ui.js` presents one of three **home variants** based on `ConfigStatus.health`.

On each `npm run admin`:

1. Compute state:

   ```ts
   const configStatus = await getConfigStatus();
   const scheduleStatus = await getScheduleStatus();
   ```

2. Render common header (using `inquirer` or similar):

   - Title: `ghostAutoPublish Admin Home`.
   - Status summary:
     - `Setup: Missing / Invalid / Ready`
     - `Blog: <BLOG_SITE_URL>` (when known)
     - `Schedule: <ScheduleStatus.description>` (e.g. `Disabled`, `Daily at 06:30`, `Every 4 hours`)

3. Render a state‑specific menu (Sections 4.2–4.4).
4. Loop until the user chooses `Exit`.

All menus use `inquirer` list/confirm prompts.

### 4.1 Common Layout Elements

- Header:
  - `ghostAutoPublish Admin Home`
- Status panel:
  - `Setup: <health>`
  - `Blog: <summary.blogSiteUrl or “Unknown”>`
  - `Schedule: <scheduleStatus.description>`
- Navigation hints:
  - Include brief usage hints in prompt messages (e.g. “Use arrow keys to navigate, Enter to select”).

### 4.2 Case A – First‑Time User (No `.env`)

Condition: `configStatus.health === "missingEnv"`.

**Banner:**

- “No configuration file (`.env`) found. ghostAutoPublish is not set up yet.”

**Menu options:**

1. `Run guided setup now (recommended)`
   - Action:
     - Call `runSetupWizardInteractive({ invokedFromAdmin: true })`.
     - After return:
       - Recompute `configStatus` and `scheduleStatus`.
       - Show a short message based on `SetupResult`:
         - `completed`: “Setup completed successfully.”
         - `cancelled`: “Setup cancelled; configuration may still be missing.”
         - `failed`: “Setup failed: <errorMessage> (see logs).”
       - Redisplay the home screen (now Case C if setup succeeded).

2. `View setup prerequisites & instructions`
   - Action:
     - Show static content describing:
       - Required values: Gemini API key, Ghost Admin API key, blog URL.
       - High‑level directions on where to get them.
       - How to run setup: `npm run setup` or `npm run admin` → “Run guided setup now”.
     - After viewing, return to the same home variant.

3. `Advanced: open Config & health tools without setup`
   - Action:
     - Enter Config submenu (Section 5.1).
     - On entry, Config UI must display a strong warning:
       - “No `.env` exists. These tools can create configuration, but the guided setup wizard is recommended for most users.”

4. `Exit`
   - Exit process with code `0`.

**Schedule behavior in this state:**

- Schedule options are not shown as selectable menu items.
- Optional non‑interactive line below status:
  - “Schedule/cron: Available after initial setup is complete.”

### 4.3 Case B – Invalid Config (`.env` present but invalid)

Condition: `configStatus.health === "invalidEnv"`.

**Banner:**

- Prominent warning at top:

  - “Configuration found but invalid. Some required settings are missing or malformed. ghostAutoPublish may not run correctly until this is fixed.”

- Show first 1–3 `validationErrors` entries with truncation if necessary, plus:
  - “See Config & health checks for full details.”

**Menu options:**

1. `Fix configuration now (Config & health checks)`
   - Primary action.
   - Action:
     - Enter Config submenu (Section 5.1).

2. `Re-run full setup wizard`
   - Action:
     - Call `runSetupWizardInteractive({ invokedFromAdmin: true })`.
     - Refresh state and display a message as in Case A (completed/cancelled/failed).
     - Return to home.

3. `Manage schedule / automation`
   - Action:
     - Before entering Schedule submenu, show a warning prompt:
       - “Current configuration is invalid. Scheduling runs with broken configuration is not recommended.”
       - Choices:
         - `Go to Config & health checks`
         - `Proceed to schedule anyway (advanced)`
         - `Back to home`
     - If the user proceeds, enter Schedule submenu (Section 5.2) with the warning banner preserved.

4. `View current configuration summary`
   - Action:
     - Reuse “View current configuration” view from `adminUI-updates-technicalSpec.md`:
       - Show non‑secret fields plainly.
       - Mask secrets (partial key preview).
       - Highlight fields that fail validation.
     - Return to home afterwards.

5. `Exit`
   - Exit process with code `0`.

### 4.4 Case C – Healthy Config (Setup Complete, Returning User)

Condition: `configStatus.health === "healthy"`.

**Status panel:**

- `Setup: Ready`
- `Blog: <BLOG_SITE_URL>`
- `Schedule: <scheduleStatus.description>`

**Menu options:**

1. `Setup / full reconfiguration (wizard)`
   - Label description:
     - “Re-run full setup wizard; may overwrite `.env` after confirmation.”
   - Action:
     - Call `runSetupWizardInteractive({ invokedFromAdmin: true })`.
     - Refresh state and display a short outcome message.
     - Return to home.

2. `Config & health checks`
   - Action:
     - Enter Config submenu (Section 5.1).

3. `Manage schedule / automation`
   - Action:
     - Enter Schedule submenu (Section 5.2).

4. `Help, docs, & instructions`
   - Action:
     - Show:
       - Path to the latest generated setup instructions Markdown file (if present), e.g.:
         - `docs/setup-instructions-<sanitized-host>.md`
       - Runtime instructions:
         - `npm start` to run publisher.
         - Logs paths: `logs/publish-log.md`, `logs/cron.log`.
       - Reminder that `.env` must stay out of version control.
     - Return to home afterwards.

5. `Exit`
   - Exit process with code `0`.

---

## 5. Submenus

### 5.1 Config & Health Checks Submenu (Admin Config UI)

The Config submenu nests the Admin Config UI defined in `adminUI-updates-technicalSpec.md` under the home screen.

**Signature:**

```ts
async function runConfigSubmenu(configStatus: ConfigStatus): Promise<void>;
```

**Menu:**

1. `View current configuration`
2. `Edit Gemini settings`
3. `Edit Ghost settings`
4. `Edit backlink URLs`
5. `Run connectivity tests`
6. `Manage .env backups` (if implemented)
7. `Back to home`

**Behavior:**

- If `configStatus.health === "missingEnv"`:
  - Show banner:
    - “No `.env` exists. These tools can create configuration, but the guided setup wizard is recommended for most users.”
- If `configStatus.health === "invalidEnv"`:
  - Emphasize invalid fields in `View current configuration` and when editing.
  - Prevent saving invalid values via `configSchema` validators.
- All prompts, `.env` reading/writing and backup behavior follow `adminUI-updates-technicalSpec.md`.
- On selecting `Back to home`, return to caller; the main loop will recompute `ConfigStatus` and `ScheduleStatus`.

### 5.2 Schedule / Automation Submenu (Scheduler UI)

The Schedule submenu implements the Schedule/Cron UI defined in `cronSetupTechnicalSpec.md`, under the home screen.

**Signature:**

```ts
async function runScheduleSubmenu(configStatus: ConfigStatus): Promise<void>;
```

**Banner:**

- If `configStatus.health !== "healthy"`:
  - Show at top:
    - “Warning: configuration is missing/invalid. Scheduled runs may fail. Fix configuration first if possible.”

**Menu:**

1. `View current schedule`
2. `Enable or change schedule`
3. `Disable schedule (remove job)`
4. `Show platform-specific details / debug`
5. `Back to home`

**Behavior:**

- All underlying operations (platform detection, wrapper scripts, cron/task mapping) follow `cronSetupTechnicalSpec.md`.
- After enabling/changing/disabling a schedule:
  - Recompute `ScheduleStatus`.
  - Show a short success/failure message (e.g. “Schedule set to: Daily at 06:30”).
- On `Back to home`, return to the main loop; the home status line will reflect updated schedule state.

---

## 6. Control Flow and Error Handling

### 6.1 Main Loop Structure (`src/admin-ui.js`)

Pseudocode for main control loop:

```ts
import inquirer from "inquirer";
import { getConfigStatus } from "./adminState.js"; // or config.js
import { getScheduleStatus } from "./scheduler.js";
import { runSetupWizardInteractive } from "./setup.js";
import { runConfigSubmenu } from "./admin-config-ui.js";   // abstraction over existing admin menu
import { runScheduleSubmenu } from "./scheduler-ui.js";    // abstraction over schedule menu

async function main() {
  for (;;) {
    const configStatus = await getConfigStatus();
    const scheduleStatus = await getScheduleStatus();

    const homeChoice = await promptHomeMenu(configStatus, scheduleStatus);

    if (homeChoice === "exit") {
      break;
    }

    if (homeChoice === "setup") {
      const result = await runSetupWizardInteractive({ invokedFromAdmin: true });
      // Map result.outcome to a short message
      continue;
    }

    if (homeChoice === "config") {
      await runConfigSubmenu(configStatus);
      continue;
    }

    if (homeChoice === "schedule") {
      await runScheduleSubmenu(configStatus);
      continue;
    }

    if (homeChoice === "help") {
      await showHelpView();
      continue;
    }

    // Unknown choice: loop again
  }

  process.exit(0);
}

main().catch(err => {
  console.error("Admin UI encountered an unexpected error:", err);
  process.exit(1);
});
```

### 6.2 Error Handling

- **Config detection errors (`getConfigStatus`)**
  - Wrap `loadEnvFromFile()`/`loadConfig()` in try/catch.
  - On unexpected exceptions:
    - Treat as:

      ```ts
      health = "invalidEnv";
      envExists = true;
      validationErrors = [`Unexpected error loading configuration: ${shortMessage}`];
      ```

- **Schedule detection errors (`getScheduleStatus`)**
  - Wrap platform detection and querying in try/catch.
  - On failure:
    - Return:

      ```ts
      {
        platformLabel: "<platform>",
        type: "disabled",
        description: "Error checking schedule",
        isForThisClone: false,
        errorMessage: shortMessage
      }
      ```

- **Setup wizard errors**
  - `runSetupWizardInteractive`:
    - Returns `SetupResult` with `outcome = "failed"` and `errorMessage`.
    - Admin Home prints a one‑line error and leaves `ConfigStatus` unchanged until next iteration.

- **Prompt or TTY issues**
  - If `inquirer` throws due to missing TTY:
    - Print:
      - “Interactive admin UI requires a terminal. You can run `npm run setup` directly to configure.”
    - Exit with non‑zero code (e.g. `1`).

---

## 7. Test Plan

### 7.1 First-Time User Flow (No `.env`)

1. Ensure `.env` is absent (rename or delete existing file).
2. Run `npm run admin`.
3. Verify:
   - Status shows `Setup: Missing`.
   - “Setup required” banner is displayed.
   - Menu options:
     - `Run guided setup now (recommended)`
     - `View setup prerequisites & instructions`
     - `Advanced: open Config & health tools without setup`
     - `Exit`
   - No interactive schedule option is present.
4. Select `Run guided setup now`:
   - Complete setup wizard successfully.
   - On return to home:
     - `Setup: Ready`
     - `Blog: <BLOG_SITE_URL>` from `.env`
     - Full returning‑user menu is visible.
5. Run `npm run admin` again:
   - Confirm state persists as healthy.

### 7.2 Invalid Config Flow

1. Create `.env` with missing/invalid required fields (e.g. bad `GHOST_ADMIN_API_URL` format).
2. Run `npm run admin`.
3. Verify:
   - `Setup: Invalid`.
   - Warning banner with at least one descriptive validation error.
   - Menu options:
     - `Fix configuration now (Config & health checks)`
     - `Re-run full setup wizard`
     - `Manage schedule / automation`
     - `View current configuration summary`
     - `Exit`
4. Choose `Fix configuration now`:
   - Confirm Config submenu:
     - Highlights invalid fields.
     - Prevents saving invalid updates.
5. Choose `Manage schedule / automation`:
   - Confirm warning dialog about invalid config.
   - Confirm you can still proceed to schedule submenu if you choose the advanced option.

### 7.3 Healthy Config Flow (Returning User)

1. Ensure `.env` is valid and `loadConfig()` succeeds.
2. Run `npm run admin`.
3. Verify:
   - `Setup: Ready`.
   - Correct blog and schedule summary.
   - Menu options:
     - `Setup / full reconfiguration (wizard)`
     - `Config & health checks`
     - `Manage schedule / automation`
     - `Help, docs, & instructions`
     - `Exit`
4. In Config submenu:
   - Edit a non‑secret value (e.g. `GEMINI_MODEL`).
   - Confirm:
     - `.env` updated.
     - `.env.backup-*` created.
   - Return to home and verify summary reflects changes.
5. In Schedule submenu:
   - Enable a daily schedule.
   - Verify:
     - `getScheduleStatus().description` reports “Daily at HH:MM”.
     - Home status line shows the same.
   - Disable schedule and confirm status shows “Disabled”.

### 7.4 Integration with Direct `npm run setup`

1. From any state, run `npm run setup` directly.
2. Complete setup wizard.
3. Run `npm run admin`.
4. Verify:
   - Admin Home reflects newly created configuration as “Ready”.
   - Blog and schedule summaries match `.env` and scheduler state.

### 7.5 Robustness and Edge Cases

- Remove or break `crontab` / `schtasks` (per OS) and run `npm run admin`:
  - Confirm:
    - Admin Home still loads.
    - Schedule status description indicates an error.
- Modify `.env` externally while Admin UI is running:
  - Confirm that the next home loop iteration recomputes `ConfigStatus` and handles errors gracefully.
- Run `npm run admin` in non‑interactive/CI environment:
  - Confirm:
    - Process prints a short non‑interactive error message.
    - Exits with non‑zero status.

---

## 8. Assumptions

- `uiTechnicalSpec.md`, `adminUI-updates-technicalSpec.md`, and `cronSetupTechnicalSpec.md` are implemented or will be implemented as written, providing:
  - Setup wizard (`src/setup.js`),
  - Env I/O & admin config tools (`src/envFile.js`, `src/config.js`, `src/configSchema.js`, `src/healthChecks.js`, and supporting Admin UI),
  - Scheduler facade (`src/scheduler*.js` and wrapper scripts).
- Node.js ≥ 18 is available, with a compatible prompt library (e.g. `inquirer`) installed.
- `.env` remains the **sole source of truth** for runtime configuration:
  - No secrets appear in scheduled commands or wrapper scripts.
  - `.env` is ignored by version control.
- All admin interactions remain CLI/terminal‑based; no GUI or browser UI is required in this iteration.

This `mainUITechSpec.md` serves as the orchestration layer specification for the admin UX, ensuring that first‑time and returning users are guided through setup, configuration, and scheduling in a clear, unified flow.

