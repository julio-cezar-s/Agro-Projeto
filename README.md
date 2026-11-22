# Agro Projeto

Plataforma que reúne dois sistemas independentes, publicados juntos no mesmo endereço:

| Sistema | Arquivo | O que é |
|---|---|---|
| **Home Agro Projeto** | `public/index.html` | Página inicial com a escolha entre os dois sistemas. |
| **Gestão Rural** | `public/GestaoRural.html` | Controle da fazenda (rebanho, pastos, finanças, agenda etc.). Arquivo único, dados no navegador. |
| **AgroPainel** | `public/AgroPainel.html` | Calculadoras e ferramentas para o campo (19 ferramentas). Arquivo único, dados no navegador, com medição anônima opcional. |
| **Painel administrativo** | `public/admin/` + `src/` | Estatísticas de uso do AgroPainel, com login Google restrito a um e-mail. Roda em Cloudflare Worker + banco D1. |

Os dois sistemas continuam **separados por dentro**: cada um tem o seu próprio armazenamento e o seu próprio código. A integração é só de navegação (links entre as páginas) e de identidade visual (manifest e ícones).

> Estado desta pasta: **Fase 6 (somente documentação)**. Nada foi publicado, commitado ou enviado a qualquer serviço a partir dela.
> Nada aqui foi testado na Cloudflare real, nem em aparelhos reais (veja "Limitações").
> A Fase 6 só alterou arquivos `.md` em relação à Fase 5: código, Worker, banco, configuração e testes são idênticos.

## Estratégia do produto

- **Plataforma pública e gratuita.** Qualquer pessoa abre o endereço e usa a Gestão Rural e o AgroPainel, sem pagar.
- **Sem cadastro, login, senha ou conta para visitantes.** Os dados do usuário ficam no navegador dele (veja "Privacidade e medição").
- **Sem anúncios no lançamento.**
- **Único login existente:** o do administrador, em `/admin/`, com Google e restrito a um e-mail (`ADMIN_EMAIL`). Ele serve só para ver as estatísticas de uso e não é aberto a visitantes.
- **Monetização futura (não implementada):** anúncios recompensados, em que o usuário assiste a um anúncio, confirma, e isso libera uma ferramenta. Está só planejada, em **`ROADMAP-ANUNCIOS.md`**.

## Estrutura da pasta

```
.
├── README.md             este arquivo
├── DEPLOY.md             como publicar na Cloudflare
├── ROLLBACK.md           como voltar atrás
├── ROADMAP-ANUNCIOS.md   plano (não implementado) de monetização futura com anúncios recompensados
├── wrangler.toml         configuração do Worker, dos arquivos estáticos e do D1
├── package.json          scripts (dev, test), versões exatas (wrangler, playwright) e Node mínimo
├── package-lock.json     trava todas as dependências (instale com npm ci)
├── .gitignore            ignora .wrangler/, node_modules/ e .dev.vars
├── migrations/
│   └── 0001_init.sql     cria as tabelas do banco (pode ser reaplicada sem erro)
├── src/                  Worker: index.js (rotas), auth.js, collect.js, stats.js, util.js
├── tests/                testes automáticos do Worker (isolados em sandbox temporária; veja "npm test")
│                         run.mjs (runner), lib.mjs (sandbox), runner-core/proc/rootguard/stale/paths (apoio)
├── admin/                pasta vazia, sem uso (pode ser ignorada)
└── public/               tudo o que é servido ao navegador
    ├── index.html            home
    ├── GestaoRural.html      Gestão Rural
    ├── AgroPainel.html       AgroPainel
    ├── manifest.webmanifest  manifest de instalação (PWA)
    ├── icons/                icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
    └── admin/                index.html, admin.css, admin.js (painel administrativo)
```

## Endereços e navegação

| Endereço | O que abre |
|---|---|
| `/` | Home (o Worker serve `/index.html`) |
| `/GestaoRural.html` | Gestão Rural |
| `/AgroPainel.html` | AgroPainel |
| `/admin/` | Painel administrativo (exige login Google do administrador; é o único login do sistema, sem login para visitantes) |
| `/api/*` | API do Worker (coleta de telemetria, login e estatísticas) |
| `/manifest.webmanifest` | Manifest de instalação |
| `/icons/*.png` | Ícones |

