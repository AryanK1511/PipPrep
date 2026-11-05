# PipPrep

PipPrep is an independent CELPIP-General Reading and Writing practice app. Take a 38-question Reading mock, practise an email or survey response, or complete both Writing tasks in 53 minutes. Starter practice works without AI credentials.

## Run locally

Install Node.js 24.15 or later and pnpm, then run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [PipPrep](http://127.0.0.1:4175).

Choose timed or untimed practice. In a timed attempt, the server keeps the deadline even if you close the tab. Answers, completed attempts, and coaching are saved in SQLite. The browser uses a private cookie to reopen its study record. Keep using the same browser and address to access that record.

For fresh tests, Writing level estimates, and coaching, install the Codex CLI and sign in with `codex login`. Start PipPrep from a terminal that can run `codex`. Codex receives the generated practice material and submitted answers or writing responses needed for coaching. Your Codex account's usage limits apply. If a generated mock fails, retry the same settings within 15 minutes to reuse the parts that already passed validation.

## Writing practice

Open Writing in the sidebar. Choose a full mock or a single task, use starter or AI-generated prompts, then select timed or untimed mode. The email has 27 minutes and the survey response 26 minutes. Each task targets about 150–200 words. Drafts autosave; wait for “Saved” before leaving. Timers keep running outside the app, and tasks lock when submitted or expired. A browser backup can recover unsaved text without changing a locked submission.

After submission, AI feedback covers all four writing dimensions, requirement coverage, exact-text corrections, an illustrative revision, and prioritized practice actions. Full assessable mocks receive an estimated practice level range; drills receive task feedback. This is not an official or verified CELPIP score. With AI disabled, submitted responses and word counts remain available in Attempt history. Enable AI and reload a review to request feedback later.

The evaluator uses the repository’s [CELPIP writing skill](.agents/skills/celpip-writing/SKILL.md), bundled into the server build. See [Writing research notes](writing.md) for current official sources and scoring limitations.

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
| `READLINE_ORIGIN` | Canonical origin for deployments behind a proxy, such as `https://pipprep.example.org`. |

For self-hosting, set `READLINE_ORIGIN` to the public address and run the Node build with a persistent volume for SQLite. Use `READLINE_AI=off` on a public instance until you have a hosted AI provider and an access policy for model usage. The current Codex integration is intended for personal use.

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
