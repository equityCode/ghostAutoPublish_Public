# Technical Plan: Cross‑Platform Schedule/Cron Setup UI for ghostAutoPublish

## 1. Goals and Non‑Goals

### 1.1 Goals

- Provide a **UI‑driven scheduling setup** integrated into the Admin Config CLI (`npm run admin`) that:
  - Detects the current platform (macOS, Linux, Windows).
  - Lets users choose **when and how often** to run the main Node program (`src/index.js`).
  - Creates or updates a **per‑user scheduled job** appropriate to that platform:
    - macOS/Linux: user‑level `crontab` entry.
    - Windows: Task Scheduler job via `schtasks`.
  - Configures the job with:
    - Correct working directory and `node` path.
    - Stable command that uses `.env`‑driven config.
    - Logging to `logs/cron.log`.
    - Basic **hardening** against restarts, crashes, and configuration drift.
- Make scheduling **discoverable and reversible**:
  - Users can inspect current schedule, enable/modify it, or fully disable/remove it from the Admin CLI.
- Keep the main publisher behavior (`npm start` → `node src/index.js`) unchanged; scheduling only controls **when it runs**, not what it does.

### 1.2 Non‑Goals

- No browser or GUI application; the “UI” is the existing terminal Admin CLI using `inquirer`.
- No system‑wide cron configuration (no `/etc/crontab`, no root‑level cron) — **per‑user only**.
- No full‑blown process supervisor (e.g., PM2, systemd services, Windows services). The job runs `ghostAutoPublish` on a schedule and exits; durability comes from the scheduled trigger, not a long‑running daemon.
- No multi‑schedule support in this iteration:
  - Exactly **one active schedule per clone** (or “disabled”).
- No automatic log rotation beyond simple append; rotation can be a future enhancement.

---

## 2. Architecture Overview

### 2.1 Components

New/updated components (on top of prior specs):

- `src/admin-ui.js` (planned in `adminUI-updates-technicalSpec.md`)
  - Gains a new menu section: **“Manage schedule / automation”**.
  - Uses scheduler helpers to view, create, update, and remove the scheduled job.

- `src/scheduler.js`
  - Cross‑platform scheduler facade used by `admin-ui.js`.
  - Responsibilities:
    - Detect platform via `process.platform`.
    - Normalize schedule choices (e.g., “daily at 08:00”, “every N hours”).
    - Delegate to platform‑specific installers.
    - Summarize current schedule status for display in the Admin UI.

- `src/scheduler-unix.js` (macOS/Linux)
  - Implements:
    - `getUnixScheduleStatus()`
    - `applyUnixSchedule(scheduleSpec)`
    - `removeUnixSchedule()`
  - Manages user‑level `crontab` entries via `crontab -l` / `crontab -`.

- `src/scheduler-windows.js` (Windows)
  - Implements:
    - `getWindowsScheduleStatus()`
    - `applyWindowsSchedule(scheduleSpec)`
    - `removeWindowsSchedule()`
  - Uses `schtasks.exe` to create, query, and delete a per‑user scheduled task.

- `bin/run-ghostautopublish.*` (generated wrapper scripts)
  - `bin/run-ghostautopublish.sh` for macOS/Linux.
  - `bin/run-ghostautopublish.cmd` for Windows.
  - One responsibility: run `ghostAutoPublish` safely and consistently with logging, then exit with the underlying program’s status.

Existing components (context):

- `src/index.js`
  - Main publisher entrypoint (`npm start`).
- `src/config.js`, `src/envFile.js`, `src/configSchema.js`, `src/healthChecks.js`
  - Configuration and health check helpers described in other specs.
  - Used indirectly (e.g., to check config health before enabling schedule).

### 2.2 Execution Entry Points

- Admin Config UI (unchanged entrypoint, extended behavior):
  - `npm run admin` → `node src/admin-ui.js`

Within Admin UI:

- Main menu gains:
  - `Manage schedule / automation` → Opens Schedule UI flow.
- Schedule UI ultimately manages OS‑level scheduled jobs that run:
  - `bin/run-ghostautopublish.sh` (Unix) or
  - `bin/run-ghostautopublish.cmd` (Windows),
  - which in turn call `node src/index.js` (or equivalent `npm start`).

---

## 3. Schedule Model

### 3.1 ScheduleSpec Internal Representation

