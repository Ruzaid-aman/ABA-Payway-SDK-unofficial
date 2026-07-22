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
PAYWAY_PUBLIC_KEY_PEM="$PAYWAY_PUBLIC_KEY_PEM" \
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
