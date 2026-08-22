/**
 * Agentic PayWay CLI — durable, versioned, atomic sessions.
 *
 * A session is an append-only log of {@link AgentSessionEvent}s stored as
 * versioned plaintext JSON. Writes go through `atomicWriteJson` so a crash or
 * failure mid-write never corrupts an existing session file. Prompts,
 * summaries, plans, confirmations, tool calls/results, errors, artifacts and
 * ledger references are all preserved as events.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import type { AgentSessionEvent, AgentSessionEventType, AgentSessionV1 } from './contracts.js';
import { scrubSensitive } from './privacy.js';
import { validateSession } from './schemas.js';
import { atomicWriteJson, getAgentDataPaths } from './storage.js';

const SESSION_VERSION = 'agent-session/v1' as const;
const SUMMARY_MAX_BYTES = 32 * 1024;
const SUMMARY_EVENT_LIMIT = 12;
const SUMMARY_EVENT_TYPES: AgentSessionEventType[] = ['prompt', 'summary', 'tool_result', 'tool_call', 'plan'];

function sessionFile(id: string): string {
  return path.join(getAgentDataPaths().sessionsDir, `${id}.json`);
}

function readSessionFile(id: string): AgentSessionV1 | null {
  const file = sessionFile(id);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    if (!validateSession(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Create a fresh, empty session. */
export function createSession(contextLabel: string): AgentSessionV1 {
  const now = new Date().toISOString();
  const session: AgentSessionV1 = {
    version: SESSION_VERSION,
    sessionId: randomUUID(),
    createdAt: now,
    updatedAt: now,
    contextLabel,
    events: [],
  };
  atomicWriteJson(sessionFile(session.sessionId), session);
  return session;
}

/**
 * Append an event to a session (creating the session if missing), persist it
 * atomically, and return the in-memory session.
 *
 * If the atomic write fails, an audit warning is emitted and the in-memory
 * session is still returned so callers can continue without data loss. The
 * existing on-disk file (if any) is preserved by `atomicWriteJson`.
 */
export function appendSessionEvent(
  sessionId: string,
  event: { type: AgentSessionEventType; data: Record<string, unknown> },
): AgentSessionV1 {
  const existing = readSessionFile(sessionId);
  const now = new Date().toISOString();
  const record: AgentSessionEvent = {
    type: event.type,
    at: now,
    data: scrubSensitive(event.data, []) as Record<string, unknown>,
  };

  const session: AgentSessionV1 = existing
    ? { ...existing, events: [...existing.events, record], updatedAt: now }
    : {
        version: SESSION_VERSION,
        sessionId,
        createdAt: now,
        updatedAt: now,
        contextLabel: 'restored',
        events: [record],
      };

  try {
    atomicWriteJson(sessionFile(sessionId), session);
  } catch (error) {
    console.warn(
      `Audit: failed to persist session ${sessionId}; in-memory state retained. Cause: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return session;
}

/** Load a session, validating structure; return null if absent or invalid. */
export function loadSession(id: string): AgentSessionV1 | null {
  return readSessionFile(id);
}

/** Return all sessions, sorted by `updatedAt` descending. */
export function listSessions(): AgentSessionV1[] {
  const dir = getAgentDataPaths().sessionsDir;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      try {
        const parsed = JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as unknown;
        return validateSession(parsed) ? (parsed as AgentSessionV1) : null;
      } catch {
        return null;
      }
    })
    .filter((s): s is AgentSessionV1 => s !== null)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/**
 * Serialize the session to a JSON string. The session file stores plaintext,
 * so before export it is scrubbed by secret key name (no value secrets are
 * available here) to avoid leaking sensitive fields in exported context.
 */
export function exportSession(id: string): string {
  const session = readSessionFile(id);
  if (!session) {
    throw new Error(`Session not found: ${id}`);
  }
  const scrubbed: AgentSessionV1 = {
    ...session,
    events: session.events.map((event) => ({
      ...event,
      data: scrubSensitive(event.data, []) as Record<string, unknown>,
    })),
  };
  return JSON.stringify(scrubbed);
}

/** Clear a single session, or every session when `idOrAll` is `'all'`. */
export function clearSessions(idOrAll: string): void {
  const dir = getAgentDataPaths().sessionsDir;
  if (idOrAll === 'all') {
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) {
        if (name.endsWith('.json')) {
          rmSync(path.join(dir, name), { force: true });
        }
      }
    }
    return;
  }
  const file = sessionFile(idOrAll);
  if (existsSync(file)) rmSync(file, { force: true });
}

/**
 * Build a deterministic provider-context summary: a state header plus the
 * newest `SUMMARY_EVENT_LIMIT` conversational/tool-result events, scrubbed and
 * capped at `SUMMARY_MAX_BYTES` after scrubbing.
 *
 * The result is deterministic for identical inputs (stable JSON key order from
 * `JSON.stringify` of already-normalized structures). Secrets are redacted via
 * `scrubSensitive`.
 */
export function buildDeterministicSummary(session: AgentSessionV1, secrets: string[] = []): string {
  const relevant = session.events
    .filter((event) => SUMMARY_EVENT_TYPES.includes(event.type))
    .slice(-SUMMARY_EVENT_LIMIT);

  const header = {
    sessionId: session.sessionId,
    contextLabel: session.contextLabel,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    eventCount: session.events.length,
    includedEventCount: relevant.length,
  };

  const payload = {
    header,
    events: relevant.map((event) => ({
      type: event.type,
      at: event.at,
      data: scrubSensitive(event.data, secrets),
    })),
  };

  let serialized = JSON.stringify(payload);

  if (Buffer.byteLength(serialized, 'utf8') > SUMMARY_MAX_BYTES) {
    let truncated = relevant;
    while (truncated.length > 0) {
      truncated = truncated.slice(1);
      const candidate = JSON.stringify({
        header: { ...header, includedEventCount: truncated.length },
        events: truncated.map((event) => ({
          type: event.type,
          at: event.at,
          data: scrubSensitive(event.data, secrets),
        })),
      });
      if (Buffer.byteLength(candidate, 'utf8') <= SUMMARY_MAX_BYTES) {
        serialized = candidate;
        break;
      }
    }
    if (Buffer.byteLength(serialized, 'utf8') > SUMMARY_MAX_BYTES) {
      serialized = JSON.stringify({
        header: { ...header, includedEventCount: 0 },
        events: [],
        note: 'summary exceeded 32 KiB after scrubbing; events omitted',
      });
    }
  }

  return serialized;
}

/** @internal used by tests to inspect a single session file's byte size. */
export function _sessionFileSize(id: string): number | null {
  const file = sessionFile(id);
  if (!existsSync(file)) return null;
  return statSync(file).size;
}
