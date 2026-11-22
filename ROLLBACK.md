# Como voltar atrás (rollback) — Agro Projeto

Princípio: a publicação na Cloudflare é **paralela**. Nada aqui apaga dados de usuários, e nenhum passo abaixo exige apagar banco, `.dev.vars` ou dados do navegador.

## Regras de segurança

- **Não rode** `wrangler d1 delete`, `DROP TABLE`, `DELETE FROM` ou `rm -rf` como parte de um retorno. Nenhum nível abaixo precisa disso.
- Desde a Fase 5 o `npm test` não toca no `.dev.vars` nem no banco local do projeto (usa uma sandbox temporária; veja o `README.md`). Em fases **anteriores** (4B e antes) ele sobrescrevia e apagava o `.dev.vars` e apagava linhas do D1 local: **nunca rode `npm test` numa cópia de fase anterior** que contenha o seu `.dev.vars`.
- Rollback de código **não desfaz** migrations nem dados do D1. As migrations só andam para frente.
- Guarde os ZIPs das fases (`Agro-Projeto-Fase4.zip`, `Agro-Projeto-Fase4B.zip`, `Agro-Projeto-Fase5.zip`, `Agro-Projeto-Fase6-Docs.zip` etc.) **fora** da pasta do projeto.

## Versão de referência (Fase 5, idêntica na Fase 6-Docs)

A Fase 6-Docs só alterou arquivos `.md` (documentação da estratégia pública, gratuita e sem cadastro, e `ROADMAP-ANUNCIOS.md`). Os arquivos abaixo são **idênticos** nas Fases 5 e 6-Docs, então os mesmos hashes valem para as duas. Como não há anúncios nem contas de visitantes, não há nada novo a reverter: voltar para a Fase 5 ou para a 6-Docs produz o mesmo site.

Arquivos que o rollback para esta fase deve reproduzir exatamente (SHA-256):

| Arquivo | SHA-256 |
|---|---|
| `public/index.html` | `ebbda83a94ba0f7a9344b5b1a4fb9eecf3646fe6155148e586b0f2c4a71102e1` |
| `public/AgroPainel.html` | `8bd16497e25240c882c51fbf4d54b24238fe78e58a6cd081e0c33f369f310121` |
| `public/GestaoRural.html` | `b8a9ab47bd4f7ea6b036dc3c3c9326449f2e6a38e167b5a8a4e797904fddc57f` |
| `public/manifest.webmanifest` | `2e731162a04e143661cc410c177b697d9d85de23e3e167345130b262c59a5bdf` |
| `public/icons/icon-192.png` | `cb7fccc883d2c8edbf7aad1de0cd64b6fbcce8f800849dbdbf100b0a333861ce` |
| `public/icons/icon-512.png` | `84d021f0b8cdda22e737a32863c003719e61810544ccc5cb4b70c2271bcbd051` |
| `public/icons/icon-maskable-512.png` | `aea35f1e5cf9a61a02a949df3e63beaa4007dd44defa4e8796537e840c3abe88` |
| `public/icons/apple-touch-icon.png` | `c4e394b35e8f7394fc9aa13e244b79d34a05b8f20e15db7a96425a7a30f1b822` |
| `src/index.js` | `74205f661a8c9e9b6603caf0eacc1ecc34e5ed207d6b9297a59b3ee29c572f10` |
| `wrangler.toml` | `a42e1e77352f6b1a2468ca123e6abb921ca95d833879eeaaaac8e570dbbea85a` |
| `migrations/0001_init.sql` | `968467020499f291d7ac7afc5cf6d10c3a36a5ad5ec21af92c0417db51706b5f` |
| `package.json` | `6cfcff1f84006ee30656ef89f975daa7fa1926d6e06749bb61b289e37645caa4` |
| `package-lock.json` | `62a54938da8d1424d722cf074118b65ce420d1f324af84442c0bd3510e13c298` |

Conferir (somente leitura): `sha256sum public/index.html public/AgroPainel.html public/GestaoRural.html public/manifest.webmanifest public/icons/*.png src/index.js wrangler.toml migrations/0001_init.sql package.json package-lock.json`