`src/scheduler.js` normalizes user choices into a `ScheduleSpec` object:

```ts
type ScheduleType = "disabled" | "daily" | "intervalHours" | "intervalMinutes" | "customUnixCron";

interface ScheduleSpec {
  type: ScheduleType;
  // Local time fields; used differently per platform
  hour?: number;        // 0–23
  minute?: number;      // 0–59
  intervalHours?: number;   // >= 1
  intervalMinutes?: number; // >= 5 (guardrail)
  customCronExpression?: string; // raw cron string for Unix only
}
```

Rules:

- Only one `ScheduleSpec` is active per clone at a time.
- `"disabled"` means: no scheduled job is installed (Unix) / task is deleted (Windows).
- `"customUnixCron"` is available only on macOS/Linux; Windows users see only time‑based options.

### 3.2 User‑Facing Options

In the Admin UI “Manage schedule / automation” menu, users see friendly options:

- **View current schedule**
- **Enable or change schedule**
- **Disable schedule (remove job)**
- **Show platform‑specific details / debug**
- **Back**

When enabling/changing schedule, they choose among:

- “Run once per day at a specific time”
- “Run every N hours”
- “Run every N minutes (advanced, >=5 min)”
- “Enter a custom cron expression (Unix only)”
- “Cancel”

Schedule UI validates entries, shows a summary (“Daily at 06:30 local time”), and asks for confirmation before applying.

---

## 4. Admin UI Changes (High‑Level UX)

### 4.1 Main Menu Extension

Extend the Admin UI main menu (from `adminUI-updates-technicalSpec.md`) with:

- `Manage schedule / automation`

When selected:

- The UI calls `getScheduleStatus()` in `src/scheduler.js` to derive:
  - Platform (e.g., “macOS (Unix cron)”, “Linux (Unix cron)”, “Windows (Task Scheduler)”).
  - Status:
    - “Disabled (no scheduled job detected)”
    - “Enabled: Daily at HH:MM”
    - “Enabled: Every N hours”
    - “Enabled: Every N minutes”
    - “Enabled: Custom cron expression (Unix)”
  - Whether the job appears **consistent** with the current clone (path match, marker presence).

Display a summary, then show a Schedule submenu.

### 4.2 Schedule Submenu UX

Options:

1. **View current schedule**
   - Show:
     - Platform and detection method.
     - Parsed schedule type and details.
     - Underlying command (sanitized), including:
       - Wrapper script path.
       - Log file path.
     - Whether the job matches the current clone’s directory (to detect stale entries).
2. **Enable or change schedule**
   - Step 1: If `.env` is missing or invalid (via `loadConfig()` or a lightweight health check), show a warning:
     - “Scheduling is recommended only after successful setup. Run `npm run setup` first.”
     - Allow the user to proceed or cancel.
   - Step 2: Prompt for schedule type (daily, interval, custom Unix cron).
   - Step 3: Ask for required parameters (time, interval, cron expression).
   - Step 4: Show a confirmation summary:
     - Human readable: “Run every 6 hours”.
     - Platform: “macOS/Linux cron” or “Windows Task Scheduler”.
     - Command that will be scheduled (with full paths).
   - Step 5: On confirm:
     - Generate/refresh wrapper script(s) on disk.
     - Call platform‑specific `apply*Schedule()` to install or update the scheduled job.
     - Show success or detailed error messages.
3. **Disable schedule (remove job)**
   - Confirm:
     - “This will remove the scheduled job for this clone only. Your environment and content are not affected.”
   - On confirm:
     - Delete the wrapper script(s) if they were created by the tool.
     - Call `removeUnixSchedule()` or `removeWindowsSchedule()`.
     - Show outcome and return to submenu.
4. **Show platform‑specific details / debug**
   - Unix:
     - Print the current user’s crontab containing lines marked with a special marker.
     - Show the exact cron entry that corresponds to ghostAutoPublish if present.
   - Windows:
     - Show the Task Scheduler task name, existing status summary, and last run result (if available from `schtasks /Query`).
5. **Back**
   - Return to the main Admin menu.

---

## 5. Platform‑Specific Implementation Details

### 5.1 Shared Wrapper Script Strategy

To harden the scheduled job and keep OS‑specific details manageable:

