# Remove native/PHP examples and repair references

Status: resolved
Type: task

Follow [the scope](../spec.md). Remove retired implementations, retain mobile architecture guidance, update documentation tests to cover retained examples, regenerate public resources, record the owner's scope decision, and run affected checks. Do not alter historical audit findings or unrelated working edits.

## Comments

- 2026-10-03: initially clean `main` at e7c7624; concurrent checkout-UI guide/skill edits appeared during inventory and are preserved.

## Answer

Removed 103 tracked files and repaired active references. Public guides retain mobile architecture guidance without the retired projects or duplicate implementations. Current release scope records the owner's decision. All affected checks pass; see [verification](../VERIFICATION.md). Historical security fixtures remain scoped for private history scanning. The owner subsequently authorized a local commit; no push or gateway call is included.
