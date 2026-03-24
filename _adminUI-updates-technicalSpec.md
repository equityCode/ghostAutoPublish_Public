Create `adminUI-updates-technicalSpec.md` with the following contents:

```markdown
# Technical Plan: Admin Config CLI for ghostAutoPublish

## Summary

- Add a new interactive CLI “Admin Config UI” (`npm run admin`) dedicated to viewing and editing configuration and content profiles, separate from the setup wizard described in `uiTechnicalSpec.md`.
- The admin UI operates purely in the terminal (using `inquirer`), works against the same `.env` file as the runtime and setup wizard, and can run Gemini/Ghost connectivity tests.
- Shared helpers centralize `.env` read/write (with backups) and health checks so both the setup wizard and admin UI reuse the same behavior.

---

## Implementation Changes

### 1. Prerequisite: Config alignment (blog‑agnostic)

- Update `src/config.js` so it:
  - Relies solely on `.env` for blog‑specific values (no lifeagent defaults), matching the spec in `uiTechnicalSpec.md`.
  - Keeps `requireEnv` semantics (throw on missing required vars) for:
    - `GEMINI_API_KEY`
    - `GEMINI_MODEL`
    - `GHOST_ADMIN_API_KEY`
    - `GHOST_ADMIN_API_URL`
    - `BLOG_SITE_URL`
    - `NEW_AGENT_BACKLINK_URL`
    - `CURRENT_AGENT_BACKLINK_URL`
  - Continues to derive:
    - `GEMINI_REFORMAT_MODEL` from `GEMINI_MODEL` when not explicitly set.
    - `GEMINI_REFORMAT_API_KEY` from `GEMINI_API_KEY` when not explicitly set.
- Treat `loadConfig()` as the shared truth that runtime, setup wizard, tests, and the new admin UI all consume.

### 2. Shared helpers: env file I/O and schema

- Add `src/envFile.js` that exposes:
  - `loadEnvFromFile()`:
    - Reads `.env` from the project root.
    - Parses it into a plain `{ [key: string]: string }` object.
    - Returns something like `{ envObject, exists }`.
  - `saveEnvAtomic(newEnvObject, options)`:
    - Constructs full `.env` content from `newEnvObject`.
    - If `.env` exists, copies it to `.env.backup-YYYYMMDD-HHMMSS` in the project root.
    - Writes new content to `.env.new`, then renames `.env.new` → `.env`.
    - On any write/rename error:
      - Restores previous `.env` from backup (if there was one).
      - Deletes `.env.new` if it exists.
      - Returns/throws a clear error.
  - `listEnvBackups()`:
    - Lists `.env.backup-*` files with their timestamps for potential restore operations.
- Add `src/configSchema.js` defining the editable configuration schema:
  - Per‑field metadata:
    - `key` (env var name)
    - `label` (human‑readable name)
    - `description`
    - `group` (e.g., `"Gemini"`, `"Ghost"`, `"Backlinks"`)
    - `required` flag
    - Local `validate(value)` function (e.g., URL validation, `KEY_ID:SECRET` for `GHOST_ADMIN_API_KEY`).
  - Fields to cover:
    - Gemini:
      - `GEMINI_API_KEY`
      - `GEMINI_MODEL`
      - `GEMINI_REFORMAT_API_KEY` (optional)
      - `GEMINI_REFORMAT_MODEL` (optional)
    - Ghost:
      - `GHOST_ADMIN_API_KEY`
      - `GHOST_ADMIN_API_URL`
      - `BLOG_SITE_URL`
    - Backlinks:
      - `NEW_AGENT_BACKLINK_URL`
      - `CURRENT_AGENT_BACKLINK_URL`
  - This schema is shared between the setup wizard and admin UI so prompts and validation stay consistent.

### 3. Shared helpers: health checks (Gemini & Ghost)

- Add `src/healthChecks.js` that exports non‑terminating test functions:

  - `async testGemini(config)`:
    - Uses existing Gemini client (`callGemini` or a dedicated test wrapper) with `config.GEMINI_API_KEY` / `config.GEMINI_MODEL`.
    - Sends a lightweight test prompt (e.g., “Return a tiny JSON object with keys title/html”).
    - Returns an object like:
      - `{ ok: true, message: "Gemini test succeeded", details: {...} }` or
      - `{ ok: false, message: "Reason", details: {...} }`.
    - Does not call `process.exit`; callers decide how to handle failures.

  - `async testGhost(config)`:
    - Uses `createGhostJwt(config)` to generate a JWT.
    - Calls a read‑only Ghost Admin endpoint, e.g.:
      - `GET ${config.GHOST_ADMIN_API_URL}/site/` or
      - `GET ${config.GHOST_ADMIN_API_URL}/posts/?limit=1`.
    - Interprets responses:
      - 2xx → `ok: true` with a short success message.
      - 401/403 → `ok: false`, message suggesting auth/URL mismatch.
      - 404 → `ok: false`, message suggesting wrong Admin API URL (e.g., missing `/ghost/api/admin`).
      - Network/DNS → `ok: false`, message pointing to connectivity issues.
    - Returns `{ ok, message, details }` without exiting.

- Refactor `src/test-gemini.js` (and future setup wizard implementation) to import and use `testGemini()` instead of duplicating logic or exiting directly.

### 4. New entrypoint and npm script for Admin UI

- Add a new file `src/admin-ui.js` as the main entrypoint for the admin config CLI.
- Update `package.json`:
  - Add dependency on `inquirer` (or similar prompt library):
    - `"inquirer": "^<appropriate-version>"`
  - Add script:
    - `"admin": "node src/admin-ui.js"`
- Ensure HTTP client availability for Ghost tests:
  - If the project expects Node ≥ 18, use global `fetch`.
  - Otherwise, add a dependency like `node-fetch` and use it inside `healthChecks.js`.

### 5. Admin CLI structure and UX

#### 5.1 Startup behavior

- On `npm run admin`:
  - Print intro:
    - “ghostAutoPublish Admin Config UI”
    - Short description: this tool is for **viewing and editing configuration only**; it never publishes posts or modifies content.
  - Call `loadEnvFromFile()`:
    - If `.env` does not exist (`exists === false`):
      - Print: “No .env configuration found. Run `npm run setup` to perform initial setup first.”
      - Exit gracefully (code 0 or 1; choice is not critical as long as message is clear).
    - If `.env` exists:
      - Use its values to construct a `config` via `loadConfig()` (or a partial variant).
      - If `loadConfig()` throws, print a clear summary of config issues but still allow entering the admin UI to fix values.

#### 5.2 Main menu

- Use `inquirer` to present a top‑level menu:

  1. `Manage Content Profiles (recommended)`
  2. `Edit Gemini settings`
  3. `Edit Ghost settings`
  4. `Edit backlink URLs`
  5. `Run connectivity tests`
  6. `Manage .env backups` (optional but recommended)
  7. `Exit`

- Loop back to this menu after each action until the user chooses `Exit`.

#### 5.3 Manage content profiles

- This menu option wraps the content-profile management described in the content‑profiles plan:
  - Explains why two profiles are recommended (more posts per run, multiple segments, better SEO diversity).
  - Lets the user:
    - Edit the first and second profiles.
    - Add a second profile if only one exists.
    - Enable/disable profiles (enforcing at least one enabled and at most two enabled).
  - Saves changes atomically to `content-profiles.json`.

#### 5.3 View current configuration

- (Optional) A separate “view only” summary screen may be added later. The current implementation focuses on editing configuration via the Gemini/Ghost/backlink menus and validating via connectivity tests.

#### 5.4 Edit Gemini settings

- Flow:

  1. Load current values from `.env` into a working object.
  2. Prompt user with `inquirer` inputs:
     - `GEMINI_API_KEY` (password/masked input; do not echo current value directly, but allow leaving blank to “keep existing”).
     - `GEMINI_MODEL` (input with default set to current value).
     - Choice: reuse primary key for reformatting vs enter a separate key.
       - If reuse:
         - Either clear `GEMINI_REFORMAT_API_KEY` from `.env` or leave it if we want explicit override removed; define behavior clearly:
           - Recommended: omit `GEMINI_REFORMAT_API_KEY` so it defaults to primary.
       - If separate:
         - Prompt for `GEMINI_REFORMAT_API_KEY` (masked).
     - `GEMINI_REFORMAT_MODEL` (input with default: current or a sensible default such as `gemini-flash-latest`).
  3. Validate each field with `configSchema` validators (e.g., non‑empty, reasonable length).
  4. Show a confirmation summary:
     - Non‑secret fields in clear text.
     - Keys masked.
     - Example: “GEMINI_MODEL: gemini-2.5-flash → gemini-2.5-pro”.
  5. If user confirms:
     - Merge changes into the env object.
     - Call `saveEnvAtomic(updatedEnvObject)`.
     - On success: print success message and return to main menu.
     - On failure: print error, keep env in memory but do not modify `.env`.
  6. If user cancels, discard changes and return to main menu.

#### 5.5 Edit Ghost settings

- Flow similar to Gemini:

  1. Load current `BLOG_SITE_URL`, `GHOST_ADMIN_API_URL`, `GHOST_ADMIN_API_KEY`.
  2. Prompt:
     - `BLOG_SITE_URL` (string input with current default).
     - `GHOST_ADMIN_API_URL` (string input with current default).
     - `GHOST_ADMIN_API_KEY` (masked; allow blank to retain existing).
  3. Validation:
     - URLs:
       - Basic `https?://` regex check.
       - Optional `new URL(value)` try/catch.
     - API key:
       - Must contain a `:` separating `keyId` and `secret`.
  4. Confirmation summary (URLs in full, key masked).
  5. On confirm, merge and call `saveEnvAtomic`; handle success/failure messages.

