/**
 * DX-ERR-003a (audit pass 2, N-02): endpoint/family-scoped explain resolution.
 *
 * Reproduced defect: a bare numeric lookup always answers the qr family (qr is
 * checked before the gateway table), so `explain 16` told a developer whose
 * PURCHASE failed "Invalid First Name" instead of "Invalid Amount".
 *
 * Contract under test (additive only — explainPayWayCode's default answer and
 * return shape never change):
 * - scoped by operation/family → resolves inside that family only;
 * - bare + multi-family code → default entry gains `ambiguous: true` and one
 *   `alternatives` entry per family (deterministic order);
 * - bare + single-family code → exactly the legacy entry (no extra fields);
 * - unknown scope values throw, listing the valid keys.
 *
 * Pure in-process: imports the registry module directly, no child processes.
 */
import { describe, expect, it } from 'vitest';
import {
  EXPLAIN_FAMILIES,
  OPERATION_FAMILY,
  explainAll,
  explainCodeFamilies,
  explainPayWayCode,
  explainPayWayCodeScoped,
} from '../cli/explain-code.js';

describe('explainPayWayCodeScoped (DX-ERR-003a)', () => {
  it('scopes a colliding code by operation: checkout.purchase → gateway "Invalid Amount"; qr.create → QR title', () => {
    const purchase = explainPayWayCodeScoped('16', { operation: 'checkout.purchase' });
    expect(purchase?.family).toBe('gateway');
    expect(purchase?.title).toBe('Invalid Amount');

    const qr = explainPayWayCodeScoped('16', { operation: 'qr.create' });
    expect(qr?.family).toBe('qr');
    expect(qr?.title).toBe('Invalid First Name');

    // --family reaches the same entries directly
    expect(explainPayWayCodeScoped('16', { family: 'gateway' })?.title).toBe('Invalid Amount');
    expect(explainPayWayCodeScoped('16', { family: 'qr' })?.title).toBe('Invalid First Name');

    // scoped results carry no ambiguity fields
    expect(purchase?.ambiguous).toBeUndefined();
    expect(purchase?.alternatives).toBeUndefined();
  });

  it('bare 16 is ambiguous: qr-first default unchanged + 2 alternatives', () => {
    const bare = explainPayWayCodeScoped('16')!;
    expect(bare.ambiguous).toBe(true);
    expect(bare.alternatives).toHaveLength(2);
    expect(bare.alternatives?.map((a) => a.family)).toEqual(['qr', 'gateway']);
    expect(bare.title).toBe('Invalid First Name'); // default (qr-first) answer untouched
    expect(bare.alternatives?.find((a) => a.family === 'gateway')?.title).toBe('Invalid Amount');
    expect(bare.alternatives?.find((a) => a.family === 'gateway')?.code).toBe('16');

    // additive-only: everything except ambiguous/alternatives equals the legacy resolver
    const legacy = explainPayWayCode('16');
    const { ambiguous, alternatives, ...rest } = bare;
    expect(ambiguous).toBe(true);
    expect(alternatives).toHaveLength(2);
    expect(rest).toEqual(legacy);
  });

  it('every multi-family colliding numeric code resolves per family and is flagged ambiguous bare (computed, not hardcoded)', () => {
    // Enumerate the registry: universe = all numeric codes explainAll knows,
    // collisions = those claimed by MORE THAN ONE family (via the per-family
    // resolver, independent of the ambiguity flag).
    const universe = [...new Set(explainAll().map((e) => e.code))].filter((code) => /^\d+$/.test(code));
    const collisions = universe.filter((code) => explainCodeFamilies(code).length > 1);
    expect(collisions.length).toBeGreaterThanOrEqual(6);
    // The audit (N-02) reproduced this qr∩gateway subset — all must be covered.
    for (const auditCode of ['1', '6', '16', '17', '23', '96']) {
      expect(collisions, `audit collision ${auditCode}`).toContain(auditCode);
    }

    for (const code of collisions) {
      const families = explainCodeFamilies(code);
      const bare = explainPayWayCodeScoped(code)!;
      expect(bare.ambiguous, `bare ${code} flagged ambiguous`).toBe(true);
      expect(bare.alternatives?.map((a) => a.family)).toEqual(families);

      // scoped resolution works for EVERY family that claims the code
      for (const family of families) {
        const scoped = explainPayWayCodeScoped(code, { family })!;
        expect(scoped.family, `${code} scoped to ${family}`).toBe(family);
        const alt = bare.alternatives?.find((a) => a.family === family);
        expect(alt, `${code} has an alternative in ${family}`).toBeDefined();
        expect(scoped.title).toBe(alt?.title);
        expect(scoped.hint).toBe(alt?.hint);
        expect(scoped.ambiguous).toBeUndefined();
      }

      // the default answer still matches the legacy resolver and is one of the families
      const legacy = explainPayWayCode(code)!;
      const { ambiguous, alternatives, ...rest } = bare;
      expect(ambiguous).toBe(true);
      expect(rest).toEqual(legacy);
      expect(families).toContain(legacy.family);
    }

    // every declared operation key maps into EXPLAIN_FAMILIES and resolves scoped
    for (const [operation, family] of Object.entries(OPERATION_FAMILY)) {
      expect(EXPLAIN_FAMILIES, `operation ${operation} maps into EXPLAIN_FAMILIES`).toContain(family);
      const code = collisions.find((c) => explainCodeFamilies(c).includes(family));
      if (!code) continue; // families without numeric collisions (refund/pre-auth/…) have nothing to pin here
      expect(explainPayWayCodeScoped(code, { operation })?.family, `${operation} → ${code}`).toBe(family);
    }
  });

  it('rejects unknown scope values, listing the valid keys', () => {
    expect(() => explainPayWayCodeScoped('16', { operation: 'nope.nope' })).toThrow(
      /Unknown explain operation 'nope\.nope'/,
    );
    expect(() => explainPayWayCodeScoped('16', { operation: 'nope.nope' })).toThrow(/checkout\.purchase/);
    expect(() => explainPayWayCodeScoped('16', { family: 'nope' })).toThrow(/Unknown explain family 'nope'/);
    expect(() => explainPayWayCodeScoped('16', { family: 'nope' })).toThrow(/qr/);
    // every declared key is accepted
    for (const operation of Object.keys(OPERATION_FAMILY)) {
      expect(() => explainPayWayCodeScoped('16', { operation })).not.toThrow();
    }
    for (const family of EXPLAIN_FAMILIES) {
      expect(() => explainPayWayCodeScoped('16', { family })).not.toThrow();
    }
  });

  it('non-colliding codes: scoped with the matching family returns exactly the bare explanation', () => {
    for (const code of ['49', '26', '429', 'PTL59', 'PTL05', 'PTL148', 'PTL171', 'CDA45', '0', '00']) {
      const bare = explainPayWayCode(code)!;
      expect(bare, `${code} resolves bare`).toBeDefined();
      expect(explainCodeFamilies(code), `${code} lives in exactly one family`).toHaveLength(1);
      const scoped = explainPayWayCodeScoped(code, { family: bare.family })!;
      expect(scoped).toEqual(bare); // no ambiguous/alternatives fields leak onto non-ambiguous answers
      expect(Object.keys(scoped)).toEqual(Object.keys(bare));
    }
    // scoped with a family that does not claim the code finds nothing
    expect(explainPayWayCodeScoped('49', { family: 'qr' })).toBeUndefined();
    expect(explainPayWayCodeScoped('PTL59', { family: 'gateway' })).toBeUndefined();
  });

  it('success codes stay unambiguous and unknown codes still return undefined in every mode', () => {
    for (const code of ['0', '00']) {
      const scoped = explainPayWayCodeScoped(code)!;
      expect(scoped.family).toBe('gateway');
      expect(scoped.title).toBe('Success');
      expect(scoped.ambiguous).toBeUndefined();
      expect(scoped.alternatives).toBeUndefined();
    }
    expect(explainPayWayCodeScoped('ZZZ999')).toBeUndefined();
    expect(explainPayWayCodeScoped('ZZZ999', { family: 'gateway' })).toBeUndefined();
    expect(explainPayWayCodeScoped('ZZZ999', { operation: 'checkout.purchase' })).toBeUndefined();
  });
});
