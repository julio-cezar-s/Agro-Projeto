# Como publicar o Agro Projeto na Cloudflare (plano gratuito, sem domínio próprio)

> Faça isto só quando quiser. Nada aqui foi executado na Cloudflare real: os testes foram feitos com o Worker local (wrangler) e um Google simulado.
> Esta publicação coloca **no mesmo endereço** a home, a Gestão Rural, o AgroPainel, o painel `/admin/`, as APIs, o manifest e os ícones.
> Antes de começar, leia a seção **"Antes de publicar: dados no navegador"** e o `ROLLBACK.md`.
> **Estratégia de lançamento:** plataforma pública, gratuita e sem cadastro; sem anúncios no lançamento. O único login é o do administrador em `/admin/`. Visitantes não fazem login.

## O que será publicado

Um único Worker chamado `agropainel` (nome em `wrangler.toml`; mantido para não quebrar o que já existe), com:

- **Arquivos estáticos** da pasta `public/`: `/` (home), `/GestaoRural.html`, `/AgroPainel.html`, `/manifest.webmanifest`, `/icons/*.png`, `/admin/`.
- **Código do Worker** em `src/` (só responde a `/api/*`): coleta anônima, login do administrador (Google) e estatísticas.
- **Banco D1** `agropainel-db` (ligação `DB`), com a migration `migrations/0001_init.sql`.

Configuração relevante de `wrangler.toml` (não altere sem motivo): `run_worker_first = ["/api/*"]`, `html_handling = "none"`, `not_found_handling = "none"`, `TELEMETRY = "on"`, `RETENTION_DAYS = "90"`.

## Antes de publicar: dados no navegador

Os dados dos usuários ficam no navegador e são separados por endereço (`nelore.v1` na Gestão Rural; `agropainel_db` e `agropainel-*` no AgroPainel). O novo endereço `*.workers.dev` começa **vazio** para todo mundo, e o aplicativo instalado no iPhone também. Antes de divulgar o novo endereço, avise os usuários para **exportar o backup** (Gestão Rural: *Dados*; AgroPainel: *Dados e Backup*). Veja o `README.md`.

## 1. Preparar

1. Crie uma conta em https://dash.cloudflare.com/sign-up (plano gratuito) e confirme o e-mail.
2. No computador, instale o Node.js 22.12 ou mais novo e, **na raiz desta pasta** (onde está `wrangler.toml`), rode:
   ```
   npm ci
   ```
   (Instala exatamente as versões do `package-lock.json`: `wrangler` 4.162.0.)
3. `npx wrangler login` (abre o navegador para autorizar).

## 2. Banco de dados (D1)

```
npx wrangler d1 create agropainel-db
```

Copie o `database_id` mostrado e cole em `wrangler.toml`, no lugar de `COLOQUE-AQUI-O-ID-DO-D1`. Depois aplique a migration no banco **remoto**:

```
npx wrangler d1 migrations apply agropainel-db --remote
```

- A migration só **cria** tabelas (`events`, `sessions`, `auth_rate`, `oauth_state`, `settings`, `audit_log`) e pode ser reaplicada sem erro. Migrations só andam para frente: não existe "desfazer".
- Não rode `wrangler d1 delete`, `DROP TABLE` ou `DELETE FROM` no banco remoto: isso apaga as estatísticas e as sessões.
- Em dúvida entre `--local` e `--remote`: `--local` mexe só no banco de teste do seu computador.

## 3. Login Google (somente a sua conta)

Este é o **único login** da plataforma: protege o painel `/admin/` e vale só para o administrador. Visitantes não têm login nem cadastro.

1. https://console.cloud.google.com → crie um projeto → **APIs e serviços → Tela de permissão OAuth**. Tipo **Externo**, deixe em **Teste** e, em **Usuários de teste**, adicione **somente o seu Gmail** (em modo Teste só ele consegue entrar).
2. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web.**
3. Em **URIs de redirecionamento autorizados** coloque (troque pelo seu subdomínio, que aparece após o primeiro deploy):
   `https://agropainel.SEU-SUBDOMINIO.workers.dev/api/admin/callback`
4. Guarde o **ID do cliente** e a **Chave secreta do cliente**.

## 4. Segredos (nunca ficam no código)

```
npx wrangler secret put ADMIN_EMAIL           # seu Gmail (único autorizado no painel)
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put VISITOR_SALT          # qualquer texto longo e aleatório
```

Se o segredo for criado antes do primeiro deploy, o wrangler pede para criar o Worker: aceite.
Não coloque estes valores em `wrangler.toml`, no código, em prints ou no Git. O arquivo `.dev.vars` (uso local) também nunca deve ser enviado.

