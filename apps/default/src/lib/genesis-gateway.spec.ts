import { afterEach, describe, expect, it, vi } from 'vitest';
import { gatewayGetIfChanged, gatewayRequest, hasPendingGatewayRequests, whenGatewayIdle } from './genesis-gateway';

afterEach(() => vi.unstubAllGlobals());

describe('gateway request contracts', () => {
  it('never retries a failed write, preventing duplicate submissions', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(gatewayRequest('/forms', { method: 'POST', body: '{}' })).rejects.toThrow('503');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(hasPendingGatewayRequests()).toBe(false);
    await whenGatewayIdle();
  });

  it('rejects HTML responses instead of treating a sign-in page as successful data', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(gatewayRequest('/nodes', {})).rejects.toThrow('expected JSON');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(hasPendingGatewayRequests()).toBe(false);
  });

  it('handles an unchanged response without trying to parse its empty body', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 304, headers: { ETag: 'revision-2' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(gatewayGetIfChanged('/nodes', 'revision-1')).resolves.toEqual({ changed: false, etag: 'revision-2' });
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', cache: 'no-store', headers: { 'If-None-Match': 'revision-1' } });
  });

  it('tracks pending reads until the response settles', async () => {
    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { resolveResponse = resolve; })));
    const request = gatewayRequest('/nodes', {});
    expect(hasPendingGatewayRequests()).toBe(true);
    const idle = whenGatewayIdle();
    resolveResponse(new Response('{"items":[]}', { headers: { 'Content-Type': 'application/json' } }));
    await expect(request).resolves.toEqual({ items: [] });
    await idle;
    expect(hasPendingGatewayRequests()).toBe(false);
  });
});