A navegação dentro de cada sistema usa **rotas por hash** (`#...`), que funcionam com os botões voltar/avançar do navegador:

- **AgroPainel:** `#/ferramentas` (lista), `#/categoria/<categoria>`, `#/ferramenta/<ferramenta>`.
- **Gestão Rural:** `#/<tela>`, onde a tela é uma de: `dash`, `animals`, `pasto`, `repro`, `sanit`, `pes`, `estoque`, `fin`, `agenda`, `calc`, `rel`, `ana`, `notes`, `data`.
- Cada sistema tem um link discreto "← Agro Projeto" para voltar à home; a home tem links para os dois.

As páginas são documentos HTML separados (sem iframes e sem aplicação de página única). Trocar de sistema recarrega a página.

## Onde ficam os dados (importante)

Todos os dados dos usuários ficam **no navegador do próprio usuário**, não no servidor:

| Sistema | Onde | Chave |
|---|---|---|
| Gestão Rural | `localStorage` | `nelore.v1` |
| AgroPainel | `IndexedDB` | banco `agropainel_db` |
| AgroPainel | `localStorage` | chaves que começam com `agropainel-` |

O navegador separa o armazenamento **por endereço de origem** (protocolo + domínio + porta). Por isso, cada um destes é um armazenamento diferente, e os dados **não** passam de um para o outro:

- abrir o arquivo direto do disco (`file://...`);
- `http://localhost:8787` (servidor local) e qualquer outra porta;
- `https://agropainel.<seu-subdomínio>.workers.dev`;
- o site antigo no GitHub Pages, se ainda existir;
- o aplicativo instalado na tela inicial do iPhone/iPad (veja "Instalação").

**Ao trocar de endereço, os dados não vêm junto.** Antes de mudar, use o **backup** de cada sistema (Gestão Rural: tela *Dados*; AgroPainel: *Dados e Backup*) e importe no novo endereço. Limpar os dados do navegador apaga tudo isso, e o servidor não tem cópia.

A medição do AgroPainel é anônima e pode ser desligada (veja "Privacidade"). A Gestão Rural não envia dados a ninguém.

## Executar localmente

Existem dois modos.

### A) Só abrir os arquivos (sem instalar nada)

Dê dois cliques em `public/index.html`, `public/GestaoRural.html` ou `public/AgroPainel.html`. Funciona para usar as calculadoras e a Gestão Rural.

Limitações deste modo: o painel administrativo e a coleta de medição **não** funcionam (não há Worker); o manifest e os ícones não são aplicados nem permitem instalar; os dados ficam no armazenamento de `file://`, separado de qualquer outro endereço (conforme o navegador, cada arquivo pode até ter armazenamento próprio).

### B) Com o Worker local (reproduz o site publicado)

Requisitos: Node.js 22.12 ou mais novo (veja "Instalar as dependências", abaixo).

```
npm ci
npx wrangler d1 migrations apply agropainel-db --local
npm run dev
```

- `--local` aplica a migration só no banco **local** de teste (pasta `.wrangler/`). Nunca use `--remote` por engano: ele altera o banco real da Cloudflare.
- `npm run dev` inicia o Worker em `http://localhost:8787`, com o site completo, as APIs e o D1 local.
- O `database_id` real só é necessário para o modo remoto; o modo local usa o banco simulado em `.wrangler/`. (Estes comandos não foram executados durante a documentação.)

**Login do painel administrativo no modo local (opcional).** Crie o arquivo `.dev.vars` na raiz da pasta (ele está no `.gitignore` e nunca deve ser enviado):

```
ADMIN_EMAIL=seu-gmail@exemplo.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
VISITOR_SALT=um-texto-longo-e-aleatorio
```

Para o login Google funcionar localmente, o cliente OAuth precisa aceitar `http://localhost:8787/api/admin/callback` como URI de redirecionamento. Sem `.dev.vars`, o site e as ferramentas funcionam normalmente; só o login do painel não.

### Instalar as dependências (reprodutível)

