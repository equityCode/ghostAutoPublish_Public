Here’s a complete new spec you can save as  
`/Users/andrewroy/ghostAutoPublish/uiTechnicalSpec.md`:

---

```markdown
# Technical Plan: Admin CLI Setup Wizard for ghostAutoPublish

## 1. Goals and Non‑Goals

### 1.1 Goals

- Provide a **cross‑platform admin setup UI** as an interactive CLI wizard (`npm run setup`) that:
  - Collects all required Gemini and Ghost configuration.
  - Guides users on how to obtain keys if they don’t have them.
  - Validates configuration with live tests (Gemini + Ghost).
  - Writes a `.env` file **atomically** and backs up any previous version.
  - Optionally configures **content profiles** and writes `content-profiles.json`.
- Make **ghostAutoPublish blog‑agnostic**:
  - No hard‑coded dependency on lifeagent URLs in the runtime config.
  - All blog‑specific values come from `.env` created by the wizard.
- Ensure that failed setup attempts do **not** leave the program in a broken state:
  - If save fails, revert to the previous `.env` or leave config untouched.
- Keep the runtime publisher (`npm start`) unchanged in behavior, but driven entirely by the new configuration model.

### 1.2 Non‑Goals

- No GUI or browser‑based admin UI in this iteration (CLI only).
- No multi‑profile selection within a single clone:
  - **Pattern:** one repo clone per Ghost blog (one `.env` per clone).
- No binary PDF generation:
  - “PDF‑printable” means a Markdown document designed to be printed to PDF via any editor or viewer.
- No changes to Ghost blog content model beyond what `ghostAutoPublish` already publishes.

---

## 2. Architecture Overview

### 2.1 Components

- `src/setup.js`
  - Interactive CLI wizard.
  - Responsible for all user interaction, env collection, validation, saving, and basic content‑profile configuration.
- `src/config.js`
  - Loads `.env` using `dotenv`.
  - Validates the presence and basic shape of required configuration values.
- `src/gemini.js` (existing)
  - Gemini API client and JSON parsing.
  - Reused for live Gemini connectivity test (with a lightweight prompt).
- `src/ghostAuth.js` (existing)
  - Creates Ghost Admin JWT from `GHOST_ADMIN_API_KEY`.
  - Reused for Ghost connectivity test.
- `src/ghostApi.js` (existing)
  - Used indirectly for understanding Ghost URL patterns; tests will call a minimal Admin endpoint directly.
- `data/post-history.json` (existing)
  - Stores history used by prompts and related posts.
- `logs/` (existing)
  - Stores publish logs; not used by setup wizard.
- `content-profiles.json`
  - Stores content profiles used to generate one post per enabled profile per run.

### 2.2 Execution Entry Points

- Setup wizard:
  - `npm run setup` → `node src/setup.js`
- Publisher:
  - `npm start` → `node src/index.js`

---

## 3. Configuration Model

### 3.1 Environment Variables (Required / Optional)

All configuration is stored in `.env` at the project root and read via `src/config.js`.

Required:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GHOST_ADMIN_API_KEY` (format: `KEY_ID:SECRET`)
- `GHOST_ADMIN_API_URL` (e.g. `https://your-blog-domain/ghost/api/admin`)
- `BLOG_SITE_URL` (e.g. `https://your-blog-domain`)
- `NEW_AGENT_BACKLINK_URL`
- `CURRENT_AGENT_BACKLINK_URL`

Optional with defaults:

- `GEMINI_REFORMAT_API_KEY`  
  - Defaults to `GEMINI_API_KEY` if not set.
- `GEMINI_REFORMAT_MODEL`  
  - Defaults to `GEMINI_MODEL` if not set.

### 3.2 Blog‑Agnostic Behavior

- `config.js` must **not** hard‑code lifeagent URLs anymore.
- If a required env variable is missing:
  - `loadConfig()` throws a clear `Missing required environment variable` error.
- The wizard is the only supported way for non‑technical users to create/update `.env`.

---

## 4. Setup Wizard UX and Flow (`src/setup.js`)

### 4.1 CLI Library

- Use an established prompt library (e.g. `inquirer`) for:
  - Input prompts (with masking for secrets).
  - Selection menus.
  - Confirmation prompts.
- Add a new dev dependency and npm script:
  - `scripts.setup = "node src/setup.js"`

### 4.2 High‑Level Flow

1. Intro & detection.
2. Collect Gemini configuration.
3. Collect Ghost configuration.
4. Show summary and get confirmation.
5. Run live tests (Gemini + Ghost).
6. On success: save `.env` atomically and back up previous env (if any).
7. Optionally collect and save content profiles (1–2 profiles).
8. Exit with a clear status message.

### 4.3 Step 1 – Intro & Detection