- The **scheduled command** is always a short wrapper script, not a long inline command.
- Wrapper responsibilities:
  - Set the working directory to the repo root.
  - Ensure `node` is invoked correctly.
  - Call `node src/index.js` (or `npm start` if desired) and capture exit code.
  - Append stdout/stderr to `logs/cron.log`.
  - Exit with the exact exit code of the Node program.

#### 5.1.1 Wrapper script naming and location

- Location: `bin/` directory in the project root (created if necessary).
  - Unix: `bin/run-ghostautopublish.sh`
  - Windows: `bin/run-ghostautopublish.cmd`
- Generated or updated by the Admin UI whenever schedule changes:
  - File contents are deterministic and safe to overwrite.
  - Existing file is overwritten with the new content; no partial writes.

#### 5.1.2 Wrapper script behavior (Unix)

- `bin/run-ghostautopublish.sh` pseudocode:

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/absolute/path/to/this/clone"
LOG_FILE="$REPO_DIR/logs/cron.log"

mkdir -p "$REPO_DIR/logs"
cd "$REPO_DIR"

# Use the same Node executable the Admin UI is currently running under
NODE_BIN="/absolute/path/to/node"

echo "[$(date -Iseconds)] Starting ghostAutoPublish from cron..." >> "$LOG_FILE" 2>&1
"$NODE_BIN" "src/index.js" >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "[$(date -Iseconds)] ghostAutoPublish exit code: $EXIT_CODE" >> "$LOG_FILE" 2>&1
exit "$EXIT_CODE"
```

Hardening points:

- Uses **absolute paths** for `REPO_DIR`, `LOG_FILE`, and `NODE_BIN` (derived when creating the script).
- Creates `logs/` if missing.
- Captures exit code and time‑stamps runs.

#### 5.1.3 Wrapper script behavior (Windows)

- `bin/run-ghostautopublish.cmd` pseudocode:

```bat
@echo off
setlocal enabledelayedexpansion

set "REPO_DIR=C:\absolute\path\to\this\clone"
set "LOG_FILE=%REPO_DIR%\logs\cron.log"
set "NODE_BIN=C:\Path\To\node.exe"

if not exist "%REPO_DIR%\logs" (
  mkdir "%REPO_DIR%\logs"
)

