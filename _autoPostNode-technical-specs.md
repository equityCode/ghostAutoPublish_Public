

# Technical Plan: Local Node Program for Gemini-to-Ghost Automated Blog Publishing

## Objective

Build a single local Node.js program for the Mac Mini that runs on a schedule, calls Gemini to generate article content, generates a Ghost Admin API JWT, and publishes two blog posts to Ghost every time it runs.

The program must:

1. Run locally on the Mac Mini
2. Call Gemini directly from the same program
3. Receive and validate the Gemini response
4. Generate a Ghost Admin API JWT inside the same program
5. Post to the Ghost Admin API using the correct payload shape
6. Publish two posts per execution
7. Use short human-readable titles and long-tail custom slugs
8. Include strategic backlinks to the main site

## Publishing Targets Per Run

Each execution of the program must publish exactly two posts:

### Post 1: New Life Insurance Agents

Audience:
- People exploring becoming a life insurance agent
- New or unlicensed prospects
- Traffic intended to support recruiting and onboarding

Required backlink target:
- `https://lifeagent.live/newagent.html`

### Post 2: Currently Licensed / Currently Insured Agents

Audience:
- Existing agents evaluating a move, better support, or a new opportunity
- Traffic intended to support the current-agent recruiting page

Required backlink target:
- `https://lifeagent.live/currentagent.html`

## Core System Requirements

The program must be implemented as one Node.js program with the following built-in responsibilities:

1. Load configuration from environment variables
2. Build two prompt requests for Gemini
3. Call Gemini API
4. Parse and validate structured response data
5. Normalize title and slug values
6. Generate Ghost JWT from Admin API key
7. Construct Ghost API payloads
8. Create and publish posts immediately
9. Log success/failure for each post independently
10. Exit with a non-zero code if one or more posts fail

## High-Level Program Flow

### Step 1. Load Environment Configuration

The program should load all required environment variables from a local `.env` file.

Required environment variables:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GHOST_ADMIN_API_KEY`
- `GHOST_ADMIN_API_URL`
- `BLOG_SITE_URL`
- `NEW_AGENT_BACKLINK_URL`
- `CURRENT_AGENT_BACKLINK_URL`

Example (do **not** commit real keys; use `.env` only):

```env
GEMINI_API_KEY=YOUR_PRIMARY_GEMINI_API_KEY
GEMINI_MODEL=gemini-2.5-flash
GHOST_ADMIN_API_KEY=YOUR_KEY_ID:YOUR_SECRET
GHOST_ADMIN_API_URL=https://your-blog-domain/ghost/api/admin
BLOG_SITE_URL=https://your-blog-domain
NEW_AGENT_BACKLINK_URL=https://your-main-site.com/newagents
CURRENT_AGENT_BACKLINK_URL=https://your-main-site.com/currentagents
```

### Step 2. Build Prompt Inputs

The program should build two separate Gemini prompts, one for each audience.

Prompt A should generate a post for:
- new agents
- recruiting intent
- backlink to `https://lifeagent.live/newagent.html`

Prompt B should generate a post for:
- experienced or currently licensed agents
- recruiting / switching intent
- backlink to `https://lifeagent.live/currentagent.html`

## Gemini Output Contract

The Gemini prompt must instruct the model to return structured JSON only.

Expected response shape for each post:

```json
{
  "title": "Florida Family Coverage Options",
  "slug": "best-life-insurance-for-families-in-florida-no-medical-exam-affordable-coverage",
  "html": "<p>Article HTML here...</p>"
}
```

Rules for Gemini output:

1. `title` must be short, readable, and human-friendly
2. `slug` must be long-tail, keyword-rich, lowercase, and hyphen-separated
3. `html` must contain the full article body
4. `html` must include at least one contextual backlink to the required target page
5. The response must contain valid JSON only
6. No markdown code fences
7. No commentary outside the JSON

## Content Constraints

Each generated article should:

1. Be written for SEO and readability
2. Match the target audience for that post
3. Include a natural contextual backlink to the required page
4. Avoid duplicate phrasing between the two posts
5. Avoid generic filler text
6. Avoid keyword stuffing
7. Be suitable for publication without manual cleanup

## Step 3. Parse and Validate Gemini Response

The Node program must validate Gemini output before attempting to publish.

Validation checks:

1. JSON parses successfully
2. `title` exists and is non-empty
3. `slug` exists and is non-empty
4. `html` exists and is non-empty
5. `slug` matches slug-safe pattern
6. `html` contains the required backlink URL for that audience
7. `title` length is reasonable
8. `slug` length is reasonable

If validation fails:
- log the reason clearly
- skip publishing that post
- continue evaluating the other post
- exit non-zero if either post fails overall

## Slug Rules

Slug requirements:

1. Lowercase only
2. Hyphen-separated words only
3. No spaces
4. No underscores
5. No special punctuation
6. Long-tail keyword format
7. Must be unique enough to avoid likely collisions

Recommended fallback behavior:
- if Gemini returns an invalid slug, normalize it automatically
- if the slug is still invalid or empty after normalization, fail that post

## Step 4. Generate Ghost JWT

The same Node program must generate the Ghost Admin API JWT internally using the Ghost Admin API key in `id:secret` format.

JWT requirements:

1. Parse key into `id` and `secret`
2. Sign using HS256
3. Set audience to `/admin/`
4. Short expiration window, such as 5 minutes
5. Use the key ID as `kid`

This JWT must be generated at runtime immediately before publishing.

## Step 5. Publish to Ghost Admin API

For each validated article, send a publish request to:

```text
POST https://blog.lifeagent.live/ghost/api/admin/posts/?source=html
```

