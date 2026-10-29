---
plan: morning-digest
status: done
owner: rook
opened: 2026-10-29
closed: 2026-10-29
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the reviewer has looked at the public preview and confirmed the review, not merely received its link.

## 4. Clean up

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.

## Issues

| # | Issue | Blocked by | Worker | Closed |
|---|-------|------------|--------|--------|
| [1](https://github.com/pizang/mega-s01e04-before-i-looked/issues/1) | Reader and shared types | — | omp · gpt-6.1-sol · auto | 2026-10-29 |
| [2](https://github.com/pizang/mega-s01e04-before-i-looked/issues/2) | Digest HTML page | #1 contract | omp · gpt-6.1-sol · medium | 2026-10-29 |
| [3](https://github.com/pizang/mega-s01e04-before-i-looked/issues/3) | Digest JSON endpoint | #1 contract | omp · gpt-6.1-sol · medium | 2026-10-29 |
| [4](https://github.com/pizang/mega-s01e04-before-i-looked/issues/4) | Board links and event counts | #1 contract; #2 integration | omp · gpt-6.1-sol · medium | 2026-10-29 |
| [5](https://github.com/pizang/mega-s01e04-before-i-looked/issues/5) | Digest route tests | #1 contract; #2, #3 integration | omp · gpt-6.1-sol · auto | 2026-10-29 |
| [6](https://github.com/pizang/mega-s01e04-before-i-looked/issues/6) | Public review preview | #2, #3, #4, #5 | omp · gpt-6.1-sol · not recorded | 2026-10-29 |
| [7](https://github.com/pizang/mega-s01e04-before-i-looked/issues/7) | Remove marker and archive plan | #6 review confirmation | omp · gpt-6.1-sol · not recorded | 2026-10-29 |

All workers resolved to `openai-codex/gpt-6.1-sol`; the table does not imply cheaper-model routing.
`auto` records the configured effort policy, not an unrecorded resolved level.
The reader's shared contract was committed before the four section-2 workers started in separate worktrees.

Issue #6 was reopened after premature closure. Its final closure followed explicit reviewer confirmation,
not link submission. After separate human approval, the HTML was regenerated with `LANE_MARKER` unset
and replaced at the same public URL. The public response matched the clean export exactly, showed
“no marker set,” and contained no old lane marker. No preview HTML or `.env` was committed.

Verification: 22 tests passed across three files; TypeScript checking passed. Chrome checks covered
both board links, five sorted jobs, one bad line, null-owner display, retry/failure warnings,
HTML/JSON agreement, preserved offsets, and no client scripts. Sample fixture SHA-256 hashes were unchanged.

