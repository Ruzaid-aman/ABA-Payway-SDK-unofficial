import io

def patch(path, old, new, count=1):
    with io.open(path, encoding='utf-8') as f:
        content = f.read()
    if old not in content:
        raise SystemExit("ANCHOR NOT FOUND in %s:\n%s" % (path, old[:160]))
    content = content.replace(old, new, count)
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    print("patched " + path)

patch('docs/02-prerequisites-and-setup.md', """### Prepare to complete a sandbox payment

For hosted card checkout, use ABA's [official test cards](https://developer.payway.com.kh/resources-3305682f0), not real card details. That resource also explains test 3DS email OTP delivery. For ABA PAY / QR testing, contact your ABA integration representative for the supported test app or simulator and access instructions. Arrange this before generating a short-lived QR. The local SDK demo simulates approval and cannot pay a gateway QR.

Return to [quickstart callback setup](../QUICKSTART.md#4-prepare-a-callback-and-check-your-route), then create and verify one payment.

> ⚠️ **Production credentials require business verification with ABA Bank** — contact ABA PayWay support for the go-live process.""", """### Prepare to complete a sandbox payment

For hosted card checkout, use ABA's **sandbox test cards**, not real card details. The seeded list ships with the SDK — run `payway-sdk sandbox-test-cards` (or `listSandboxTestCards()`): two approved cards (MasterCard `5156 8399 3770 6777`; Visa `4286 0900 0000 0206`, which triggers the 3DS challenge) and two declined cards for error paths. The 3DS test OTP is delivered by email. Cards are sandbox-only and may rotate; request updated sandbox/UAT cards from the Integration Team if one starts failing (confirmed 2026-09-12).

### ABA Mobile Simulator (sandbox testing)

ABA PAY / KHQR / deeplink testing uses the **ABA Mobile Simulator app** (the production ABA Mobile app cannot complete sandbox transactions). To get it (confirmed by the integration team, 2026-09-12):

1. Request a PayWay sandbox test account **and** ABA Mobile Simulator access from the Integration Team (via this channel or Digital Support).
2. Provide tester details per account: first name, last name, mobile number **with country code** (the OTP target), and email.
3. The team provisions the accounts and shares: account ID / registered mobile, **PIN `1234`** and secret word **`TEST1`** (current defaults), and install links — iOS: [TestFlight](https://testflight.apple.com/join/HNyq7UCm), Android: APK via the team's shared drive.
4. Install, log in with the OTP + PIN + secret word, then scan/pay sandbox KHQR and ABA PAY QRs and exercise `ABA_PAY_DEEPLINK`; callbacks (`return_url`, `return_deeplink`) and status land in your system and the sandbox merchant portal.

No real money moves. For live merchants there is a separate [ABA Merchant app](https://play.google.com/store/apps/details?id=com.ababank.payway) (not a simulator).

Return to [quickstart callback setup](../QUICKSTART.md#4-prepare-a-callback-and-check-your-route), then create and verify one payment.

### Onboarding lifecycle: sandbox → production

The end-to-end path, as described by the ABA integration team (2026-09-12):

1. **Sandbox access** — register / request sandbox credentials; a sandbox merchant profile is created and a technical contact email registered.
2. **Activation** — credentials (merchant ID, API key, optional RSA key) arrive by email together with a sandbox portal activation link.
3. **Domain whitelisting** — give the team your sandbox domains (and app name/platform/package ID for mobile) so checkout and deeplinks work from your origin.
4. **Build & test** — implement create-payment, callback/pushback, and status flows; capture transaction IDs and flow evidence.
5. **Sandbox review** — the Integration Team reviews UI/branding, callback handling, and status logic; fix and re-test until approved. Approval makes you eligible for production.
6. **Production onboarding** — the commercial merchant application (legal/company info, settlement ABA account(s), contacts, supporting documents, signed agreements) creates the production profile.
7. **Production credentials** — issued after sandbox validation; production keys may carry **temporary expirations** until verification completes.
8. **Live verification** — run at least one low-value live transaction (per enabled method), capture transaction IDs + screenshots, and share them for sign-off.
9. **Go-live** — ABA verifies the transactions in bank/portal logs, confirms the settlement account, removes the temporary key expirations, and marks the merchant live. A short **VIP support window** follows; afterwards, issues go through standard Digital Support channels.

No lead times are guaranteed anywhere in this path; every approval step is an ABA-side action (see [Chapter 15](./15-merchant-scenario-requirements.md) for the review gates).""")
