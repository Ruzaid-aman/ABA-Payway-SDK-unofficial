# Contributing

Use Node.js 22.12 or later and npm 10 or later. Fork and clone the repository, then run from its root:

Use Node 24.11+ for the complete maintainer toolchain (including optional mutation testing); some development-only Babel/Stryker dependencies require a newer runtime than the SDK. CI still exercises the SDK's minimum runtime.

```bash
npm ci
npm run build
npm run typecheck
npm run typecheck:dist
npm run lint
npm run check:secret-allowlists
npm test
```

This is the CI quality-gates order. Build first: `typecheck:dist` and the CLI integration tests consume `dist/` (`typecheck:dist` reads the emitted `dist/index.d.ts`; the integration suites execute `dist/cli.js`). `npm run typecheck` itself resolves the package from source and passes on a clean clone with no prior build. Rebuild after CLI changes. Unit tests and the local demo need no merchant credentials:

```bash
npm exec -- payway-sdk demo --check
npx vitest run src/__tests__/validation.test.ts
```

Create a focused branch, explain the problem and resulting behavior, add regression coverage for behavior changes, and update the relevant guide. Use the PR template to record validation. Read the repo HANDOFF for current state; older project logs and audit reports are historical context.

## Distribution changes

For changes to exports, CLI assets, agent skills, examples, or packaging, also run:

```bash
npm run docs:api
npm run check:package
npm run check:public-docs
npm run check:repository
npm run smoke:package
npm --prefix examples/first-payment run setup
npm --prefix examples/first-payment run typecheck
npm run smoke:example
```

The packed-package smoke installs the tarball in a temporary consumer and checks ESM, CJS, declarations, CLI help, demo, and skills. The example smoke starts and stops its demo server without loading merchant credentials.

For secret-scan configuration changes, install Gitleaks 8.30.1 and run `npm run check:secret-allowlists`. Set `GITLEAKS_BINARY` if it is not on PATH. The check uses only synthetic fixtures and verifies that different values in the same files remain detectable.

## Gateway verification

SQLite is an optional backend. The default install uses the JSONL backend and skips SQLite-only tests when the driver is absent. For native-backend work, install `better-sqlite3@13.0.3` with `npm install --no-save --package-lock=false better-sqlite3@13.0.3`, then run the storage suites. CI has a separate Linux/Node 24 job for this. Legacy image-decoding probes may need separately installed `canvas` and `qrcode-reader`; these are not required to build or test the SDK.

The standard `npm test` command excludes the live sandbox contract suite, even when local credentials or its opt-in flag are present. To deliberately run live sandbox checks, use `npm run test:sandbox`: that command enables the suite and reads credentials from the repository `.env`. It creates sandbox transactions; without credentials it skips. Mocked tests should reproduce the request or response contract.

Use your own sandbox merchant account; never use production credentials for contributor checks. Record the outcome or explain why a sandbox check was not applicable. Do not paste credentials, payment tokens, customer data, signed forms, raw callbacks, or captured API responses into a PR.

## Review and release

Run required checks before requesting review. Maintainers decide release versions, external verification, tags, and publication using the release checklist. Raising the supported Node.js floor is a breaking change.

For SDK questions see [SUPPORT.md](support.md). Report vulnerabilities privately using [SECURITY.md](security.md).
