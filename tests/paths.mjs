// Constantes compartilhadas. SEM efeitos colaterais: pode ser importado por qualquer módulo
// (inclusive o runner) sem instalar handlers de sinal nem criar/alterar arquivos.
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = realpathSync(path.resolve(fileURLToPath(new URL('..', import.meta.url))));
export const SANDBOX_PREFIX = 'agro-projeto-test-';
export const INFO_FILE = 'sandbox.json';
export const WRANGLER = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
export const DB_NAME = 'agropainel-db';
export const IS_WIN = process.platform === 'win32';
