import { handleCollect } from './collect.js';
import { handleLogin, handleCallback, handleLogout, handleMe } from './auth.js';
import { handleStats } from './stats.js';
import { json, securityHeaders } from './util.js';

const ADMIN_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case '/api/collect': return await handleCollect(request, env, ctx);
        case '/api/admin/login': return await handleLogin(request, env);
        case '/api/admin/callback': return await handleCallback(request, env);
        case '/api/admin/logout': return await handleLogout(request, env);
        case '/api/admin/me': return await handleMe(request, env);
        case '/api/admin/stats': return await handleStats(request, env);
      }
      if (url.pathname.startsWith('/api/')) return json({ ok: false, error: 'not_found' }, 404);
    } catch (e) {
      return json({ ok: false, error: 'server_error' }, 500);
    }
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      const r = await env.ASSETS.fetch(new Request(new URL('/admin/index.html', url), request));
      return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...securityHeaders(), 'content-security-policy': ADMIN_CSP, 'cache-control': 'no-store' } });
    }
    // Com html_handling = "none", "/" não abre o index.html sozinho: mapeia explicitamente (como em /admin/).
    if (url.pathname === '/') {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }
    const r = await env.ASSETS.fetch(request);
    if (url.pathname.startsWith('/admin/')) {
      const h = new Headers(r.headers); h.set('content-security-policy', ADMIN_CSP); h.set('cache-control', 'no-store'); h.set('x-frame-options', 'DENY');
      return new Response(r.body, { status: r.status, headers: h });
    }
    return r;
  },
};
