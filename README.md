# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
a morning digest of what ran overnight. Requires Node.js 22+ and pnpm.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Morning digest

- `/` links every night on disk with its valid ok / retry / fail event counts.
- `/digest/2026-10-28` renders one row per job, sorted by job name.
- `/api/digest/2026-10-28` returns the same digest as JSON: `night`, `rows`, `badLines`, and `counts`.

Rows contain the latest owner, run and retry totals, last status, last observed error, and
first/last timestamps. Events are ordered by timestamp; equal-time events retain file order.
Displayed timestamps keep their original offsets. A recovered job retains its last observed
error. Missing owners and errors display as `—`; retries of three or more and failures are marked.
Counts describe log events, not final job states.

Malformed JSON or invalid records are counted without aborting the digest. Empty files render
“nothing ran”; missing or invalid nights return 404. `runs/` contains read-only sample fixtures.

## Verification

```sh
pnpm test
pnpm typecheck
```

The reader tests cover the supplied five-job night and malformed-line count. Route tests use
temporary directories for HTML/JSON agreement, missing/empty nights, warnings, null owners,
preserved offsets, and traversal protection.

## Review copies

While rig is running, export the page with a command, saving it outside the repository:

```sh
curl --fail http://localhost:8787/digest/2026-10-28 --output ../digest-review.html
```

Publish only that self-contained HTML copy to an approved, overwritable HTTPS host. Never commit
the copy or `.env`, and never paste marked HTML into issues or chat attachments. Once review is
received, restart rig with `LANE_MARKER` unset, export again, and replace the same public URL.
Verify the banner reads “no marker set” before archiving the plan.
