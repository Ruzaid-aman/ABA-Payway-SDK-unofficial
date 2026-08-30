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

- [ ] Confirm new or changed API behavior is documented in `README.md` and relevant `docs/` chapters.
- [ ] If CLI commands were added or changed, rebuild the CLI and verify `--help` output:

```bash
npm run build
npx payway-sdk --help
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

The package is publish-ready (`files: ["dist", "skills"]`, `prepublishOnly` clean-builds) but is **not yet on the registry** (`npm view aba-payway-ts` → 404 as of 2026-08-30). Publishing is outward-facing and requires registry credentials, so it is deliberately left as a maintainer-executed step.

- [ ] Verify the exact tarball contents **without** publishing:

```bash
npm publish --dry-run
```

Confirm only `dist/` and `skills/` ship, no `.env`, profile stores, `test-output/`, or audit artifacts appear in the file list, and the tarball size is sane.

- [ ] Confirm registry identity and name rights: `npm whoami`; the `aba-payway-ts` name must be free or already owned by the org.
- [ ] Publish with 2FA: `npm publish`.
- [ ] Post-publish smoke: `npm view aba-payway-ts version`, then in a clean temp directory `npm i aba-payway-ts` and `node -e "console.log(Object.keys(require('aba-payway-ts')).length)"` (expect 54 exports).
- [ ] If publishing from CI later, add `--provenance` (requires an OIDC-linked workflow) and pin the release to a tag build, not `main` pushes.
