# ghostAutoPublish – Gemini → Ghost Auto Blog Publisher

`ghostAutoPublish` is a local Node.js automation utility that runs on any machine with Node.js installed, calls the Gemini API to generate **SEO‑focused blog content** in any niche, and publishes two posts per run to a Ghost blog via the Ghost Admin API.

It is designed to be production‑ready, cron‑friendly, and safe to run unattended once configured.

---

## What It Does

Each time you run the program, it:

1. Loads configuration and secrets from a local `.env` file.
2. Builds **machine‑readable JSON prompts** for Gemini for two content profiles per run (for example, two different audiences, topics, or funnels).
3. Calls the primary Gemini model (e.g. `gemini-2.5-flash`) to generate structured JSON:
   - `title` – short, human‑readable.
   - `slug` – long‑tail, SEO‑oriented, lowercase and hyphenated.
   - `html` – full article body as HTML.
4. Parses and validates the Gemini output:
   - Tries a strict `JSON.parse` first, then a safe “trim to outer `{...}`” fallback.
   - If parsing still fails, forwards the raw text to a **backup Gemini model** dedicated to JSON reformatting and retries parsing.
   - JSON shape is correct.
   - Required backlink URL is present for the audience.
   - Word count is between **600 and 1100** words.
5. Normalizes the slug (safe characters, reasonable length).
6. Generates a Ghost Admin JWT from the Admin API key.
7. Publishes each post via the Ghost Admin API (`/posts/?source=html`) with:
   - Status: `published`.
   - Audience tag (default example):
     - New Agents → `New Agents`.
     - Current Agents → `Current Agents`.
   - `custom_excerpt` – short summary auto‑generated from the article body.
8. If the primary model call fails with a **429 (rate limit / daily limit)**, automatically falls back to the backup model to generate that audience’s post once before proceeding.
9. Appends a **Related posts** section to each article body that links to other relevant posts created by this tool, based on shared keywords and recency.
10. Writes a Markdown log entry per post attempt to `logs/publish-log.md`.
11. Records successful posts into `data/post-history.json` to help keep content fresh over time and power related-posts linking.

If either post fails validation or publish, the process exits with a non‑zero status code and logs detailed error information.

---

## Freshness & Keyword Strategy

To avoid re‑posting the same content over and over, the program:

- Maintains a local history file: `data/post-history.json` with:
  - `date`, `title`, `slug`, `usedKeywords`, `wordCount` per content profile.
- Uses that history when building prompts:
  - Recent titles for each profile are passed into Gemini as “topics to avoid rephrasing”.
- Uses curated keyword lists per profile (see `src/keywords.js`):
  - This repo ships with a sample configuration aimed at “new” vs “current” agents.
  - You can replace these lists with keywords for any niche or topic you care about.
- Picks **fresh keyword combinations** per run:
  - Prefers keywords that have been used less recently.
  - Avoids reusing exactly the same keyword set as recent posts when possible.

The result is long‑tail, SEO‑focused posts that stay within a clear topical lane but vary their angles and keyword emphasis over time.

---

## Requirements

- Node.js **20+** (tested with Node 22).
- A Ghost blog with Admin API access.
- A primary Gemini API key and compatible model (e.g. `gemini-2.5-flash`).
- Optionally, a **separate backup Gemini key/model** with higher quotas (for JSON reformatting and rate‑limit fallback).
- Ability to run the script locally or via a scheduler (cron, systemd timer, Task Scheduler, etc.) on your machine.

---

## Getting Started

1. **Clone and install**

   ```bash
   cd /path/to/ghostAutoPublish
   npm install
   ```

2. **Run the setup wizard (env + profiles)**

   ```bash
   npm run setup
   ```

   The wizard will:

   - Collect your Gemini API key/model.
   - Collect your Ghost Admin API URL and Admin API key (`KEY_ID:SECRET` from Ghost Admin → Integrations).
   - Run optional connectivity tests against Gemini and Ghost.
   - Write a `.env` file atomically (with timestamped backups).
   - Walk you through configuring **1–2 content profiles** and save them to `content-profiles.json`.

   You can cancel at the summary step if you don’t want to save changes.

3. **(Optional) Adjust configuration later**

   - Edit `.env` or `content-profiles.json` directly, or
   - Use the Admin UI:

     ```bash
     npm run admin
     ```

     From there you can:

     - Manage content profiles.
     - Edit Gemini/Ghost/backlink settings.
     - Run connectivity tests and manage `.env` backups.

4. **Publish posts**

   From the project root:

   ```bash
   npm start
   ```

   On each run, ghostAutoPublish will generate and publish **one post per enabled content profile** (1–2 posts per run) to your Ghost blog.

---

## Running Manually

From the project root:

```bash
npm start
```

On a successful run:

- Exactly two posts are published (one per configured content profile).
- Each post:
  - Has a short, human‑readable title.
  - Has a long‑tail, normalized slug.
  - Contains the correct backlink for its profile/audience.
  - Is tagged appropriately (see `src/ghostApi.js` and `src/prompts.js` for the default example).
  - Includes an auto‑generated excerpt (`custom_excerpt`).
- Logs and history are updated:
  - `logs/publish-log.md` – human‑readable Markdown log.
  - `data/post-history.json` – machine‑readable history used for prompt freshness and related-posts selection.

If any required step fails (e.g., Gemini error, missing backlink, Ghost API issue), the process exits non‑zero and logs the error.

---

## Cron Integration (Daily Automation)

