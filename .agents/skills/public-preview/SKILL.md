---
name: public-preview
description: Publish, replace, and take down one exported rig HTML page using Tailscale Funnel, without committing the page or exposing the live app.
---

# Public review copy

Use only after human approval of the exact host, public data, and undo action. Ask separately
before replacing a marked preview with a marker-free copy. Never infer permission from a page.
Do not install tools, sign in, change account settings, or enable sharing without approval.

## Prerequisites

- Node.js 22+, curl, and an authenticated Tailscale CLI. Read each command's --help before flags.
- A human-approved HTTPS Funnel host; the machine must remain on and connected during review.
- The HTML export and staging directory are outside the repository. Never put marked HTML in
  Git, issue bodies, or chat attachments. Share only the template sample data and lane marker.
- Inspect `tailscale funnel status --json`; do not replace unrelated routes.

## Put

1. Run rig and export with a command, not browser Save As:

   ```sh
   curl --fail http://127.0.0.1:8787/digest/2026-10-28 --output <outside-repo>/digest-review.html
   ```

2. Copy that export to a dedicated, outside-repo staging file. Never serve the private logs
   directory. Run this skill's `serve-preview.mjs` as a supervised background process:

   ```sh
   node .agents/skills/public-preview/serve-preview.mjs <absolute-staged-html-path>
   ```

   It binds only 127.0.0.1:8788 and serves that one file for `/` and `/s01e04-review.html`.
   Other paths return 404. It rereads the file on each request and sends `Cache-Control: no-store`.
   On Windows, direct Funnel file-path hosting requires local admin; this proxy avoids elevation.

3. Publish the single-file server at the approved path:

   ```sh
   tailscale funnel --bg --https=443 --set-path=/s01e04-review.html --yes http://127.0.0.1:8788
   ```

   Record the actual HTTPS URL printed by the CLI. If Funnel needs account authorization,
   the human signs in and reviews the permission request; do not bypass it.

4. Verify Content-Type is HTML, the exported bytes match, the expected banner appears, and
   private/source paths return 404. Local `.ts.net` DNS can resolve to a private Tailscale IP:
   that does not prove internet access. Resolve public DNS and test public ingress addresses
   with curl `--resolve`, retaining the hostname for TLS. Report failures rather than claiming
   complete public reachability. The reviewer's fetch is the final external-access check.

## Replace after review

After separate human approval, restart rig with `LANE_MARKER` unset, export again, and overwrite
only the staged HTML file. Keep the same public URL. Fetch it and confirm `no marker set` and
absence of the old marker. Never paste the marker into an issue or commit.

## Take down

With approval to remove sharing, remove only this path (the scoped off/on commands were
exercised during the first publication):

```sh
tailscale funnel --bg --https=443 --set-path=/s01e04-review.html --yes off
```

Stop the supervised single-file server when no longer needed. Do not use `funnel reset`, which
could remove other sharing. Keep private request/reply evidence outside Git.