#### 5.6 Edit backlink URLs

- Prompts:

  - `NEW_AGENT_BACKLINK_URL`
  - `CURRENT_AGENT_BACKLINK_URL`

- Use current `.env` values as defaults.
- Validate as URLs (same logic as Ghost URLs).
- Confirm and save via `saveEnvAtomic`.

#### 5.7 Run connectivity tests

- When the user chooses this option:

  1. Load configuration via `loadConfig()` using the latest `.env`.
  2. Call `testGemini(config)` and `testGhost(config)` in sequence (or parallel if desired).
  3. Display a small dashboard:
     - `Gemini: ✅ <message>` or `Gemini: ❌ <message>`
     - `Ghost: ✅ <message>` or `Ghost: ❌ <message>`
  4. If any test fails:
     - Offer follow‑up options:
       - `Return to main menu to edit values`
       - `Just return to main menu`
     - Do not modify `.env` as part of tests.

#### 5.8 Manage .env backups (optional)

- If implemented:

  1. Use `listEnvBackups()` to find backups (`.env.backup-*`).
  2. If none found, inform user and return to main menu.
  3. If backups exist:
     - Show a list with timestamps and maybe file sizes.
     - Let user select a backup to restore.
  4. On selection:
     - Confirm: “Restore this backup as the current .env?”
     - If confirmed:
       - Copy the selected backup over `.env` (preferably via the same atomic write logic).
       - Reload `loadConfig()` to ensure restored config is valid.
       - Print a success/failure message.

