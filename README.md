# PipPrep

PipPrep is an independent CELPIP-General practice app. Reading is the first skill available. Take a 38-question mock or drill a single part, then review the evidence behind each answer. The starter mock works without AI credentials.

## Run locally

Install Node.js 24.15 or later and pnpm, then run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [PipPrep](http://127.0.0.1:4175).

Choose timed or untimed practice. In a timed attempt, the server keeps the deadline even if you close the tab. Answers, completed attempts, and coaching are saved in SQLite. The browser uses a private cookie to reopen its study record. Keep using the same browser and address to access that record.

For a fresh test and coaching, install the Codex CLI and sign in with `codex login`. Start PipPrep from a terminal that can run `codex`. Codex receives the generated practice material and submitted answers needed for coaching. Your Codex account's usage limits apply. If a generated mock fails, retry the same settings within 15 minutes to reuse the parts that already passed validation.

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
