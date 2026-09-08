# Stash backups (2026-09-08, "merge all to main" sweep)

All three old stashes were evaluated against main@b12e301 and dropped after
backup. Every ref still exists in the object DB until GC; the patches below
capture the full tracked diffs, and stash0's untracked files are in the tar.

- stash0 (bae5cb8, DX notes): untracked = example package-lock (deliberately
  gitignored by examples/first-payment/.gitignore — machine-specific tarball
  hash; see its comment) + a temp-options dump. Superseded.
- stash1 (1c2742c, "unfinished CLI merge repair"): fully superseded — its
  four functions (selectedProfileName/structuredError/basePaymentResult/
  applyPollResult) and modules (cli/output.ts, cli/qr-artifact.ts) shipped
  via the DX campaign. Salvageable: none.
- stash2 (40277d2, Aug-26 WIP): three features SALVAGED into commit b12e301
  (inspectKhqrPayload/validateKhqrCrc/khqrCrc16 + offline self-check display
  + renderQrToPngBuffer + offline PNG save). The remaining hunks (old
  payout-entry validation, pre-audit skill text, old frontmatter test regex)
  deliberately NOT ported — they conflict with the F02–F13 audit fixes.

Recover a full stash object: `git stash apply <sha-from-*.txt>` (reflogs keep
the commits reachable for ~90 days).
