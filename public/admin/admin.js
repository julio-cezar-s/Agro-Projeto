'use strict';
// Painel administrativo — módulos registrados em MODULES (fases futuras adicionam novos itens aqui).
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (n == null ? '—' : Number(n).toLocaleString('pt-BR'));
const TOOL_NAMES = { 'custo-lucro': 'Custo e Lucro', 'calendario-plantio': 'Calendário de Plantio', 'calculadora-area': 'Área', 'calculadora-adubacao': 'Adubação', 'ctc-saturacao': 'CTC e Saturação', 'calagem-gessagem': 'Calagem e Gessagem', 'lotacao-pasto': 'Lotação de Pasto', 'conversao-preco': 'Conversão de Preço', 'tempo-retorno': 'Payback', 'conversor-unidades': 'Conversor de Unidades', 'estande-plantas': 'Estande de Plantas', 'racao-nutricao': 'Ração e Nutrição', 'sementes-populacao': 'Sementes e População', 'vacinacao-rebanho': 'Vacinação', 'conversao-alimentar': 'Conversão Alimentar', 'dosagem-defensivos': 'Dosagem de Defensivos', 'pastejo-rotacionado': 'Pastejo Rotacionado', 'rendimento-carcaca': 'Rendimento de Carcaça', 'suplementacao-mineral': 'Suplementação Mineral', home: 'Início' };
async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: 'same-origin', ...opts, headers: { 'x-requested-with': 'agropainel', ...(opts.headers || {}) } });
  if (r.status === 401) { const e = new Error('401'); e.auth = true; throw e; }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
const MODULES = [
  { id: 'visao', title: 'Visão geral', render: renderOverview },
];
let days = 7;

function bars(series, key) {
  const max = Math.max(1, ...series.map(s => s[key] || 0));
  return `<div class="bars" role="img" aria-label="Gráfico diário">${series.map(s => `<i style="height:${Math.round(((s[key] || 0) / max) * 100)}%" title="${esc(s.day)}: ${fmt(s[key] || 0)}"></i>`).join('')}</div>
  <div class="axis"><span>${esc(series[0].day.slice(5))}</span><span>${esc(series[series.length - 1].day.slice(5))}</span></div>`;
}
function ranking(rows, nameFn, valKey) {
  const max = Math.max(1, ...rows.map(r => r[valKey] || 0));
  return rows.length ? rows.map(r => `<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px"><span>${esc(nameFn(r))}</span><b>${fmt(r[valKey])}</b></div><div class="hb"><i style="width:${Math.round((r[valKey] / max) * 100)}%"></i></div></div>`).join('') : '<p class="muted">Sem dados no período.</p>';
}
async function renderOverview(el) {
  el.innerHTML = `<div class="range">${[1, 7, 30, 90].map(d => `<button type="button" data-d="${d}" class="${d === days ? 'on' : ''}">${d === 1 ? 'Hoje' : d + ' dias'}</button>`).join('')}</div><div id="stats"><p class="muted">Carregando…</p></div>`;
  el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { days = +b.dataset.d; renderOverview(el); });
  const s = await api('/api/admin/stats?days=' + days);
  const t = s.totals || {};
  $('#stats').innerHTML = `
  <div class="grid">
    <div class="card kpi"><b>${fmt(t.visitor_days)}</b><span>Visitantes (soma diária)</span></div>
    <div class="card kpi"><b>${fmt(t.views)}</b><span>Visualizações</span></div>
    <div class="card kpi"><b>${fmt(t.calcs)}</b><span>Cálculos feitos</span></div>
    <div class="card kpi"><b>${fmt(s.realtime)}</b><span>Ativos nos últimos 5 min</span></div>
    <div class="card kpi"><b class="${t.errors ? 'err' : ''}">${fmt(t.errors)}</b><span>Erros</span></div>
    <div class="card kpi"><b>${s.perf.p50 == null ? '—' : fmt(s.perf.p50) + ' ms'}</b><span>Carga (mediana) · p95 ${s.perf.p95 == null ? '—' : fmt(s.perf.p95) + ' ms'}</span></div>
  </div>
  <div class="card" style="margin-bottom:14px"><h2>Visitantes por dia</h2>${bars(s.series, 'visitors')}</div>
  <div class="card" style="margin-bottom:14px"><h2>Cálculos por dia</h2>${bars(s.series, 'calcs')}</div>
  <div class="card" style="margin-bottom:14px"><h2>Ferramentas mais usadas (cálculos)</h2>${ranking(s.tools.filter(x => x.calcs || x.opens), r => TOOL_NAMES[r.tool] || r.tool, 'calcs')}
    <table style="margin-top:10px"><thead><tr><th>Ferramenta</th><th>Aberturas</th><th>Cálculos</th></tr></thead><tbody>${s.tools.map(r => `<tr><td>${esc(TOOL_NAMES[r.tool] || r.tool)}</td><td>${fmt(r.opens)}</td><td>${fmt(r.calcs)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Sem dados.</td></tr>'}</tbody></table></div>
  <div class="grid">
    <div class="card"><h2>Dispositivos</h2>${ranking(s.devices, r => ({ mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet' }[r.device] || r.device), 'n')}</div>
    <div class="card"><h2>Países</h2>${ranking(s.countries, r => r.country, 'n')}</div>
    <div class="card"><h2>Erros por ferramenta</h2>${ranking(s.errors, r => TOOL_NAMES[r.tool] || r.tool, 'n')}</div>
  </div>
  <p class="muted">${esc(s.note)}</p>`;
}
function showLogin() {
  $('#nav').hidden = true; $('#who').hidden = true;
  $('#view').innerHTML = '<div class="center card"><h2>Área restrita</h2><p class="muted">Entre com a conta Google autorizada.</p><a class="btn pri" href="/api/admin/login">Entrar com Google</a></div>';
}
function buildNav(active) {
  const nav = $('#nav'); nav.hidden = MODULES.length < 2;
  nav.innerHTML = MODULES.map(m => `<button type="button" data-m="${m.id}" class="${m.id === active ? 'on' : ''}">${esc(m.title)}</button>`).join('');
  nav.querySelectorAll('button').forEach(b => b.onclick = () => openModule(b.dataset.m));
}
async function openModule(id) {
  const m = MODULES.find(x => x.id === id) || MODULES[0];
  buildNav(m.id);
  try { await m.render($('#view')); } catch (e) { if (e.auth) return showLogin(); $('#view').innerHTML = '<p class="err">Não foi possível carregar os dados.</p>'; }
}
async function start() {
  try {
    const me = await api('/api/admin/me');
    $('#whoMail').textContent = me.email; $('#who').hidden = false;
    $('#logoutBtn').onclick = async () => { try { await api('/api/admin/logout', { method: 'POST', headers: { origin: location.origin } }); } catch {} location.reload(); };
    openModule(MODULES[0].id);
  } catch (e) { showLogin(); }
}
start();
