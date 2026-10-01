Use the aba-payway-integration skill at .agents/skills/aba-payway-integration/SKILL.md.
Add PayWay integration to this existing synthetic merchant project. Read merchant-context.ts and keep its orders/prices/authentication.
Implement merchant.ts exporting createMerchant(gateway, databaseFile). It must return:
{ expressApp, next: { qrPOST, hostedPOST, linkPOST, callbackPOST, statusGET(request,attemptId) }, store }.
Gateway is an injected synthetic provider with async create(attempt), lookup(attempt), following the recipe's interface.
Express endpoints are POST /payments/create/qr|hosted|link, POST /payments/callback, GET /payments/status/:attemptId.
Next handlers take standard Request objects. Customers send only orderId; existing server prices and session determine ownership.
Use durable storage across restart and expose store.jobs(), store.pending(), store.close() for the acceptance harness.
Use only synthetic callback signing key 'synthetic-trial-key'. Do not access real credentials or contact a payment gateway.
Support QR, hosted form and payment link. Verify signed online callbacks, treat unsigned link notifications as hints, query the injected provider,
fulfill once, and recover a lost response without another create. Return only attemptId and payment artifact to the customer.
Compile and run the existing acceptance harness without editing it. Add DIAGNOSIS.md explaining code 104, code 1/Wrong Hash and ambiguous-create recovery,
including evidence/enablement limits. Explain storage and production prerequisites. Keep all changes within this directory; do not modify dependencies.
