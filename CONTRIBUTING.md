# Contributing to ABA PayWay TypeScript SDK

Thank you for your interest in contributing to `aba-payway-ts`!

## Getting Started

1. Fork the repository.
2. Clone your fork.
3. Install dependencies:

```bash
npm install
```

4. Run the full test suite before submitting changes:

```bash
npm test
```

5. Run lint and typecheck:

```bash
npm run lint
npm run typecheck
```

## Development Workflow

- Create a descriptive branch name, e.g. `fix/webhook-docs` or `feature/validation-parity`.
- Keep your changes focused and make sure each commit is small and clear.
- Add or update tests for any behavior or regression fix.
- Update docs when public API behavior changes.

## Testing

The repository uses Vitest for unit tests. Run the full suite with:

```bash
npm test
```

For a single test file:

```bash
npm test -- --run src/__tests__/validation.test.ts
```

## Linting and Formatting

The project uses Biome for linting and formatting.

```bash
npm run lint
npm run format
```

If you introduce new TypeScript types or public APIs, run:

```bash
npm run typecheck
```

## Documentation

If your change affects user-facing behavior, update the relevant docs under `docs/` and the top-level `README.md`.

- Add new examples to `docs/examples/` when appropriate.
- Keep the documentation consistent with the code.

## Release Gate

For any user-facing change, record the sandbox verification command and the result in your PR description. Use environment variables for credentials, never hardcode secrets.

Example:

```bash
PAYWAY_MERCHANT_ID=$PAYWAY_MERCHANT_ID \
PAYWAY_API_KEY=$PAYWAY_API_KEY \
PAYWAY_RSA_PUBLIC_KEY="$PAYWAY_RSA_PUBLIC_KEY" \
npm run probe
```

## Security Issues

If you discover a security vulnerability, please report it privately via the `SECURITY.md` guidance rather than opening a public issue.
