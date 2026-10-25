# Objectle!

A daily five-question courtroom game teaching the Federal Rules of Evidence.

## Local setup

Use Node.js 24. Run `npm ci`, `cp .env.example .env`, `npm run schedule:build`, then `npm run dev`. Vite runs on port 5173 and proxies `/api` to port 3001. Node loads `.env` automatically; exported shell values take precedence. SQLite is created in `data/objectle.sqlite`. No account is required. The default development configuration serves unreviewed educational drafts.

## Commands

- `npm run build`: build the React application into dist.
- `npm start`: serve the built application and API together.
- `npm run typecheck`, `npm test`, `npm run test:e2e`: TypeScript, Vitest and Playwright checks.
- `npm run content:validate`: schema, uniqueness, distributions and minimum 900 scenarios.
- `PARTIAL=true npm run content:validate`: per-batch structural validation while authoring.
- `npm run content:report`: difficulty, concept, answer and review counts.
- `npm run content:review`: interactive human approval CLI; y approves, Enter skips, q quits.
- `npm run schedule:build`: deterministic 180-day schedule. Requires 900 approved scenarios unless development ALLOW_UNREVIEWED=true.

## Configuration

`LAUNCH_DATE` defaults to 2026-10-24; `RESET_TIMEZONE` to America/New_York. The server chooses calendar dates and supplies nextResetAt, including DST transitions. `ALLOW_UNREVIEWED=true` works only outside production. `NODE_ENV=production` enforces reviewed content and secure cookies. `PORT` defaults to 3001, `DATABASE_PATH` to data/objectle.sqlite and `CORS_ORIGIN` to http://localhost:5173. Career rank thresholds live in server/config.ts.

The schedule samples without replacement with seeded daily difficulty draws. Days outside the 180-day stock return an unavailable response. Extend content and schedule before stock runs out. Changing the schedule after launch can change unstarted puzzles; existing sessions retain their IDs.

## API

JSON requests use an HttpOnly sid cookie; include browser credentials. Each question payload omits rulings until answered.

| Route | Request and response |
|---|---|
| GET /api/today | date, puzzleNumber, difficulty, questions, sessionId, answers, completed, result, nextResetAt |
| POST /api/answer | `{sessionId,questionId,answer}`; correctness, correctOption, explanation, rule, trap_note, concept_tag |
| GET /api/archive?date=YYYY-MM-DD | Past docket; today and future dates rejected |
| POST /api/practice | `{tag}`; archive scenarios for a weak concept |
| POST /api/submit-daily | `{sessionId}`; finalize completed daily/archive/practice round and return results |
| GET /api/stats | streak, longestStreak, careerCorrect, careerRank, concepts |
| POST /api/handle | `{handle}`; unique handle and one-time recoveryToken |
| POST /api/handle/recover | `{recoveryToken}`; restore identity cookie |
| GET /api/leaderboard?type=today\|streak\|longest\|alltime | ranked entries |
| GET /api/health | liveness response |

The server checks answers, enforces order, saves them transactionally, and computes scores itself. Completed daily rounds are unique per identity/date. Finalization is idempotent. Expired uncompleted daily sessions cannot be scored. Archive and practice affect concept accuracy only. A session cookie persists progress across refreshes. Anonymous statistics are also mirrored locally by the client. Recovery tokens are hashed in SQLite; store the displayed token safely. Handle creation preserves anonymous progress. Recovery restores the existing identity rather than merging separate histories.

Completion time is elapsed server time including pauses. This casual leaderboard does not verify real identities: clearing cookies permits another anonymous identity. Random option order uses a persisted server-only HMAC secret, preventing public session IDs from exposing answers.

## Deployment

Use Docker or `npm ci && npm run build`, then `npm start` on Render, Fly or Railway. Configure NODE_ENV=production, HTTPS, exact public CORS_ORIGIN and a persistent volume at /app/data. Keep one instance for SQLite. For horizontal scaling, replace server/repository.ts with PostgreSQL operations preserving transactions and unique constraints. Use SQLite's backup API or stop writes before filesystem backups. Health checks use /api/health. Do not include `.env` or data in images.

Before public launch, an evidence-law reviewer must approve the content and generate a production schedule. All generated scenarios begin reviewed:false; production deliberately refuses to serve them. Review flags and schema validation do not establish legal accuracy. Human review should check every scenario and near-duplicate patterns, especially difficult and No objection rulings.

Educational game based on the Federal Rules of Evidence. Not legal advice. Rules vary by jurisdiction.

## Download and recovery

The source is backed up on the `main` branch at https://github.com/zekrom011/objectle. Use **Code → Download ZIP**, extract it, and follow [the step-by-step local guide](docs/download-and-run.md). Cloud environment scripts are setup instructions, not source backups.

Verification of this rebuild: production bundle and TypeScript checks pass; 17 unit/API tests and 2 Chromium end-to-end tests pass. The 900-entry content bank is an unreviewed editorial draft. Structural uniqueness and correct distributions do not establish legal accuracy or substantive diversity. See the content audit before public release.

Browser tests use `/usr/bin/chromium` in this cloud environment. On another system, set `CHROMIUM_PATH` to your installed Chromium executable before `npm run test:e2e`.

## Courtroom interface and October bonus archive

Gameplay places the case context, judge, counsel, witness, transcript, and responses in one courtroom view. Standard desktop and mobile layouts are tested for visibility before and after a ruling; small screens or enlarged text can scroll rather than clip controls.

October 2026 has a separate bonus archive: 31 extra dockets with 155 new scenarios, open immediately from **Case files**. These dates are bonus labels, not access to future daily questions. Existing daily IDs and the 180-day schedule are preserved. Bonus play contributes to concept practice statistics but never streaks, career rank, or leaderboards. All additional content starts unreviewed and uses the same production approval gate.

- `GET /api/bonus-archive/dates` lists available bonus dates.
- `GET /api/bonus-archive?date=2026-10-31` opens that bonus docket with no answer leakage.
- `npm run content:validate`, `content:report`, and `content:review` cover the extra bank as well as daily content.

For an existing Windows ZIP installation, follow [the update guide](docs/updating-on-windows.md) to preserve settings and player data.