## Níveis de retorno (do mais leve ao mais completo)

1. **Parar só a medição (sem mexer nos sistemas):** em `wrangler.toml`, troque `TELEMETRY = "on"` por `"off"` e rode `npx wrangler deploy`.
   A API passa a responder `t:0`, os navegadores param de enviar eventos e o app continua normal.
   (Mudar só no painel da Cloudflare **não é durável**: o próximo `wrangler deploy` sobrescreve a variável.)
2. **Voltar a versão anterior do Worker:** painel da Cloudflare (Workers → agropainel → Deployments → Rollback) ou `npx wrangler rollback`.
   - Reverte **apenas o código** (e, conforme a Cloudflare, até as últimas 100 versões). **Não** reverte o banco D1 nem os segredos.
   - A documentação consultada **não deixa claro** se os arquivos estáticos (`public/`) voltam junto. Depois do rollback, confira o resultado na prática (tabela do passo 6 do `DEPLOY.md`); se a home ou o manifest não estiverem como esperado, use o nível 3.
3. **Republicar uma fase anterior a partir do ZIP:** extraia o ZIP da fase desejada em **outra pasta** (nunca por cima de uma pasta com `.dev.vars`), copie para lá o `database_id` real em `wrangler.toml` e rode `npx wrangler deploy`. Não rode migrations de novo, a menos que a fase tenha uma migration nova.
   - Fases e o que mudam nos arquivos públicos: Fase 1 = home; 2 = navegação por hash; 3A/3B = ajustes de celular; 4 = manifest e ícones. A 4B só muda `.md`; a 5 só muda `package.json`, `package-lock.json`, `tests/` e `.md` (nenhum arquivo público, Worker ou banco). Voltar à Fase 3B, por exemplo, tira o manifest e os ícones (a instalação deixa de ser oferecida). Os dados dos usuários não são afetados.
   - Os ZIPs só servem se você os guardou. Esta pasta não os contém.
4. **Voltar ao AgroPainel antigo no GitHub Pages — só se ainda estiver publicado.** Não consegui verificar isso nesta pasta. Se existir, é um endereço **diferente**, com armazenamento separado: usuários que tinham dados no endereço da Cloudflare não os veem lá, e vice-versa. Peça o backup (*Dados e Backup*) antes de mandar alguém para outro endereço. O GitHub Pages só tinha o AgroPainel (a Gestão Rural e a home não existiam lá).
5. **Emergência (Cloudflare fora do ar ou conta suspensa):** os arquivos `public/index.html`, `public/GestaoRural.html` e `public/AgroPainel.html` podem ser abertos direto no computador (`file://`) ou hospedados em outro serviço estático. Isso **não** é uso offline de aplicativo instalado: o painel `/admin/`, a medição, o manifest e a instalação não funcionam assim, e os dados ficam no armazenamento daquele endereço (veja abaixo).

## Atenção: dados salvos são por endereço

Gestão Rural (`nelore.v1`) e AgroPainel (`agropainel_db`, `agropainel-*`) guardam os dados no navegador, separados por endereço.
Trocar de endereço (Cloudflare ↔ GitHub Pages ↔ `localhost` ↔ `file://`) mostra armazenamento diferente, não perdido.
No iPhone/iPad, o aplicativo instalado na tela inicial também tem armazenamento próprio, separado do Safari.
Por isso, antes de qualquer troca de endereço: **exportar o backup** de cada sistema e importar no destino.
Nenhum nível acima apaga os dados que já estão no navegador dos usuários; limpar os dados do site, sim.

## Regras da migração

- Não apague o repositório antigo nem desligue o GitHub Pages (se existir) até o novo site rodar bem por, pelo menos, duas semanas.
- Nenhuma troca de domínio ou DNS (não há domínio próprio).
- Só divulgue o novo endereço depois de: login do painel funcionando, coleta recebendo eventos reais, verificação do passo 6 do `DEPLOY.md` feita e testes locais passando em uma cópia (lembre do aviso sobre `npm test`).
