/**
 * `capabilities` (audit pass 2 §14.2/§47 DX-CLI-007): the machine-readable
 * command catalog, generated live from the commander registry so `--help`
 * and `capabilities` can never disagree. Under --json it emits the v2
 * envelope via the §16 contract.
 *
 * moneyMoving pins the §12.2 class-3 set ("moves money or terminates") — the
 * set the env-guard wave (WP-07) will gate behind --confirm-production.
 * It is an explicit constant, not a heuristic: misclassifying a money path
 * as read-only is the one mistake this catalog must never make.
 */
import type { Command } from 'commander';

import { buildEnvelope } from '../output/envelope.js';
import type { Envelope } from '../output/contract.js';

/**
 * §12.2 class-3 command roots in THIS CLI's naming. Matched against the
 * command path (root + subcommand). Keeping this a literal list makes the
 * contract test able to pin it exactly.
 */
export const MONEY_MOVING_COMMANDS: readonly string[] = [
  'refund',
  'payout',
  'pre-auth complete',
  'pre-auth complete-payout',
  'pre-auth cancel',
  'close-transaction',
  'payment-link void',
  'cof token remove',
  'beneficiary add',
  'beneficiary update-status',
];

/** §12.2 unverified-capability commands (spec-derived, not live-verified). */
export const UNVERIFIED_COMMANDS: readonly string[] = ['request-qr', 'self-activation'];

export interface CommandCapability {
  /** Dotted canonical path, e.g. `cof.token.remove`. */
  name: string;
  /** CLI-space path as typed, e.g. `cof token remove`. */
  path: string;
  description: string;
  group: string;
  moneyMoving: boolean;
  readOnly: boolean;
  unverified: boolean;
  aliases: string[];
  options: string[];
}

interface RegistryNode {
  name: string;
  description: string;
  aliases: string[];
  options: string[];
  children: RegistryNode[];
}

/** Walk the commander tree into a plain structure (pure — testable). */
export function collectRegistryTree(root: Command): RegistryNode {
  const node = (cmd: Command): RegistryNode => ({
    name: cmd.name(),
    description: cmd.description(),
    aliases: cmd.aliases(),
    options: cmd.options.map((o) => (o.long ?? o.short ?? o.flags) as string),
    children: cmd.commands.map(node),
  });
  return node(root);
}

function flatten(node: RegistryNode, prefix: string, out: RegistryNode[]): void {
  for (const child of node.children) {
    const path = prefix ? `${prefix} ${child.name}` : child.name;
    out.push({ ...child, name: path });
    flatten(child, path, out);
  }
}

function toCliPath(name: string): string {
  return name.replace(/\./g, ' ');
}

/** Build the capability catalog from the registry tree (pure — testable). */
export function buildCapabilities(tree: RegistryNode): CommandCapability[] {
  const flat: RegistryNode[] = [];
  flatten(tree, '', flat);
  return flat
    .filter((c) => c.name.length > 0)
    .map((c) => {
      const moneyMoving = MONEY_MOVING_COMMANDS.includes(c.name);
      return {
        name: c.name.replace(/ /g, '.'),
        path: c.name,
        description: c.description,
        group: c.name.split(' ')[0],
        moneyMoving,
        readOnly: !moneyMoving && !UNVERIFIED_COMMANDS.includes(c.name.split(' ')[0]),
        unverified: UNVERIFIED_COMMANDS.includes(c.name.split(' ')[0]),
        aliases: c.aliases,
        options: c.options,
      };
    });
}

/** Envelope for `capabilities --json` (v2 contract). */
export function capabilitiesEnvelope(caps: CommandCapability[]): Envelope {
  return buildEnvelope({
    kind: 'collection',
    command: 'capabilities',
    ok: true,
    data: {
      count: caps.length,
      moneyMovingCount: caps.filter((c) => c.moneyMoving).length,
      commands: caps,
    },
  });
}

/** CLI-space alias lookup for parity tests: every --help path resolves. */
export function cliPathFor(capName: string): string {
  return toCliPath(capName);
}