**Nunca defina em produção** `GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL`, `GOOGLE_JWKS_URL` nem `GOOGLE_ISSUER`. São variáveis que os testes usam para simular o Google; em produção, se existirem, redirecionam o login para outro servidor.

## 5. Publicar

```
npx wrangler deploy
```

Endereço do site: `https://agropainel.SEU-SUBDOMINIO.workers.dev/` · Painel: `.../admin/`.
Se você ainda não sabia o subdomínio no passo 3, volte lá e cadastre o URI de redirecionamento agora.

O deploy **não** altera nada no banco: só publica o código e os arquivos de `public/`. As migrations são um passo separado (passo 2).

## 6. Conferir depois de publicar

Troque `HOST` pelo endereço publicado.

| Verificação | Resultado esperado |
|---|---|
| `https://HOST/` | Home do Agro Projeto, com links para os dois sistemas |
| `https://HOST/GestaoRural.html` e `#/dash` | Gestão Rural abre; o link "← Agro Projeto" volta à home |
| `https://HOST/AgroPainel.html` e `#/ferramentas` | AgroPainel abre; a lista de ferramentas aparece |
| `https://HOST/manifest.webmanifest` | Status 200, `Content-Type: application/manifest+json` |
| `https://HOST/icons/icon-192.png` (e `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`) | Status 200, `image/png` |
| `https://HOST/admin/` → **Entrar com Google** | Entra com o seu Gmail; os números aparecem em até alguns segundos |
| Outra conta Google no `/admin/` | "Acesso negado" |
| Usar uma ferramenta do AgroPainel e olhar o painel | O evento aparece (ou, com `TELEMETRY=off`, a API responde `t:0`) |
| Instalação (Chrome/Edge no computador ou Android) | O navegador oferece "Instalar aplicativo". Isso **não** significa funcionar offline: não há service worker |

Em **Dados e Backup** (AgroPainel) deve aparecer o aviso de privacidade com o botão de desativar a medição.

## Desligar a medição de forma durável

Não use só o painel da Cloudflare: **variáveis alteradas no painel são sobrescritas no próximo `wrangler deploy`**, a menos que o `wrangler.toml` tenha `keep_vars = true` (que não está configurado aqui).

Maneira segura: no `wrangler.toml`, troque `TELEMETRY = "on"` por `TELEMETRY = "off"` e rode `npx wrangler deploy`. Para ligar de novo, volte para `"on"` e faça o deploy. (Alternativa pontual: `npx wrangler deploy --var TELEMETRY:off`; vale só para aquele deploy.)

Com a medição desligada a API responde `t:0`, o app continua funcionando e os navegadores deixam de enviar eventos.

## Limites do plano gratuito (conferidos na documentação em 10/11/2026 — podem mudar)

- Workers: 100 mil requisições/dia e 10 ms de CPU por chamada. Arquivos estáticos (o app) não consomem essa cota. Cada visita gera ~1 chamada de coleta (os eventos vão em lote), o que dá folga para dezenas de milhares de visitas por dia.
- D1: 5 milhões de linhas lidas/dia, 100 mil escritas/dia, 5 GB. Cada evento = 1 linha escrita (≈ 100 mil eventos/dia). A coleta limita 20 eventos por chamada, 300 por sessão e 30 chamadas/min por visitante. Eventos com mais de 90 dias são apagados automaticamente (`RETENTION_DAYS`, mínimo de 7).
- Ao estourar a cota do dia, a coleta e o painel param até a virada do dia; **o app continua funcionando** (é estático).

## Avisos honestos sobre as regras da Cloudflare

- Não achei proibição explícita de uso comercial nos termos da plataforma de desenvolvedores, mas o plano gratuito é descrito como voltado a projetos pessoais/hobby e a Cloudflare pode alterar ou encerrar serviços gratuitos a seu critério. Releia os Termos antes de divulgar muito.
- O endereço `workers.dev` pertence à Cloudflare (pode ser renomeado). Anúncios **não** fazem parte do lançamento. Quando forem avaliados (anúncios recompensados, veja `ROADMAP-ANUNCIOS.md`), as redes de anúncio provavelmente exigirão domínio próprio, o que precisa ser conferido nas regras de cada uma na hora.
- Não colete dados de cartão neste site (regra do plano gratuito); pagamentos futuros devem ir para um checkout externo.
- Não confirmei se a conta exige cartão de crédito no cadastro; veja na hora de criar a conta.
- Cadastro, contas e login de visitantes ou produtores, dados por produtor, pagamentos e anúncios **não** fazem parte desta publicação, e contas de usuários não estão previstas: a plataforma é pública, gratuita e sem cadastro. O único login é o do administrador (passo 3).
