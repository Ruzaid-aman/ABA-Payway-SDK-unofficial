# ABA PayWay SDK — Visual Guide

How the project works, how to set it up, how to onboard, and how to start
using it — in pictures (ASCII) you can read in any terminal or editor.

---

## 1. The big picture

```
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                          YOUR MERCHANT BUSINESS                           │
 │      (Next.js · Express · Telegram bot · POS · cron jobs · agents)        │
 └───────┬───────────────────────┬───────────────────────┬─────────────────┘
         │ import                │ CLI                   │ AI agent
         ▼                       ▼                       ▼
 ┌───────────────┐      ┌───────────────┐      ┌───────────────────┐
 │  TypeScript   │      │  payway-sdk   │      │  Agentic runtime  │
 │  SDK (7 APIs) │◄────►│      CLI      │◄────►│ ask → plan → risk │
 │               │      │  (Commander)  │      │ gate → execute    │
 └───────┬───────┘      └───────┬───────┘      └─────────┬─────────┘
         │                      │                        │
         └──────────┬───────────┴──────────┬─────────────┘
                    ▼  HMAC-SHA512 + RSA   │
              ┌──────────────┐             ▼
              │ auth layer   │      ┌──────────────┐
              │ (signing)    │      │ LLM provider │ (opencode zen /
              └──────┬───────┘      └──────────────┘  openai/nvidia…)
                     │
                     ▼
        ╔═══════════════════════════════╗          ┌───────────────────┐
        ║  ABA PAYWAY GATEWAY           ║          │ Your webhook      │
        ║  checkout-sandbox.payway.com.kh║ ◄───────│ (Cloudflare tunnel│
        ║  checkout.payway.com.kh       ║ callbacks│  or public HTTPS) │
        ╚═══════════════════════════════╝          └───────────────────┘
```

**One SDK, seven API scopes** (`payway.checkout`, `.qr`, `.credentialsOnFile`,
`.paymentLink`, `.preAuth`, `.payout`, `.khqr`) — the CLI and the agent both
drive the exact same functions your code would call.

---

## 2. Setup — three paths to credentials

```
                    ┌─────────────────────────┐
                    │  npm install aba-payway-ts
                    └────────────┬────────────┘
                                 ▼
              ┌─────────────────────────────────────┐
              │ Which way do you want to configure?  │
              └───┬──────────────┬──────────────┬───┘
                  │              │              │
        PATH A ▼       PATH B ▼       PATH C ▼
   ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
   │ .env file   │  │ Credential   │  │ payway-sdk init  │
   │ (quickest)  │  │ profiles     │  │ scaffolds project│
   │             │  │ (multi-env)  │  │ + .env template  │
   └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘
          │                │                   │
          ▼                ▼                   ▼
   ┌─────────────────────────────────────────────────┐
   │ Required everywhere:                            │
   │   PAYWAY_MERCHANT_ID=ec476910                   │
   │   PAYWAY_API_KEY=<40-char key>                  │
   │ Optional (RSA endpoints: refund/link/payout):   │
   │   PAYWAY_RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY--│
   │   ...whole PEM may span multiple lines..."      │
   └─────────────────────────────────────────────────┘
```

> 💡 Multi-line quoted PEMs are fully supported by the CLI's loader — that
> format is the least error-prone. `doctor` now flags truncated keys for you.

---

## 3. Onboarding journey (5 minutes)

```
 STEP 1            STEP 2              STEP 3              STEP 4
 ┌──────────┐      ┌─────────────┐     ┌─────────────┐     ┌──────────────┐
 │ init     │      │ fill .env   │     │ doctor      │     │ first payment│
 │ scaffold │ ───► │ or profiles │ ──► │ --live      │ ──► │ generate-qr  │
 │          │      │ add         │     │             │     │ (scan it!)   │
 └──────────┘      └─────────────┘     └──────┬──────┘     └──────────────┘
                                              │
                                     ✓ all checks green
                                     ✓ sandbox round-trip 494ms
```

```bash
payway-sdk init                 # detects framework, writes files + .env template
payway-sdk profiles add         # OR: named sandbox/production profiles
payway-sdk doctor --live        # static checks + REAL exchange-rate round-trip
```

`doctor --live` output looks like:

```
  ✓ .env file exists            /path/to/.env
  ✓ PAYWAY_MERCHANT_ID is set   ec476910...
  ✓ RSA public key shape        BEGIN/END PUBLIC KEY detected
  Live probe: calling PayWay sandbox (exchange-rate)... ✓ round-trip 361ms
  All credential & connectivity checks passed.
```