- On start, print:
  - Name: `ghostAutoPublish Admin Setup Wizard`.
  - Description: what it configures and that it will create/update `.env`.
  - Warning that API keys are sensitive and not to be checked into git.
- Detect existing `.env`:
  - If present, load and use values as defaults for prompts.
  - Show short notice: “Existing configuration detected; you can keep or change values.”

### 4.4 Step 2 – Gemini Configuration

Prompts:

1. **Do you already have a Gemini API key?**
   - Yes → proceed to key entry.
   - No → show short instructions:
     - Go to the Gemini/Google AI Studio console URL.
     - Create or locate an API key.
     - Copy the key and keep it safe.
2. `GEMINI_API_KEY` (input, masked):
   - Required, non‑empty.
3. `GEMINI_MODEL` (input with default):
   - Default: `gemini-2.5-flash`.
   - Must be non‑empty.
4. Backup/reformat model/key:
   - Choice:
     - “Reuse primary key for reformatting (recommended)”
     - “Enter a separate backup key”
   - If reuse:
     - `GEMINI_REFORMAT_API_KEY` will be omitted from `.env` and default to primary.
   - If separate:
     - Prompt for `GEMINI_REFORMAT_API_KEY` (masked).
   - Prompt for `GEMINI_REFORMAT_MODEL` (default: `gemini-flash-latest` or same as primary).

Local validation:

- Ensure key fields are non‑empty.
- No format enforcement beyond non‑empty for keys (Gemini keys may vary).

### 4.5 Step 3 – Ghost Configuration

Prompts:

1. `BLOG_SITE_URL`:
   - Default: existing value from `.env` if present, or empty.
   - Normalize:
     - Ensure `https://` or `http://` is present (default to `https://` if omitted).
     - Strip trailing slash for internal consistency.
2. `GHOST_ADMIN_API_URL`:
   - Default:  
     - If existing: use from `.env`.  
     - Else: `${BLOG_SITE_URL}/ghost/api/admin` (with normalized slash behavior).
   - Must be a valid URL string (basic format only).
3. `GHOST_ADMIN_API_KEY`:
   - Input, masked.
   - Must contain a `:` and split into `KEY_ID` and `SECRET`.
4. `NEW_AGENT_BACKLINK_URL`:
   - Default:
     - Existing value from `.env` if present; otherwise a generic placeholder such as `https://your-main-site.com/newagents`.
   - Must be non‑empty and look like a URL.
5. `CURRENT_AGENT_BACKLINK_URL`:
   - Default:
     - Existing value from `.env` if present; otherwise `https://your-main-site.com/currentagents`.
   - Must be non‑empty and look like a URL.

Local validation:

- `GHOST_ADMIN_API_KEY` must split into `[keyId, secret]` with both non‑empty.
- All URLs must be non‑empty and match a simple `^https?://` check.

### 4.6 Step 4 – Summary & Confirmation

- Present a summary screen:

  - Show:
    - `BLOG_SITE_URL`
    - `GHOST_ADMIN_API_URL`
    - `NEW_AGENT_BACKLINK_URL`
    - `CURRENT_AGENT_BACKLINK_URL`
    - `GEMINI_MODEL`
    - `GEMINI_REFORMAT_MODEL`
  - Mask keys:
    - `GEMINI_API_KEY`, `GEMINI_REFORMAT_API_KEY`, `GHOST_ADMIN_API_KEY` as:
      - First 4 characters + `…` + last 4 characters (if length allows), or just `****` otherwise.

- User options:
  - “Run tests and save configuration”.
  - “Run tests without saving”.
  - “Go back and edit values”.
  - “Cancel without tests or changes”.

### 4.7 Step 5 – Live Tests (Pre‑Save)

#### 4.7.1 Gemini Test

- Build a temporary config object (not written to `.env` yet).
- Call a small helper derived from `callGemini()`:

  - Prompt example:  
    > “Return JSON only: {"ok": true}”

  - Expectations:
    - HTTP 200.
    - Valid JSON in the response.
    - The client extracts a string from `content.parts` and attempts to parse JSON or at least confirm the response shape is acceptable.

- Failure handling:
  - If non‑200 or parsing fails:
    - Show the HTTP status and a short reason.
    - Mark Gemini test as failed.

#### 4.7.2 Ghost Test

- Use `createGhostJwt(config)` from `src/ghostAuth.js` to create a JWT.
- Call a read‑only Ghost Admin endpoint, e.g.:

  - `GET {GHOST_ADMIN_API_URL}/site/`  
  - or `GET {GHOST_ADMIN_API_URL}/posts/?limit=1`

- Expectations:
  - HTTP 200.
  - JSON body with basic structure (no strict schema needed).

- Failure handling:
  - For 401/403:
    - Say “Authentication failed – check your Admin API key and URL, including `/ghost/api/admin`”.
  - For 404:
    - Suggest that the URL may be wrong (missing `/ghost/api/admin` or domain mismatch).
  - For network issues:
    - Show generic connectivity error.

