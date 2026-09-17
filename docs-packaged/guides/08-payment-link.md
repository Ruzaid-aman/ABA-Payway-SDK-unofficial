# Payment Link (Packaged Overview)

Summary guidance for creating and managing payment links in a packaged-friendly format.

- **Create:** Use the CLI `generate-checkout` or SDK equivalent; provide `--return-url` for redirects.
- **Void:** Voiding is permanent; follow refund flows for paid links.
- **Security:** Validate return callbacks with `check-transaction` rather than relying solely on the redirect.

This chapter omits example source files and keeps content suitable for npm distribution.
