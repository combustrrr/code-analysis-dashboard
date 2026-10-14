const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export class AuthExchangeStore {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST') return json({ error: 'not_found' }, 404);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'invalid_request' }, 400); }

    if (url.pathname === '/issue') {
      if (!/^[A-Za-z0-9_-]{43}$/.test(body.verifier_hash || '') || !/^[A-Za-z0-9_.-]{1,4096}$/.test(body.token || '') || typeof body.login !== 'string') {
        return json({ error: 'invalid_request' }, 400);
      }
      const expiresAt = Date.now() + 120_000;
      await this.state.storage.put('exchange', { ...body, expiresAt });
      await this.state.storage.setAlarm(expiresAt);
      return json({ ok: true }, 201);
    }

    if (url.pathname === '/consume') {
      if (!/^[A-Za-z0-9_-]{43}$/.test(body.verifier_hash || '')) return json({ error: 'invalid_request' }, 400);
      return this.state.storage.transaction(async storage => {
        const exchange = await storage.get('exchange');
        if (!exchange) return json({ error: 'exchange_invalid' }, 404);
        if (exchange.expiresAt <= Date.now()) {
          await storage.delete('exchange');
          return json({ error: 'exchange_expired' }, 410);
        }
        if (exchange.verifier_hash !== body.verifier_hash) return json({ error: 'exchange_invalid' }, 401);
        await storage.delete('exchange');
        return json({ token: exchange.token, login: exchange.login });
      });
    }
    return json({ error: 'not_found' }, 404);
  }

  async alarm() {
    await this.state.storage.delete('exchange');
  }
}