echo [ %DATE% %TIME% ] Starting ghostAutoPublish from Task Scheduler... >> "%LOG_FILE%" 2>&1
pushd "%REPO_DIR%"
"%NODE_BIN%" src\index.js >> "%LOG_FILE%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"
echo [ %DATE% %TIME% ] ghostAutoPublish exit code: %EXIT_CODE% >> "%LOG_FILE%" 2>&1
popd
exit /b %EXIT_CODE%
```

Hardening points:

- Uses absolute paths and ensures `logs\` directory exists.
- Sets working directory to repo root before running Node.

### 5.2 Platform Detection

- In `src/scheduler.js`:

```js
const platform = process.platform;
// 'darwin' → macOS (Unix cron)
// 'linux'  → Linux (Unix cron)
// 'win32'  → Windows (Task Scheduler)
```

- Based on this map, the Admin UI shows:
  - “macOS (user crontab)” for `darwin`.
  - “Linux (user crontab)” for `linux`.
  - “Windows (Task Scheduler)” for `win32`.
- Any other platform:
  - Show as “Unsupported platform for automatic scheduling; only manual instructions are available”.
  - Provide a copy‑paste command but do not attempt to install.

### 5.3 Unix (macOS/Linux) Implementation

#### 5.3.1 Identifying and managing the cron entry

- Use the user’s crontab only:
  - Read current entries: `crontab -l` (handle “no crontab for user” case).
  - Write updated entries: pipe new content to `crontab -`.
- Each cron entry inserted by the Admin UI is tagged with a unique marker comment:

```cron
# BEGIN ghostAutoPublish (managed by Admin UI)
*/30 * * * * "/absolute/path/to/bin/run-ghostautopublish.sh"
# END ghostAutoPublish
```

- When updating:
  - Remove any existing block between `BEGIN` / `END` markers.
  - Insert exactly one new block (or none if disabling).
- This ensures:
  - No duplicates per user.
  - Easy detection, display, and removal.

#### 5.3.2 Translating ScheduleSpec → cron expression

- `daily`:
  - `minute hour * * *` (e.g., `30 6 * * *` for 06:30).
- `intervalHours`:
  - `0 */N * * *` (runs at minute 0 every N hours).
- `intervalMinutes`:
  - `*/N * * * *` (runs every N minutes).
- `customUnixCron`:
  - Use `customCronExpression` verbatim.
  - Validate with a light check:
    - 5 space‑separated fields.
    - Contains only allowed characters (`0-9 * / , -` etc.).
- All cron entries reference the wrapper script using:
  - Quoted absolute path `"${REPO_DIR}/bin/run-ghostautopublish.sh"`.

#### 5.3.3 Schedule status detection (Unix)

- To compute status:
  - Read current crontab.
  - Search for `BEGIN ghostAutoPublish` and `END ghostAutoPublish` markers.
  - If missing:
    - Status: “Disabled (no cron entry)”.
  - If present:
    - Parse the middle line:
      - Inspect the cron fields to infer `daily`, `intervalHours`, `intervalMinutes`, or `customUnixCron`.
      - Verify the command path matches this clone’s `bin/run-ghostautopublish.sh`.
        - If mismatched:
          - Mark as “Enabled (for a different clone / path)”.
- Present a user‑friendly summary in the Admin UI.

### 5.4 Windows Implementation (Task Scheduler)

#### 5.4.1 Task naming and location

- Use `schtasks` to create a user‑level scheduled task:
  - Task name: `"ghostAutoPublish - <sanitized-repo-folder-name>"`, e.g.:
    - `ghostAutoPublish - ghostAutoPublish`
- Task runs:
  - Command: full path to `bin\run-ghostautopublish.cmd`.
  - “Start in”: repo root directory (if supported by the chosen `schtasks` syntax).

#### 5.4.2 Translating ScheduleSpec → Task Scheduler parameters

- `daily`:
  - `schtasks /Create /SC DAILY /ST HH:MM /TN "<name>" /TR "\"C:\path\to\bin\run-ghostautopublish.cmd\"" ...`
- `intervalHours`:
  - Implement as `DAILY` with ` /RI N /MO 1 /SC HOURLY` where supported, or:
  - Use `/SC HOURLY /MO N` depending on the OS version supported; spec should choose a single, widely supported variant and note that small differences may exist.
- `intervalMinutes` (>=5):
  - Use `/SC MINUTE /MO N` where supported; otherwise, document limitations.
- `customUnixCron`:
  - Not shown on Windows; Admin UI hides this option for `win32`.

Implementation notes:

- Scheduler should generate a Windows‑safe command string with proper quoting for paths containing spaces.
- Repository root and `node.exe` paths are captured when the Admin UI runs and baked into the wrapper.

#### 5.4.3 Schedule status detection (Windows)

- Use `schtasks /Query /TN "<name>" /FO LIST`:
  - If task does not exist:
    - Status: “Disabled (no task found)”.
  - If task exists:
    - Parse schedule details (SC, ST, MO) into a human‑readable description matching `ScheduleSpec` where possible.
- When `applyWindowsSchedule()` runs:
  - If task exists:
    - Use `/Delete` then `/Create`, or `/Change` if appropriate.
  - On `removeWindowsSchedule()`:
    - Use `/Delete /F`.

### 5.5 Hardening Strategies

The job is considered “hardened” when the following are true:

- **Persistence across reboot**:
  - User crontab and Task Scheduler tasks survive OS restarts by default.
  - Spec assumes standard OS behavior; no special reboot handling is required beyond using these facilities.
- **Resilience to crashes**:
  - Each run is independent; if a run crashes, the next scheduled run will still trigger.
  - Wrapper scripts ensure failures are logged with timestamps and exit codes.
- **Protection against mis‑configuration**:
  - The Admin UI only ever writes scheduled jobs pointing to the current clone’s wrapper scripts.
  - The schedule status check warns if a found job points to a different repo path.
  - Custom cron expressions are lightly validated; obviously malformed entries are rejected.
- **Safety of credentials**:
  - No secrets or env vars are in the scheduled command or wrapper scripts.
  - All configuration continues to be loaded from `.env` via `src/config.js` at runtime.
- **Avoiding duplicate jobs**:
  - The Unix cron block is uniquely marked; only one block is allowed.
  - The Windows task uses a deterministic name per clone; the Admin UI updates rather than duplicates.

---

## 6. Error Handling & Edge Cases

- **No `crontab` command available (Unix)**:
  - Admin UI shows:
    - “Automatic cron management is not available on this system. Here is a cron line you can copy into your crontab manually: …”
  - Job is not automatically installed; status remains “Disabled”.
- **`schtasks` unavailable or fails (Windows)**:
  - Show command and error message, and treat as failure to enable schedule.
- **Invalid time or interval entries**:
  - The Admin UI re‑prompts until values are within ranges:
    - `0 ≤ hour ≤ 23`
    - `0 ≤ minute ≤ 59`
    - `intervalHours ≥ 1`
    - `intervalMinutes ≥ 5`
- **Invalid custom cron expression**:
  - Reject with a clear message:
    - “Custom cron expressions must have 5 fields, e.g. `*/30 * * * *`.”
- **Wrapper script path or `node` binary changes**:
  - When schedule is updated via the Admin UI, wrapper scripts are regenerated with current paths.
  - The Status view warns if the currently installed job references a missing or outdated script path.
- **Multiple clones on the same machine**:
  - Each clone has its own:
    - Wrapper scripts with a distinct absolute `REPO_DIR`.
    - Unix cron block referencing a unique path.
    - Windows task with a name that includes the repo folder name.
  - Admin UI always manages only the job for the current clone.

---

## 7. Security Considerations

- Never put API keys or secret values into:
  - Cron lines.
  - Wrapper scripts.
  - Windows Task Scheduler command line.
- All secrets remain in `.env`, which is:
  - Loaded at runtime by Node (`dotenv` in `src/config.js`).
  - Kept in `.gitignore` as per existing specs.
- The Admin UI should:
  - Show the scheduled command only with paths and filenames, not environment variable contents.
  - Warn users not to place `.env` or logs in publicly synced folders without understanding the risk.

---

## 8. Acceptance Criteria

The scheduling UI work is considered complete when:

1. **Admin UI integration**
   - `npm run admin` shows a “Manage schedule / automation” menu item.
   - From there, users can:
     - View current schedule status.
     - Enable or change schedule.
     - Disable schedule and remove jobs.
     - Show platform‑specific details/debug.

2. **Cross‑platform behavior**
   - On macOS and Linux:
     - The tool uses the user’s `crontab` with clearly marked `BEGIN/END ghostAutoPublish` block.
     - The cron entry runs `bin/run-ghostautopublish.sh` with absolute paths.
   - On Windows:
     - The tool creates/updates/deletes a Task Scheduler task named `ghostAutoPublish - <repo>` that runs `bin\run-ghostautopublish.cmd`.
   - On unsupported platforms:
     - The Admin UI clearly states that automatic schedule installation is not supported and shows manual instructions instead.

3. **Persistence and hardening**
   - After enabling a schedule:
     - The scheduled job remains in place after OS restart (verified by manual reboot tests or simulation).
     - Each run appends logs to `logs/cron.log` with timestamps and exit codes.
   - If the Node program exits non‑zero, the error is logged but does not break future scheduled runs.

4. **Correctness of schedule mapping**
   - For each supported schedule type:
     - The actual cron expression / Windows task interval matches the summary displayed in the Admin UI.
   - Changing the schedule via Admin UI updates the underlying job without leaving orphaned entries.

5. **Clean disable behavior**
   - Disabling the schedule:
     - Removes the cron block or Task Scheduler task.
     - Optionally leaves wrapper scripts but clearly marks schedule as “Disabled”.

6. **No secrets in jobs**
   - Inspections of `crontab -l`, wrapper scripts, Task Scheduler properties, and `logs/cron.log` show no API keys or other secrets.

When these criteria are met, `cronSetupTechnicalSpec.md` is satisfied and can be used as the implementation blueprint for the Cron/Schedule Setup UI.

---

## Assumptions

- Node.js version and environment:
  - Node ≥ 18 is available and consistent across Admin UI and scheduled runs.
- OS tools:
  - macOS/Linux environments provide `crontab` for per‑user cron.
  - Windows environments provide `schtasks.exe`.
- Users run `npm run setup` and have a valid `.env` before enabling the schedule, or at least accept warnings if they don’t.
- Admin CLI (`npm run admin`) and shared helpers from previous specs are implemented or will be implemented as described in those specs.

