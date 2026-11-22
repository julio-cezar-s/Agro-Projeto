export const TOOLS = ['custo-lucro','calendario-plantio','calculadora-area','calculadora-adubacao','ctc-saturacao','calagem-gessagem','lotacao-pasto','conversao-preco','tempo-retorno','conversor-unidades','estande-plantas','racao-nutricao','sementes-populacao','vacinacao-rebanho','conversao-alimentar','dosagem-defensivos','pastejo-rotacionado','rendimento-carcaca','suplementacao-mineral','home'];
export const EVENT_TYPES = ['view','tool_open','calc','error','perf'];

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...securityHeaders(), ...extra },
  });
}
export function securityHeaders() {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
    'x-frame-options': 'DENY',
  };
}
export function dayManaus(tsSec) {
  return new Date((tsSec - 4 * 3600) * 1000).toISOString().slice(0, 10);
}
export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function deviceFromUA(ua = '') {
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobi|android|iphone/i.test(ua)) return 'mobile';
  return 'desktop';
}
export function sameOrigin(request) {
  const o = request.headers.get('origin');
  if (!o) return true; // sem Origin: requisição não-navegador/same-origin simples
  try { return new URL(o).host === new URL(request.url).host; } catch { return false; }
}
