// Conferência da raiz do projeto: os testes NUNCA devem alterar estes arquivos. SEM efeitos colaterais (só lê).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ROOT } from './paths.mjs';

const FILES = ['package.json', 'package-lock.json', 'wrangler.toml', 'README.md', 'DEPLOY.md', 'ROLLBACK.md', '.gitignore'];
const DIRS = ['src', 'public', 'migrations', 'tests', 'admin'];
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');

function walk(abs, rel, out) {
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const a = path.join(abs, e.name), r = rel + '/' + e.name;
    if (e.isDirectory()) walk(a, r, out); else if (e.isFile()) out.set(r, hash(a));
  }
}

// Conteúdo (hash) de: .dev.vars*, .env*, arquivos de configuração, src/, public/, migrations/, tests/, admin/.
// Em .wrangler/ só se registra a PRESENÇA dos bancos D1 locais (um `npm run dev` aberto altera tamanho e data
// desses arquivos legitimamente; o que não pode acontecer é um banco sumir).
export function snapshotRoot() {
  const m = new Map();
  for (const f of FILES) if (existsSync(path.join(ROOT, f))) m.set(f, hash(path.join(ROOT, f)));
  for (const e of readdirSync(ROOT, { withFileTypes: true })) {
    if (e.isFile() && (e.name === '.dev.vars' || e.name.startsWith('.dev.vars.') || e.name === '.env' || e.name.startsWith('.env.'))) m.set(e.name, hash(path.join(ROOT, e.name)));
  }
  for (const d of DIRS) { const a = path.join(ROOT, d); if (existsSync(a) && statSync(a).isDirectory()) walk(a, d, m); }
  const d1 = path.join(ROOT, '.wrangler', 'state', 'v3', 'd1');
  if (existsSync(d1)) { const tmp = new Map(); walk(d1, '.wrangler/state/v3/d1', tmp); for (const k of tmp.keys()) m.set(k, 'presente'); }
  return m;
}

export function compareRoot(before, after) {
  const diffs = [];
  for (const [k, v] of before) {
    if (!after.has(k)) diffs.push('removido: ' + k);
    else if (after.get(k) !== v) diffs.push('alterado: ' + k);
  }
  for (const k of after.keys()) if (!before.has(k) && !k.startsWith('.wrangler/')) diffs.push('criado: ' + k);
  return diffs;
}