O projeto fixa as versões exatas: `wrangler` 4.162.0 e `playwright` 1.63.0 (`package.json`), com todas as sub-dependências travadas em `package-lock.json`. Exige **Node.js 22.12 ou mais novo** (o `wrangler` 4.162.0 pede isso).

```
npm ci
npx playwright install chromium    # só se for rodar os testes (baixa o navegador)
```

- Use **`npm ci`**, não `npm install`: ele instala exatamente o que está no lockfile e falha se `package.json` e lockfile divergirem.
- Para atualizar uma versão de propósito: altere `package.json`, rode `npm install --package-lock-only`, revise o diff do lockfile e teste antes de publicar.
- `node_modules/` e `.wrangler/` não entram no ZIP nem no Git.

### Testes automáticos (`npm test`) — seguros por padrão

```
npm test
```

O `npm test` **não cria, altera nem apaga nada na pasta do projeto**: nem o seu `.dev.vars`, nem o banco local do `npm run dev` (`.wrangler/`), nem qualquer outro arquivo. Como funciona:

- **Sandbox temporária.** Cada arquivo de teste cria uma pasta nova em `os.tmpdir()` (`agro-projeto-test-XXXX`) com uma **cópia** de `wrangler.toml`, `src/`, `public/` e `migrations/`, e roda o `wrangler` com essa pasta como diretório de trabalho.
- **Banco D1 temporário.** O banco local de teste fica dentro da sandbox (`--local --persist-to`, o mesmo caminho para `wrangler dev` e `wrangler d1 execute`). As migrations (cópias) são aplicadas só nele. Os `DELETE FROM` e `INSERT` dos testes agem só nesse banco.
- **Variáveis de teste em arquivo temporário.** O `.dev.vars` que os testes precisam (e-mail de teste, Google simulado) é criado **dentro da sandbox**. O Worker de teste nunca lê o `.dev.vars` da raiz.
- **Logs e registros do wrangler dentro da sandbox** (`WRANGLER_LOG_PATH`, `WRANGLER_REGISTRY_PATH`, `XDG_CONFIG_HOME`). As variáveis `CLOUDFLARE_*`, `CF_*` e `WRANGLER_*` do seu ambiente não chegam ao wrangler dos testes, que nunca acessa a Cloudflare real. (Se existir a pasta legada `~/.wrangler`, o wrangler pode continuar a usá-la para itens que não sejam log nem registro.)
- **Argumentos fixos.** Os testes não conseguem alterar `cwd`, ambiente nem `--persist-to`; os argumentos extras do Worker só aceitam pares `--var NOME:valor` (qualquer outro, como `--config`, `--env-file` ou `--remote`, é recusado antes de iniciar qualquer processo).
- **Portas livres**, escolhidas na hora (não há portas fixas).
- **Processos.** Só são encerrados processos iniciados pelo próprio teste: no Linux/macOS, o grupo de processos criado para o `wrangler dev` (inclusive quando o processo líder já terminou e restou algum filho, desde que o `ps` confirme que o grupo ainda tem membros); no Windows, `taskkill /PID <líder> /T /F`. Não há `pkill`.
- **Limpeza.** A sandbox é apagada ao final, mesmo com falha, Ctrl+C, SIGTERM ou SIGHUP (com novas tentativas se o sistema ainda estiver liberando os arquivos).
- **Ctrl+C.** O runner (`tests/run.mjs`) para imediatamente: não inicia os testes seguintes, avisa o teste em andamento para limpar a própria sandbox e, se ele não terminar em 15 s (ou em um segundo sinal), força o encerramento.
- **Falhas.** Um teste só conta como aprovado se terminar com status 0, sem sinal e sem erro ao iniciar. Teste morto por sinal ou que não inicia é falha, e o `npm test` também falha se algum teste deixar de ser executado.
- **Conferência da raiz.** Antes e depois, o runner compara o hash de `.dev.vars*`, `.env*`, `package.json`, `package-lock.json`, `wrangler.toml`, `src/`, `public/`, `migrations/`, `tests/`, `admin/` e dos três `.md`, e confirma que os bancos D1 de `.wrangler/` continuam existindo (sem comparar tamanho nem data, para não dar alarme falso com o `npm run dev` aberto). Se algo mudar, sai com erro (código 3) listando os arquivos. **Não existe variável de ambiente nem opção que desligue essas proteções.**
- **Pré-requisitos verificados antes de começar** (sem escrever nada no projeto): Node ≥ 22.12, `wrangler` e `playwright` instalados localmente nas versões fixadas (`npm ci`) e **abertura real do Chromium headless** (o mesmo modo do teste; o caminho do Chromium "completo" não serve de prova, porque o modo headless usa outro executável). Se faltar algo, o `npm test` para com a instrução do que fazer.
- Só o `beacon.test.mjs` usa o Playwright; os outros três (`auth`, `collect`, `stats`) usam apenas o `wrangler`.