#### 5.9 Exit behavior

- `Exit` option simply terminates the script:
  - Exit code `0`.
  - Optionally print a brief goodbye like “Exiting admin UI.”

### 6. Interaction with setup wizard (from uiTechnicalSpec.md)

- Responsibilities:

  - **Setup wizard (`npm run setup`)**:
    - Handles first‑time setup and full reconfiguration.
    - Performs live tests and writes `.env` atomically (with backups).
    - Optionally configures content profiles.
  - **Admin UI (`npm run admin`)**:
    - Provides ongoing maintenance of `.env`: viewing, editing, testing, and restoring from backup.
    - Does not generate instructions Markdown or handle first‑time creation of `.env`.

- Shared modules:

  - Both the setup wizard and admin UI import:
    - `configSchema` for field definitions and validation.
    - `envFile` for `.env` loading/saving/backup.
    - `healthChecks` for Gemini and Ghost connectivity.
  - This avoids duplication and keeps behavior consistent across tools.

---

## Test Plan

- **Basic flows**

  - With a valid `.env`:
    - Run `npm run admin`.
    - Verify main menu renders.
    - Use “View current configuration”:
      - Confirm all values match `.env`.
      - Verify that API keys are masked.
    - Change a single field (e.g., `GEMINI_MODEL`), confirm, and verify:
      - `.env` reflects the new model.
      - A new `.env.backup-*` file is created.
      - `loadConfig()` still succeeds and runtime (`npm start`) uses the new model.

  - With no `.env` present:
    - Temporarily rename or remove `.env`.
    - Run `npm run admin`.
    - Confirm:
      - A clear message instructs you to run `npm run setup`.
      - Admin UI exits without creating `.env`.

- **Validation and error handling**

  - Try saving an invalid `GHOST_ADMIN_API_KEY` (missing `:`):
    - Admin UI should show a validation error and prevent saving.
  - Enter an invalid URL for `BLOG_SITE_URL`:
    - Admin UI should reject it with a helpful message.
  - Force a write failure scenario (e.g., read‑only filesystem or simulate error in `saveEnvAtomic`):
    - Confirm that:
      - `.env` is unchanged or properly restored from backup.
      - User sees a descriptive error.

- **Connectivity tests**

  - With correct configuration:
    - Run “Run connectivity tests”.
    - Confirm both Gemini and Ghost checks show ✅ and reasonable success messages.
  - With intentionally incorrect Ghost URL or key:
    - Run tests again.
    - Confirm Ghost shows ❌ with a message indicating auth/URL issues.
    - Confirm `.env` is not modified by the test.
  - With intentionally incorrect Gemini API key:
    - Confirm Gemini shows ❌ with a message hinting at key or rate limit problems.

- **Backups and restore (if implemented)**

  - Make multiple edits to config, generating several `.env.backup-*` files.
  - Use “Manage .env backups” to restore an older backup.
  - Verify:
    - `.env` contents match the backup.
    - `loadConfig()` works with the restored config.
    - Admin UI’s “View current configuration” reflects restored values.

- **Non‑interference with runtime**

  - After editing configuration via admin UI:
    - Run `npm start` and confirm:
      - The app still runs successfully using the updated configuration.
    - Optionally, run `npm run setup` afterwards and verify it:
      - Loads existing values as defaults from `.env`.
      - Respects the same schema and health checks.

---

## Assumptions

- Node.js version is recent enough (preferably Node ≥ 18) to support either:
  - Global `fetch` for Ghost connectivity tests, or
  - A lightweight HTTP client dependency (e.g., `node-fetch`).
- `uiTechnicalSpec.md` will be implemented (or partially implemented) such that:
  - `.env` is the single source of truth for configuration.
  - `config.js` is made fully blog‑agnostic, with no hard‑coded lifeagent URLs.
- Adding `inquirer` and one new npm script (`admin`) is acceptable for this project.
- Formal unit test harness is optional; acceptance is primarily via the manual CLI flows described above.
```