Example cron entry to run every day at 6:00 AM:

```cron
0 6 * * * /usr/bin/env node /absolute/path/to/ghostAutoPublish/src/index.js >> /absolute/path/to/ghostAutoPublish/logs/cron.log 2>&1
```

This will:

- Run the program once daily.
- Append console output to `logs/cron.log`.
- Continue to append structured results to `logs/publish-log.md`.

---

## Project Structure

```text
ghostAutoPublish/
  ├── .env                # Your local secrets (ignored by git)
  ├── .gitignore
  ├── content-profiles.json # Content profiles (audiences/topics) for each run
  ├── package.json
  ├── README.md
  ├── logs/
  │   └── publish-log.md  # Append-only Markdown history
  ├── data/
  │   └── post-history.json  # Internal history for freshness / keyword rotation
  └── src/
      ├── index.js        # Orchestrator entrypoint
      ├── config.js       # Env loading and validation (includes profiles)
      ├── prompts.js      # JSON prompt builders (history- and profile-aware)
      ├── keywords.js     # Default keyword lists and rotation helpers
      ├── gemini.js       # Gemini API client + JSON parsing
      ├── validators.js   # JSON + backlink + word-count + slug normalization
      ├── ghostAuth.js    # Ghost Admin JWT generation
      ├── ghostApi.js     # Slug collision checks + publish calls + tags/excerpt
      ├── history.js      # Read/write post-history.json
      ├── relatedPosts.js # Internal related-posts selection and HTML appending
      ├── logger.js       # Console + Markdown logging
      ├── setup.js        # CLI wizard for configuring content profiles
      ├── admin-ui.js     # Admin CLI for managing content profiles
      └── test-gemini.js  # Optional Gemini test harness

---

## Content Profiles

ghostAutoPublish uses **content profiles** to decide who each post is for and how many posts to create per run.

- Each profile represents one audience/topic “lane”:
  - `label` – human-friendly name (e.g. “New Agents”, “DevOps Tips”).
  - `intent` – what the post should achieve for that audience.
  - `keywords` – SEO keyword pool used for freshness and variation.
  - `tag` – Ghost tag applied to posts in this profile.
  - `backlinkUrl` – required backlink URL that must appear in the HTML.
- The system supports **up to 2 profiles per run**.
  - On each run, it publishes **one post per enabled profile** (1 or 2 posts total).
  - Using 2 profiles is **recommended**:
    - More posts per month from the same automation run.
    - Ability to serve different audiences/funnels with the same blog.
    - More varied, SEO-friendly signals via different topics and internal links.

Profiles are stored in `content-profiles.json` at the repo root. A default file is included that uses a “New Agents / Current Agents” example configuration, but you are encouraged to replace these with your own audiences and tags.

To edit content profiles you can either:

- Edit `content-profiles.json` directly, or
- Use the CLIs:
  - `npm run setup` – guided wizard to configure profiles from scratch.
  - `npm run admin` → “Manage Content Profiles” – edit/toggle existing profiles.
```

---

## Internal Links / Related Posts

Every new post now includes a **Related posts** section automatically appended to the article HTML before publishing. This section:

- Links only to other posts created by `ghostAutoPublish`.
- Uses `data/post-history.json` as its source of truth.
- Chooses up to three posts for the same content profile based on:
  - Overlap in `usedKeywords` between the current post and historical posts.
  - Recency (more recent posts are preferred when keyword overlap is similar).
- Builds URLs using `BLOG_SITE_URL` and the stored slug for each historical post (assuming the standard `/${slug}/` Ghost permalink pattern).

This keeps readers on your site longer and helps distribute internal link equity across your content.

---

## Security & Open Source Considerations

- **Never commit `.env`**, `logs/`, or `data/`:
  - `.env` contains live API keys.
  - `logs/` and `data/` may contain operational details and post history.
- The repo is safe to open‑source as long as:
  - Real keys stay in `.env` only.
  - Example values in docs are non‑sensitive.
  - You do not commit `post-history.json` or any actual content that should remain private.

If you plan to open‑source this project:

- Keep configuration generic (e.g. example URLs and keys).
- Document required Ghost and Gemini setup, but avoid including anything that grants access to your live systems.

---

## Extensibility Ideas

Possible future enhancements:

- Add image generation (e.g. Gemini or another service) and set `feature_image`.
- Auto‑assign categories or additional tags beyond the audience tag.
- Generate internal links to other posts on the blog.
- More advanced SEO controls:
  - `meta_title`, `meta_description`, `og_*`, `twitter_*`.
- Webhook or notification when a run fails (email, Slack, etc.).

For now, `ghostAutoPublish` focuses on reliably generating and publishing daily, audience‑targeted SEO posts with good hygiene and minimal manual intervention.

---

## Public Use & Disclaimer

This repository is intended for public, open‑source use. The code is provided **as‑is**, without warranty of any kind. You are responsible for:

- Keeping all API keys, secrets, and Ghost credentials out of version control.
- Reviewing and understanding how posts are generated and published before using this in production.
- Ensuring your use complies with the terms of service and policies of Ghost, Google Gemini (or other APIs you configure), and any applicable laws or regulations in your jurisdiction.

If you are unsure about the implications of running automated publishing tools against production systems, test thoroughly in a non‑production environment first.

---

## Contributing

Contributions are welcome! Please see `CONTRIBUTING.md` for guidelines on getting set up, reporting issues, and opening pull requests in this public repository.