**Se uma execução for morta à força** (SIGKILL, fechar o terminal sem aviso, queda de energia), pode sobrar uma pasta `agro-projeto-test-*` em `/tmp` (ou `%TEMP%`) e, no Linux/macOS, até um `wrangler dev` em segundo plano. Cada sandbox guarda um `sandbox.json` (processo dono, PID/grupo/porta do `wrangler dev`, data). O `npm test` seguinte e o comando `node tests/stale.mjs` **apenas listam** essas sandboxes, informando se os processos ainda existem e se a linha de comando deles contém o caminho da sandbox (prova de que são dos testes), e sugerem o comando manual de encerramento. Nada é apagado nem encerrado automaticamente; a única exceção é quando o próprio runner precisou forçar o fim de um teste: aí ele encerra apenas os processos confirmados como daquele teste (no Windows isso não é confirmável, então só informa).

**Limitações conhecidas:**
- No Windows, se o `wrangler` terminar sozinho e deixar o `workerd` órfão, não há como localizar a árvore depois (o `taskkill /T` precisa do líder vivo). Por isso o código encerra a árvore antes de o líder sair. Esse comportamento ainda não foi testado em Windows nem no terminal do VS Code.
- O encerramento no macOS não foi testado (usa `ps -A -o pid=,pgid=,stat=,args=`).
- Se você deixar um `npm run dev` aberto, o `.wrangler/` muda legitimamente; a conferência da raiz ignora isso e só acusa se um banco D1 local desaparecer.

> A suíte completa **ainda não foi executada** com o novo isolamento. Faça a primeira execução numa cópia, em ambiente seguro, e confira a saída. As verificações feitas até aqui foram estáticas e com demonstrações inofensivas (sem `wrangler` real).

Os testes de coleta e login usam endereços Google simulados (`GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL`, `GOOGLE_JWKS_URL`, `GOOGLE_ISSUER`), definidos só dentro da sandbox. **Nunca defina essas variáveis em produção** (veja `DEPLOY.md`).

## Instalação como aplicativo (PWA)

O Agro Projeto tem `manifest.webmanifest` e ícones. Com isso, os navegadores compatíveis permitem **instalar** o site como um aplicativo na tela inicial/área de trabalho, abrindo em janela própria.

- **Identificação:** nome "Agro Projeto", `start_url` `/`, escopo `/` (inclui `/admin/` e as duas ferramentas), modo `standalone`, cor do tema `#0e3b24`.
- **Ícones:** 192×192, 512×512, 512×512 *maskable* (Android) e `apple-touch-icon` 180×180 (iOS).
- **Chrome / Edge (computador e Android):** pelo ícone de instalação da barra de endereço ou pelo menu ("Instalar aplicativo" / "Adicionar à tela inicial"). Só aparece em endereço seguro (`https://` ou `localhost`); **não** funciona em `file://`.
- **iPhone / iPad (Safari):** botão Compartilhar → "Adicionar à Tela de Início".
- A instalação **não precisa** de service worker neste projeto, e **não há** service worker.

### Limitações da instalação (leia)

1. **Não funciona offline.** Não existe service worker nem cache offline. O aplicativo instalado é, na prática, um atalho que abre o site: **sem internet, ele não abre** (ou mostra a página de erro do navegador). Nada neste projeto promete uso offline.
2. **iOS isola o armazenamento.** No iPhone/iPad, o aplicativo instalado na tela inicial **não compartilha** `localStorage` nem `IndexedDB` com o Safari. Quem instalar começa com **tudo vazio**: precisa exportar o backup no Safari e importar no aplicativo instalado. O contrário também vale.
3. **Armazenamento por endereço.** Se o endereço publicado mudar (outro subdomínio, domínio próprio), o aplicativo instalado e os dados antigos ficam no endereço antigo.
4. **Teste limitado.** O critério de instalação foi verificado em Chromium (computador). Edge e Android foram apenas emulados e o iOS **não foi testado** em aparelho real.
5. **Desinstalar/limpar** os dados do site no navegador pode apagar os dados salvos nele. Faça backup antes.

