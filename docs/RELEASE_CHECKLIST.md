# Release Checklist

Use this checklist for every user-facing release to ensure the SDK is correctly validated and documented.

## Pre-Release Validation

- [ ] Run the full test suite:

```bash
npm test
```

- [ ] Run lint and typecheck:

```bash
npm run lint
npm run typecheck
```

- [ ] Verify documentation links and examples.

- [ ] Verify the npm and generated-docs boundaries:

```bash
npm run check:package
npm run docs:api
npm run check:public-docs
npm run smoke:package
```

The package check requires `LICENSE`, `CHANGELOG.md`, `QUICKSTART.md`, runtime/declaration files, and all 30 skill guides. It rejects source maps, internal evidence paths, logs, raw artifacts, private keys, and local-machine paths. The docs check rejects copied investigation files and local-machine references.

- [ ] Confirm new or changed API behavior is documented in `README.md` and relevant `docs/` chapters.
- [ ] If CLI commands were added or changed, rebuild the CLI and verify `--help` output:

```bash
npm run build
node dist/cli.js --help
```

## Sandbox Verification

Use environment variables for sandbox credentials.

```bash
PAYWAY_MERCHANT_ID="$PAYWAY_MERCHANT_ID" \
PAYWAY_API_KEY="$PAYWAY_API_KEY" \
PAYWAY_RSA_PUBLIC_KEY="$PAYWAY_RSA_PUBLIC_KEY" \
npm run probe
```

Record the command and observed result in the PR description.

## Release Notes

- [ ] Update `CHANGELOG.md` with the release date and summary.
- [ ] Mark bug fixes, features, and breaking changes clearly.
- [ ] Note any sandbox verification performed.

## Optional

- [ ] Generate API reference:

```bash
npm run docs:api
```

- [ ] Confirm `docs/README.md` and `README.md` both link to the new docs or API reference.

## First Public npm Publish (one-time, maintainer decision)

The package is **not yet on the registry** (`npm view aba-payway-ts` returned 404 during the 2026-09-05 review). Publishing is outward-facing and remains a maintainer-executed step.

- [ ] Verify the exact tarball contents **without** publishing:

```bash
npm publish --dry-run
```

Confirm the allowlisted runtime, declarations, skills, README, QUICKSTART, CHANGELOG, LICENSE, and package metadata ship. No `.env`, profile store, source map, internal evidence, log, raw transaction artifact, or local path may appear.

- [ ] Confirm registry identity and name rights: `npm whoami`; the `aba-payway-ts` name must be free or already owned by the org.
- [ ] Publish with 2FA: `npm publish`.
- [ ] Post-publish smoke: `npm view aba-payway-ts version`, then install the exact package in a clean temporary directory and verify ESM import, CJS require, declarations, and `npm exec --package=aba-payway-ts -- payway-sdk --help`. Do not pin a brittle export count; validate the documented public names.
- [ ] If publishing from CI later, add `--provenance` (requires an OIDC-linked workflow) and pin the release to a tag build, not `main` pushes.
