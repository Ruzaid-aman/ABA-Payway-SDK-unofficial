# Release checklist

The checkout is a development baseline, not a published release. See [release readiness](RELEASE-READINESS.md) for fresh evidence and outstanding gates. Publication, tags, history rewriting, and credential rotation require explicit maintainer action.

## Public repository gate

- [ ] Review a redacted full-history secret scan of all refs. Resolve genuine findings by provider-side rotation/revocation and an approved history disposition; deleting files in HEAD is insufficient.
- [ ] Review tracked source, archives, boilerplate, audit notes, screenshots, and correspondence for customer data and redistribution rights. An MIT license on this project does not establish permission for third-party material.
- [ ] Confirm the destination repository/organization, ownership metadata, issue tracker, and monitored security mailbox.
- [ ] Configure the remote, branch protection, secret scanning, and push protection. Keep production credentials out of contributor CI.

## Reproducible validation

Use a clean checkout without `.env`, saved profiles, captured payments, or prebuilt `dist`. CI tests Linux/Windows with Node 22.12.0, Node 22, and Node 24.

Run build-dependent checks sequentially in one checkout, or use separate workspaces. The reference-app setup runs a clean SDK build and can remove `dist` while CLI tests are executing.

```bash
npm ci
npm run build
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run docs:api
npm run check:package
npm run check:public-docs
npm run check:repository
npm run smoke:package
npm --prefix examples/first-payment run setup
npm --prefix examples/first-payment run typecheck
npm run smoke:example
```

- [ ] All hosted CI jobs are green on the exact candidate commit. Local Windows results cannot replace the Linux matrix or hosted secret scan.
- [ ] Record conditional sandbox verification for changed gateway contracts, or explain the limit. Never place raw captures in public release notes.

## Version and documentation

- [ ] Select a new major release version: the Node 22.12 minimum breaks the old Node 20 support promise. `1.5.0` remains the unpublished baseline until this step; do not republish it with new behavior.
- [ ] Update package.json and lockfile together, move Unreleased entries into dated release notes, rebuild, and rerun package smoke.
- [ ] Confirm the GitHub destination matches package metadata. Pin public README/quickstart/reference links to the new release tag; verify local targets before tagging and actual HTTP links after the authorized push.
- [ ] Create a new immutable tag only after approval. Never move existing tags.

## Publish and verify

- [ ] Confirm npm account/package ownership and package-name availability at release time.
- [ ] Inspect `npm pack --dry-run --json`. The allowlist includes runtime/declaration files, 34 skills, README, QUICKSTART, CHANGELOG, LICENSE, knowledge corpus, llms.txt, and package metadata. Run `check:package`; do not rely on a hardcoded export count.
- [ ] Prefer [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) with OIDC and provenance from an approved tag workflow. Configure the npm trust relationship and GitHub environment before enabling publication.
- [ ] Publish only after the repository, history, ownership, support, and CI gates are cleared.
- [ ] Install the published package in a fresh consumer; verify ESM/CJS/types, `npm exec -- payway-sdk --help`, and `npm exec -- payway-sdk demo --check`.
- [ ] Verify the published version, source tag, provenance, documentation links, and issue/security channels.

Never use bare `npx payway-sdk` to verify this package. The binary is shipped by `aba-payway-ts`.