#### 4.7.3 Test Result Presentation

- Show a simple dashboard:

  - Gemini: ✅ or ❌ plus brief message.
  - Ghost: ✅ or ❌ plus brief message.

- If any test fails:
  - Offer:
    - “Edit values and retry tests”.
    - “Cancel without saving”.
  - Do not write or modify `.env`.

### 4.8 Step 6 – Saving `.env` (Atomic + Reversible)

- Pre‑conditions:
  - Tests passed (or user explicitly chose “save anyway” if you decide to allow that; default is to **require passing tests**).
- Process:

  1. Construct the full `.env` content as a string, including:
     - A short header comment noting it was generated by the setup wizard and must not be committed.
  2. If `.env` exists:
     - Copy it to `.env.backup-YYYYMMDD-HHMMSS` in the project root.
  3. Write to a temporary file, e.g. `.env.new`.
  4. After successful write:
     - Rename `.env.new` → `.env`.
  5. If any write or rename error occurs:
     - Restore previous `.env` from backup (if there was one).
     - Delete `.env.new` if it exists.
     - Report save failure to the user.

- Post‑conditions:
  - Either a fully valid new `.env` exists, or the previous `.env` remains intact.

### 4.9 Step 7 – Content Profiles Step (Profiles JSON)

- After `.env` is saved, the wizard:
  - Explains what **content profiles** are and why using two is recommended:
    - More posts per run/month.
    - Ability to serve different audiences/funnels.
    - More varied SEO signals over time.
  - Asks how many profiles to configure now:
    - `2 profiles (recommended)` or `1 profile`.
  - For each selected profile:
    - Prompts for label, audience description, intent, Ghost tag, backlink URL, keywords, and topic ideas.
    - Prefills values from existing `content-profiles.json` when present, otherwise from example defaults.
  - Asks for confirmation and, if accepted, writes `content-profiles.json` atomically.

### 4.10 Step 8 – Exit Behavior

- On success:
  - Exit code `0`.
  - Print:
    - “.env saved successfully.”
    - “Content profiles saved to content-profiles.json” (if profiles were updated).
    - “You can now run `npm start` to publish posts.”
- On failure or cancellation:
  - Exit code `1` for failures, `0` or `1` for explicit cancel (treat as non‑fatal).
  - Print whether `.env` was changed or left untouched.
  - Suggest re‑running `npm run setup`.

---

## 5. Security Considerations

- Secrets (Gemini and Ghost keys) must:
  - Be stored only in `.env`.
  - Never be printed in full to the terminal (only masked).
  - Never appear in the Markdown instructions file or logs.
- `.env` must remain in `.gitignore`.
- The wizard must warn users not to share `.env` or the generated instructions file if they choose to add sensitive details to it manually.

---

## 6. Error Handling & Edge Cases

- **Invalid `GHOST_ADMIN_API_KEY` format (`KEY_ID:SECRET`):**
  - Detected locally, before tests.
  - Clear error message and re‑prompt.
- **Invalid URLs (missing scheme or malformed):**
  - Detected by simple `https?://` regex and re‑prompt.
- **API rate limits during Gemini test:**
  - Report that rate limit may be hit.
  - Suggest trying again later.
- **Ghost endpoint not reachable:**
  - Distinguish DNS/network errors from 401/403/404 when possible.
- **Partial write failures:**
  - Always delete partial `.env.new` and attempt to restore previous state.
- **Existing broken `.env`:**
  - Wizard can still run; tests will likely fail.
  - User can fix values via the wizard and overwrite `.env`.

---

## 7. Acceptance Criteria

The UI work is considered complete when:

1. `npm run setup` launches an interactive wizard that:
   - Prompts for all required Gemini and Ghost values.
   - Provides guidance on obtaining a Gemini API key and Ghost Admin API key.
   - Shows a clear summary with masked secrets.
   - Runs live tests against Gemini and Ghost.
2. On successful tests and user confirmation:
   - A valid `.env` is written atomically.
   - Any previous `.env` is backed up with a timestamp.
   - A Markdown instructions file is created with a correct, personalized configuration summary.
3. On test failures or save failures:
   - Existing `.env` is not corrupted.
   - Clear error messages are shown and the user can retry or exit.
4. `npm start` uses the `.env` created by the wizard and:
   - Publishes posts to the configured Ghost blog.
   - Uses the configured backlink URLs.
5. No secrets appear in:
   - `autoPostNode-technical-specs.md`
   - `uiTechnicalSpec.md`
   - Instructions Markdown documents (beyond user‑editable content).
6. It is possible to clone the repo multiple times, run `npm run setup` in each clone with different values, and have each clone target a different Ghost blog independently.

---
```
