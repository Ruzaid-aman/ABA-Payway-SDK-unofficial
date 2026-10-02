# Default checkout UI source record — 2026-10-03

Internal evidence; do not package this file or original design assets. This is the source receipt date, not a confirmed bank effective date. The owner requested propagation of a PayWay Integration Team relay and supplied exports. No gateway, physical-device or screen-approval trial occurred here.

## Sources and scope

The written relay specifies every enabled method visible/selectable; exact ABA KHQR wording; current official assets; expected web plugin popup; full-screen app WebView/merchant header; readable hosted QR; policy links/checkbox above Pay; continuation/app return; merchant confirmation/cart cleanup; Integration Team screen review before production credentials.

Design: [Merchant Integration Guideline 2.11](https://www.figma.com/design/xS8d19OkA9jMh4gGsxUZPe/-External-Use--Merchant-Integration-Guideline---2.11?node-id=18242-814). Prototype: [KHQR checkout / payout](https://www.figma.com/proto/n8jtKYqV8DmiS3etym6NTC/KHQR-Checkout---Payout-Prototype?node-id=2004-16494). Live Figma access failed; supplied exports were inspected. No mandatory ordering, font/color/spacing metrics or public redistribution approval were inferred.

SDK checked: src/client.ts CreateTransactionParams uses purchase firstname/lastname, returnUrl, continueSuccessUrl and returnDeeplink; src/domains/checkout.ts provides getCheckoutFormHtml popup transport. QR/COF casing differs. Hosted response shapes, unsigned notification contracts and backend verification are preserved.

## Export identities

Originals stay in the owner's Downloads folder; hashes identify the reviewed bytes, not a redistribution license.

| File | SHA-256 | Evidence |
|---|---|---|
| payment.svg | ED20F80DD5786370FC3E152BEAA9329475062CF19426131D1794EA7CFE7913EE | 284 × 272 export geometry |
| cards_icons.svg | 419AB6A043AD6707427935D907A81380650B0D982E084587034A423C0855A762 | 40 × 40 card icon |
| Alipay.svg | 49986AD0C103742F365CB320295509D143F4BEEB98FB8A320E64446374B77145 | 40 × 40 Alipay icon |
| WeChat.svg | C5E9F4FE841E8F804B6E95E4FD4643E317D1E46FD7C175DA4A75F74EB14372CD | 40 × 40 WeChat icon |
| ABA BANK.svg | 94D60C37DAA0D3ABBA8CABCBFD9059F46972C8204879B67AA981377CA8BB2EF1 | 40 × 40 ABA icon |
| method.png | 4763A27E80164DB856730D722803CB737392BDEA9194AC699E571CAD5D603225 | Exact KHQR copy and example method row |
| payment logos.png | A19B453FB3F749D6332C647935C372A77E950F38FE7155A2E204ECFF8A27E9D8 | ABA/KHQR/Visa/Mastercard/UnionPay/JCB strip, not every enabled option |
| #6.png | 411EFA3DEF30D4F966DBA1807E5BC9863594A16AC985DDD6FCE21C8D23F3AFD6 | Merchant 300 × 300 JPG/PNG ≤3 MB; display minimum 40 px/auto width/10 px protection; separate vendor 315 × 315 circle PNG ≤3 MB/primary background; theme/continuation configuration |
| #5.png | EED7410D06EA16136F37BA6B3AAF8A806059CE5CC746D10E47F34CB7F1ABD577 | Page 5/7: example method rows, We accept footer, desktop overlays and distinct mobile handoffs |

## Propagation

Canonical integration-ui and UI-customization guides contain the detailed rules; selected-flow/onboarding/deployment docs and four skills route to them. Existing generators produce public knowledge and independent skill-local references. Q50/Q56 preserve confirmed presentation facts and narrow remaining version, configuration/device/entitlement, screen-signoff and redistribution questions. Original bank assets are not bundled. This propagation is not ABA sign-off or publication authorization.
