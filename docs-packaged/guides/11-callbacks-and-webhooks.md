# Callbacks And Webhooks (Packaged)

Summary (sanitized):

- Explains callback types: online checkout HMAC-signed vs payment-link pushbacks (unsigned).
- Recommends verification via `check-transaction` for unsigned pushbacks.
- Advises deduplication strategies and local testing using the CLI `webhook trigger` and `setup-webhook --forward-to`.