## Publicação e retorno

- Publicar na Cloudflare: **`DEPLOY.md`**.
- Voltar atrás, com os arquivos de referência e os hashes: **`ROLLBACK.md`**.

## Privacidade e medição (AgroPainel)

- Coleta anônima de uso (quais ferramentas são abertas), enviada para `/api/collect`. O visitante é um identificador diário: um hash de IP + navegador + dia + `VISITOR_SALT` secreto (o IP é usado só para calcular o hash, não é gravado). São gravados apenas: tipo do evento, ferramenta (de uma lista fixa), país, tipo de aparelho (celular/tablet/computador) e um número opcional limitado (`val`). O servidor rejeita qualquer ferramenta fora da lista.
- Eventos com mais de 90 dias são apagados automaticamente (`RETENTION_DAYS`).
- Pode ser desligada por `TELEMETRY = "off"` (veja `DEPLOY.md`) e o usuário pode desativá-la em *Dados e Backup*.
- O painel `/admin/` só aceita login Google do e-mail definido em `ADMIN_EMAIL`. Sessão no cookie `__Host-ap_session` (8 h de inatividade, 7 dias no máximo), com limite de tentativas de login.
- Não há cadastro, contas de usuário, login de visitante ou de produtor, pagamentos nem anúncios, e **não estão previstos para o lançamento**: a plataforma é pública, gratuita e sem cadastro. Os dados dos usuários ficam no próprio navegador.
- Anúncios recompensados são uma ideia para depois do lançamento e **não estão implementados**; o plano e os cuidados com privacidade estão em `ROADMAP-ANUNCIOS.md`.

## Pendências e observações conhecidas

- Nada foi publicado na Cloudflare real; o `database_id` em `wrangler.toml` é um espaço reservado.
- Sem README anterior: este é o primeiro. `DEPLOY.md` e `ROLLBACK.md` foram reescritos na Fase 4B.
- A pasta `admin/` na raiz está vazia e sem uso (o painel está em `public/admin/`). Não foi removida porque a Fase 4B não altera a estrutura.
- A suíte de testes isolada (Fase 5) ainda não foi executada de ponta a ponta; veja o aviso em "npm test".
- O `database_id` e o fluxo de login/Cloudflare reais continuam sem teste na Cloudflare.
- Gestão Rural protege contra edição em duas abas: se outra aba salvar, a aba antiga bloqueia o salvamento e pede "Recarregar dados atualizados" (não mescla).

## Histórico das fases

| Fase | Conteúdo |
|---|---|
| 0 | Verificação somente leitura (testes, backup/restauração, hashes). |
| 1 | Home em `public/index.html` e correção da rota `/`. |
| 2 | Navegação integrada por hash, volta à home, botões voltar/avançar. |
| 3A / 3B | Correções de usabilidade no celular (campos de 16 px, alvos de 44 px, rótulos e legendas). |
| 4 | `manifest.webmanifest`, 4 ícones PNG e metadados nas três páginas. |
| 4B | Documentação (somente arquivos `.md` alterados). |
| 5 | Segurança do ambiente de testes: `npm test` isolado em sandbox temporária, versões fixadas, `package-lock.json`, Node ≥ 22.12; revisão e correções A–I (Ctrl+C, falha por sinal, árvore de processos, sandboxes abandonadas, argumentos fixos, logs na sandbox, Chromium headless, conferência da raiz). |
| 6 (Docs) | Documentação da nova estratégia (plataforma pública, gratuita, sem cadastro e sem anúncios no lançamento; login só do administrador) e criação de `ROADMAP-ANUNCIOS.md`. Somente arquivos `.md`; nenhum arquivo de código, banco, Worker, configuração ou teste foi alterado. |
