# Webhook receiver run — findings, challenges, next iteration

Date: 2026-09-15. Goal: stand up a public HTTPS callback URL for ABA to configure so we
can observe the Customer-Module payment notification format when a customer pays a
static portal QR.

## Outcome

Listener is running in the background and verified end-to-end:

- Public URL: `https://red-major-tiny-waves.trycloudflare.com/aba-payway-webhook`
- Local listener: `http://localhost:8443/aba-payway-webhook` (PID 36992)
- `.env` upserted: `PAYWAY_CALLBACK_URL=https://red-major-tiny-waves.trycloudflare.com/aba-payway-webhook`
- Probe POST through the tunnel returned `HTTP 200 {"acknowledged":true,"id":"wh_mu2k82fu_540bb230"}`
  — the public URL really reaches the capture server.

## What I tried (chronological)

1. **First background start** — `Start-Process npx.cmd … setup-webhook --tunnel --port 8443`
   with stdout/stderr redirected to a temp log, then polled the log for the tunnel URL.
   - **Did NOT work.** The tunnel established and the log printed a URL, but then the
     listener failed with `Port 8443 is busy. Please free the port.` and the process hung
     on that interactive prompt in the hidden window. The dead URL had already been
     written to `.env` as `PAYWAY_CALLBACK_URL`.
2. **Diagnosis** — `Get-NetTCPConnection -LocalPort 8443 -State Listen` showed PID 33008;
     `Get-CimInstance Win32_Process` revealed an **orphaned `setup-webhook` node.exe from a
     previous session** still listening on 8443. (Same failure class as the documented
     orphan `cloudflared.exe` in `.scratch/aof-cycle/STATE.md`.)
3. **Cleanup** — `Stop-Process` on the orphan, then a cmdline-pattern sweep
   (`node|cloudflared` + `setup-webhook|tunnel --url`) killed **9 processes** — the leftover
   listener, my stuck attempt's process tree, and stray cloudflareds. This worked but was
   over-broad and manual; on another machine it could kill an unrelated receiver.
4. **Second start** — port free; fresh tunnel `red-major-tiny-waves`; listener bound;
   health probe through the public URL returned 200 with a real capture id.

## Challenges / what did NOT work

- **No pre-flight port check.** `setup-webhook` starts the tunnel and upserts `.env`
  **before** binding the listener. A busy port therefore leaves a dead URL propagated to
  `.env` and advertised as the ready callback URL — exactly the wrong thing to hand the ABA
  team (their callback would 502 when tested).
- **Non-TTY runs block on "port busy" prompt.** In a hidden window the command does not exit
  or fail fast; it sits forever at `? Port 8443 is busy. Please free the port.`, holding its
  spawned tunnel open. No `--yes`/fail-fast mode for CI/agents.
- **Windows orphan accumulation.** A prior session's detached `setup-webhook` survived
  (parent killed, children leaked). Graceful Ctrl+C never runs under `Stop-Process -Force`,
  so the `.env` restore and cloudflared teardown don't happen. This is the root cause of the
  9-process sweep.
- **Process-tree PID tracking.** `Start-Process` on `npx.cmd` gives an `npx`/`cmd` PID whose
  children (node + cloudflared) are separate; killing the npx PID is a no-op for the tree.

## Plan for next iteration

1. **Pre-flight port check** in `setup-webhook`: refuse to start (or bind first) when the
   port is occupied — before the tunnel spawns and before `.env` is touched.
2. **Fail-fast non-TTY prompt handling:** top-level prompts (e.g. "port busy") must exit
   non-zero on a non-TTY/hidden run instead of hanging; add a `--yes`/CI escape hatch.
3. **Single-command cleanup:** a `setup-webhook --stop` / `webhook stop` (or `doctor`
   subcommand) that finds the owner of the configured port via cmdline match and kills the
   **whole tree** (`taskkill /PID <pid> /T /F` on Windows, process-group kill on POSIX) and
   restores the prior `.env` value — replacing the manual sweep.
4. **Self-check before "ready":** after the tunnel is up, probe the public URL once
   (expect `acknowledged:true` + capture id) before declaring the URL ready / upserting `.env`.
5. **Ephemeral-URL + provisioning guards:** visibly warn that trycloudflare URLs are
   ephemeral and ABA provisioning is a support-ticket change; recommend `--url` (durable)
   for anything that outlives the session; keep tunnels for sandbox verification only.
6. **Background-run recipe in the skill:** per-OS instructions to start detached with logs
   and to stop cleanly, so a future run starts from a known-clean state.

## Skill improvements applied (skills/aba-payway-webhook-production/SKILL.md)

See the updated `## Running the Receiver (Background / Repeated Runs)` +
`## Troubleshooting` sections — covering pre-flight port checks, the fail-fast prompt
behavior, clean tree teardown, and the health probe before sharing a URL with ABA.