### For AI agents (optional)

```
 payway-sdk onboard   →  ① set-provider   ② profile check   ③ callback URL
                         ④ privacy ack    ⑤ verify          → READY
 payway-sdk ask "create a $5 sandbox QR"
        │
        ▼
   provider proposes plan → validated against tool catalog → risk gate
   → (sandbox needs --yolo, production asks you) → executed → ledger entry
```

Agent readiness requires: saved **profile** (not just .env), **public HTTPS**
callback (`setup-webhook --tunnel` gives you one free), provider key in
`PAYWAY_AGENT_API_KEY`.

---

## 4. The payment lifecycle at a glance

```
            CREATE                 WATCH                  AFTERMATH
 ┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐
 │ generate-checkout    │  │ poll-transaction -t  │  │ transaction-detail │
 │ generate-qr          ├─►│        <id>          ├─►│ transaction-list   │
 │ payment-link create  │  │ (--json for agents)  │  │ check-transaction  │
 └──────────┬───────────┘  └──────────┬───────────┘  └─────────┬──────────┘
            │                         │                        │
     terminal QR ✅             PENDING ●●●○○            APPROVED ✓ ─► refund
     scan to pay 📱             countdown clock          DECLINED ✗ ─► retry
     customer pays              every 5s                 CANCELLED ✗│
                                                         REFUNDED ⟲ ◄─┘
            │                                                  │
            │ webhook also arrives asynchronously              │
            ▼                                                  ▼
 ┌──────────────────────┐                        ┌──────────────────────┐
 │ setup-webhook        │                        │ close-transaction    │
 │ (--tunnel = free URL)│                        │ void an UNPAID txn   │
 └──────────────────────┘                        └──────────────────────┘
```

Every money-moving command confirms before acting (`-y/--force` skips),
prints a dim **"Next:"** hint pointing at the natural following command,
and returns one of four exit codes:

| `$?` | Meaning |
|---|---|
| `0` | success (for polling: reached ANY terminal status — branch on status) |
| `1` | your input was invalid (amounts, dates `"YYYY-MM-DD HH:mm:ss"`, IDs) |
| `2` | PayWay rejected it (`Wrong Hash`, `PTL*`, not-found…) |
| `3` | network / timeout / rate-limit — outcome unknown |

Confused by a code? `payway-sdk explain PTL36` — offline, no credentials.

---

## 5. Where everything lives

```
 aba-payway-ts/
 ├── src/
 │   ├── client.ts ─────── PayWay class: signing, retries, rate limits
 │   ├── domains/ ──────── checkout · qr · cof · payment-link · pre-auth · payout · khqr
 │   ├── cli.ts ─────────── every command shown above
 │   ├── cli/ ──────────── dotenv · explain-code · journey · terminal-qr · commands/
 │   ├── agent/ ─────────── provider, planning, risk gates, ledger, sessions
 │   └── webhook/ ──────── server · storage(json/sqlite) · cloudflare tunnel
 ├── scripts/sandbox-campaign-*.ts   re-runnable live evidence harnesses
 ├── test-output/campaign-*.json     captured proof from the sandbox
 ├── skills/aba-payway-*/SKILL.md    teachable guides for coding agents
 └── docs/01…16                      the full integration book
```

---

## 6. Cheat sheet

```bash
# SETUP
payway-sdk init && payway-sdk doctor --live

# TAKE A PAYMENT (terminal QR + PNG auto-open; polls until paid)
payway-sdk generate-qr -a 5.00

# OPERATIONS
payway-sdk transaction-list                 # today
payway-sdk check-transaction -t <id>        # one-shot status
payway-sdk close-transaction -t <id> -y     # void unpaid
payway-sdk refund -t <id> -a 2.00           # pre-flight balance check built in

# DEBUG / AGENTS
payway-sdk explain 49                       # decode any error code
payway-sdk poll-transaction -t <id> --json  # machine-readable watch
payway-sdk skills add claude opencode       # install agent skill guides
# skills/*/scripts also ship offline .cjs helpers: sign-request, verify-callback,
# decode-status, checkout-payload, reconcile — each SKILL.md documents its own
```

Sandbox facts baked into these defaults: duplicate `tran_id` is accepted
(generate unique IDs), closed-but-unpaid stays `PENDING`, list dates must be
`YYYY-MM-DD HH:mm:ss`, refunds need ≥ $0.01 USD / ≥ 1 KHR. Evidence:
[SANDBOX-FINDINGS §8–9](./SANDBOX-FINDINGS.md).
