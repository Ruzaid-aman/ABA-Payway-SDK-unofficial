# Versioning Policy

This SDK follows [Semantic Versioning](https://semver.org/).

## Versioning Rules

- **Major** version bumps (`MAJOR`) indicate breaking changes.
  - Renaming or removing public methods, classes, or exported types.
  - Changing method signatures or return types in a way that is not backwards compatible.
  - Removing documented behavior or public configuration options.

- **Minor** version bumps (`MINOR`) indicate additive, backwards-compatible enhancements.
  - Adding new optional parameters or new public methods.
  - Adding new `PayWayError` subclasses or new public properties that do not break existing usage.
  - Adding new documentation, examples, or generated API reference output.

- **Patch** version bumps (`PATCH`) indicate backwards-compatible bug fixes.
  - Fixing documentation bugs.
  - Correcting validation behavior while preserving the public API.
  - Resolving typos, build errors, or tests.

## Supported Node.js Versions

This SDK supports Node.js `>=22.12.0`. Raising the runtime floor from Node 20 is a breaking change in the next release.

We recommend using the latest Active LTS release of Node.js for production deployments.

## Release Notes

Maintain changelog entries in `CHANGELOG.md` using a date-driven format. Each release note should include:

- What changed.
- Whether it is a bug fix, new feature, or breaking change.
- A short note on any sandbox verification that was performed.

Example:

```md
## [1.0.1] - 2026-07-18
### Fixed
- Corrected webhook docs to use `X-PAYWAY-HMAC-SHA512` instead of `req.body.hash`.
```