Auth header format:

```text
Authorization: Ghost <JWT>
```

Required payload shape:

```json
{
  "posts": [
    {
      "title": "Florida Family Coverage Options",
      "slug": "best-life-insurance-for-families-in-florida-no-medical-exam-affordable-coverage",
      "html": "<p>Your generated article HTML goes here.</p>",
      "status": "published"
    }
  ]
}
```

The program must publish both posts independently so one failure does not prevent the second attempt.

## Logging Requirements

The program should log:

1. Start of run
2. Prompt generation started
3. Gemini request started
4. Gemini response received
5. Validation success/failure
6. Ghost JWT generation success/failure
7. Ghost publish success/failure
8. Final per-post result summary
9. Final overall run status

Recommended log format:
- timestamped plain text
- easy to read in terminal
- suitable for cron output redirection

## Error Handling Requirements

The program must handle these failure modes explicitly:

1. Missing environment variable
2. Gemini request failure
3. Gemini malformed JSON
4. Missing or invalid backlink in generated HTML
5. Invalid slug
6. Ghost JWT generation failure
7. Ghost API authentication failure
8. Ghost API validation failure
9. Network timeout
10. Partial success where one post succeeds and the other fails

Required behavior:
- never fail silently
- report which audience post failed
- include HTTP status codes where relevant
- return non-zero exit code if any required post fails

## Idempotency / Duplication Guard

The plan should include a basic duplication-prevention strategy.

Recommended minimum behavior:

1. Before publishing, query Ghost for existing posts matching the exact slug
2. If slug already exists, append a date suffix or fail clearly
3. Log when a slug collision occurs

Optional stronger behavior:
- maintain a local run log or publish registry file on disk

## File / Project Structure

Recommended local project structure:

```text
/local-blog-publisher
  ├── .env
  ├── package.json
  ├── src/
  │   ├── index.js
  │   ├── config.js
  │   ├── gemini.js
  │   ├── ghostAuth.js
  │   ├── ghostApi.js
  │   ├── prompts.js
  │   ├── validators.js
  │   └── logger.js
  └── logs/
```

## Recommended NPM Dependencies

Likely dependencies:

- `axios` or built-in `fetch`
- `dotenv`
- `jsonwebtoken`

Optional:

- `zod` for validation
- `pino` or `chalk` for logging

## Execution Model

The program should be runnable manually like this:

```bash
node src/index.js
```

It should also be suitable for cron execution on the Mac Mini.

Example cron intent:

```cron
0 6 * * * /usr/bin/env node /absolute/path/to/src/index.js >> /absolute/path/to/logs/publish.log 2>&1
```

## Prompt Design Requirements

The Codex implementation should build prompts that force Gemini to:

1. return JSON only
2. produce one short title
3. produce one long-tail slug
4. produce article HTML with natural contextual backlink placement
5. avoid placeholders like "insert link here"
6. avoid markdown wrappers
7. avoid duplicate topic framing across the two posts in the same run

## Topic Intent Guidance

### New Agent Post Theme Examples

Examples of targeting angles:
- how to become a life insurance agent
- why new agents fail
- what new life insurance agents should look for in an agency
- how to get started without confusion or bad support

Backlink destination:
- `https://lifeagent.live/newagent.html`

### Current Agent Post Theme Examples

Examples of targeting angles:
- why experienced agents switch agencies
- what licensed agents should expect from real support
- better lead flow or better comp structure discussion
- signs it may be time to move to a better platform or team

Backlink destination:
- `https://lifeagent.live/currentagent.html`

## Minimum Acceptance Criteria

The project is successful when all of the following are true:

1. One local Node program handles the entire flow
2. Running the program publishes exactly two posts
3. Each post has a short readable title
4. Each post has a custom long-tail slug
5. Each post contains the correct backlink for its audience
6. Ghost publishes both posts successfully through the Admin API
7. The program exits successfully only when both posts publish correctly
8. The program logs enough detail for troubleshooting from cron logs

## Codex Build Instruction

Codex should implement this as a practical production-ready local automation utility, not a demo script.

The implementation should prioritize:

1. clarity
2. reliability
3. structured validation
4. explicit logging
5. clean separation of responsibilities across files
6. minimal manual intervention after setup

## Deliverable Expectation

Codex should produce:

1. working Node.js source files
2. `.env.example`
3. `package.json`
4. clear setup instructions
5. clear run instructions
6. notes for cron integration
7. notes for future extensibility such as image generation, category assignment, internal linking expansion, or publishing schedules

## Credentials (Local Only – Do Not Commit)

> WARNING: Never put real API keys or secrets in this document or in the repository.  
> All live keys must live only in your local `.env` file, which is git‑ignored.

- `GEMINI_API_KEY`  
  - Usage: Set in `.env` as:
    ```env
    GEMINI_API_KEY=YOUR_PRIMARY_GEMINI_API_KEY
    GEMINI_MODEL=gemini-2.5-flash
    ```

- `GHOST_ADMIN_API_KEY`  
  - Format: `KEY_ID:SECRET` from Ghost Admin → Integrations.  
  - Usage: Set in `.env` as:
    ```env
    GHOST_ADMIN_API_KEY=YOUR_KEY_ID:YOUR_SECRET
    GHOST_ADMIN_API_URL=https://your-blog-domain/ghost/api/admin
    BLOG_SITE_URL=https://your-blog-domain
    NEW_AGENT_BACKLINK_URL=https://your-main-site.com/newagents
    CURRENT_AGENT_BACKLINK_URL=https://your-main-site.com/currentagents
    ```

- Notes:
  - `.env` must always be in `.gitignore` and must never be committed.
