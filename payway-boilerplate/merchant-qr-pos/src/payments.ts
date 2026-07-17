const TERMINAL_STATUSES = new Set(['APPROVED', 'PRE-AUTH', 'REFUNDED', 'DECLINED', 'CANCELLED']);

export function isTerminalPayWayStatus(status: string | undefined): boolean {
  return status !== undefined && TERMINAL_STATUSES.has(status);
}
