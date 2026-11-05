# PipPrep

PipPrep is an independent CELPIP-General Reading and Writing practice app. Take a 38-question Reading mock, practice an email or survey response, or complete both Writing tasks in 53 minutes. Starter practice works without AI credentials. App copy, original exercises, and AI feedback use American English in Canadian settings.

## Run locally

Install Node.js 24.15 or later and pnpm, then run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [PipPrep](http://127.0.0.1:4175).

Choose timed or untimed practice. In a timed attempt, the server keeps the deadline even if you close the tab. Answers, completed attempts, and coaching are saved in SQLite. The browser uses a private cookie to reopen its study record. Keep using the same browser and address to access that record.

For fresh tests, Writing level estimates, and coaching, install either the Codex CLI or Claude Code CLI and sign in with `codex login` or `claude auth login`. Start PipPrep from a terminal that can run the installed CLI. Above the theme toggle in the sidebar, choose which CLI to use. PipPrep checks both installations and their sign-in status, and remembers your choice in a private browser cookie. With no saved choice, it selects a signed-in CLI, preferring Codex when both are ready. Online means installed and signed in; status checks do not make model requests or verify network access or remaining usage. Use Refresh after installing or signing in. Status also refreshes every 30 seconds and when you return to the app.

All fresh tests, coaching, and Writing assessments use the selected CLI. Generated material and submitted answers or writing responses needed for feedback are sent to that provider. Your CLI account's billing and usage limits apply. Sign in with your subscription account to use its allowance; API-key logins use that account's API billing. Changing the selection affects new requests; running jobs keep their original CLI, shown in Background activity. PipPrep never switches providers automatically after an explicit choice. If a generated mock fails, retry the same settings and provider within 15 minutes to reuse the parts that already passed validation.

CLI checks run on the computer hosting PipPrep. If you open a self-hosted instance from another device, the sidebar shows the host's CLIs.

## Writing practice

Open Writing in the sidebar. Choose a full mock or a single task, use starter or AI-generated prompts, then select timed or untimed mode. The email has 27 minutes and the survey response 26 minutes. Each task targets about 150–200 words. Drafts autosave; wait for “Saved” before leaving. Timers keep running outside the app, and tasks lock when submitted or expired. Each tab keeps its own browser backup, which can recover unsaved text after a reload without changing a locked submission. Closing the tab clears its unsaved backup; saved responses remain in SQLite.

After submission, the results show an estimated Writing score range out of 12 for full assessable mocks, or an estimated task score for single-task drills. Each task's score also appears in the breakdown and response review. The evaluator uses the CELPIP writing skill for scoring and feedback across all four writing dimensions, requirement coverage, exact-text corrections, an illustrative revision, and prioritized practice actions. These are practice estimates, not official or verified CELPIP scores. With AI disabled, submitted responses and word counts remain available in Attempt history. Enable AI and reload a review to request feedback later.

The evaluator uses the repository’s [CELPIP writing skill](.agents/skills/celpip-writing/SKILL.md), bundled into the server build. See [Writing research notes](writing.md) for current official sources and scoring limitations.

## Study rooms

Open **Study rooms** to host a session with up to 12 participants. Create a room with your display name and share its invite link. Friends join on the host's PipPrep using that link or its eight-character room code. If they have their own local installation, they can paste the full invite link into **Join friends** to open the host's instance. A code alone only resolves rooms on the instance where it is entered.

The host chooses Reading or Writing, a full mock or any individual section, starter or generated material, and timed or untimed practice. A generated test is created once for the entire room. Everyone marks themselves ready, then the host starts separate attempts at the same server timestamp. Click **Open my test** to take it. Status updates every few seconds show who is still reading or writing and who has submitted. Once everyone finishes, compare overall scores, section scores, and time. The host can end an abandoned test, remove members between tests, prepare another round, or close the room.

Each participant's answers and writing remain private. Shared scores appear after all attempts finish. Writing scores are AI practice estimates and appear after participants open their own reviews for assessment. With AI off, Writing practice still saves responses but shows no estimated level. Tests and feedback use the host's provider selected when the shared test was prepared. Local CLI billing and usage limits apply to the host. Room records and attempts persist in the host's SQLite database; generation interrupted by a server restart must be retried. Keep the same browser and host address to retain your room identity. Participants must finish or discard an existing attempt in the same skill before a room test can start.

### Host through ngrok

Install and authenticate the [ngrok agent](https://ngrok.com/docs/getting-started/), then run:

```sh
pnpm host:room
```

This builds PipPrep, starts an ngrok tunnel with request inspection disabled, and runs the built server on `127.0.0.1:4175` with the public origin configured. Open the local `/rooms` address printed in the terminal, create a room, and copy its public invite link. Stop any existing server on that port first, or choose another with `PORT=4176 pnpm host:room`. Press Ctrl+C to stop both the tunnel and server. Friends only need a browser. The host's computer must stay awake and online. ngrok account limits apply.

To use a tunnel you already started, build the app and set the public origin explicitly:

```sh
pnpm build
READLINE_ORIGIN=https://your-domain.ngrok.app HOST=127.0.0.1 PORT=4175 pnpm start
```

Localhost remains available for the host while friends use the HTTPS address. Sessions on localhost and the public address are separate, so use one address consistently. Share the tunnel only with trusted friends: it exposes the ordinary PipPrep app as well as rooms, including its personal CLI integrations. Room host permissions control shared tests; this is not a public service with account-level access controls.

## Build and run

```sh
pnpm build
HOST=127.0.0.1 PORT=4175 pnpm start
```

| Environment variable | Effect |
| --- | --- |
| `READLINE_DB` | Path to the SQLite file. Defaults to `data/readline.sqlite`. |
| `READLINE_AI=off` | Runs starter practice and answer review with AI disabled. |
| `READLINE_CODEX` | Path to a Codex executable. Defaults to `codex` on your PATH. |
| `READLINE_MODEL` | Optional model override for Codex. |
| `READLINE_CLAUDE` | Path to a Claude Code executable. Defaults to `claude` on your PATH. |
| `READLINE_CLAUDE_MODEL` | Optional model override for Claude Code. |
| `READLINE_ORIGIN` | Canonical origin for deployments behind a proxy, such as `https://pipprep.example.org`. |

For self-hosting, set `READLINE_ORIGIN` to the public address and run the Node build with a persistent volume for SQLite. Use `READLINE_AI=off` on a public instance until you have a hosted AI provider and an access policy for model usage. The local CLI integrations are intended for personal use.

## Contribute

The React UI uses TanStack Start file routes. SQLite uses Node's built-in driver. The schema is versioned in `src/server/store.server.ts`, and the server creates the database on first use.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Use `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e` to run the browser tests with an existing Chrome installation. Tests use a temporary SQLite database.

See the [Reading research notes](reading.md) for the format, timing, scoring, and official sources. The code is licensed under [MIT](LICENSE).
