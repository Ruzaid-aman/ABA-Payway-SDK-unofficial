export const orders = [{ id: 'order-1', ownerId: 'alice', amountMinor: 300, currency: 'USD' as const }];
// Demonstration of an existing application session; never use this header as real production auth.
export function sessionUser(request: { headers: unknown }): string | undefined {
  const headers = request.headers as Headers | Record<string, string>;
  const value = headers instanceof Headers ? headers.get('x-demo-session') : headers['x-demo-session'];
  return value === 'alice' || value === 'mallory' ? value : undefined;
}
