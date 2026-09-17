# Webhook Setup (Packaged)

This guide explains how to capture and test callbacks locally using the CLI's webhook tooling. The packaged version omits the example receiver source files.

- Use `payway-sdk webhook trigger --event payment.approved` to emit a signed fixture
- Use `payway-sdk webhook resend --record <id>` to replay stored captures
- For development, forward captures to your local app with `setup-webhook --forward-to <url>`
