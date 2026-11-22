# Roadmap de monetização futura: anúncios recompensados

> **Status: somente planejamento. Nada aqui está implementado.** Não há anúncios, contas, login de visitante, pagamentos nem qualquer código relacionado a isso no projeto (Fase 6-Docs). Este documento registra a ideia para que ela não se perca e para que as decisões de hoje não a atrapalhem.

## 1. Contexto e princípios

O Agro Projeto é uma plataforma **pública, gratuita e sem cadastro**, **sem anúncios no lançamento**. Isso é a base e não muda com este roadmap.

Princípios que qualquer monetização futura precisa respeitar:

1. **Sem cadastro, login, senha ou conta para visitantes.** Anúncio recompensado não pode virar pretexto para criar contas.
2. **Os dados do usuário continuam dele.** Gestão Rural (`nelore.v1`) e AgroPainel (`agropainel_db`, `agropainel-*`) ficam no navegador. Exportar e importar backup nunca pode ficar atrás de anúncio.
3. **Não quebrar o que já funciona.** Gestão Rural, AgroPainel, dados locais, APIs, Worker e `/admin/` seguem como estão. Os dois sistemas continuam separados por dentro.
4. **Opcional para o usuário.** Ver anúncio é uma troca voluntária; quem não quiser ver continua com o que é gratuito.
5. **Serviços gratuitos primeiro**, sem exigir investimento para começar.
6. **Cada etapa só com aprovação explícita.** Nada deste documento avança sozinho.

## 2. A ideia: anúncios recompensados

Fluxo previsto, do ponto de vista do usuário:

1. O usuário abre uma ferramenta marcada como "liberada com anúncio".
2. O sistema oferece: "Assista a um anúncio para usar esta ferramenta".
3. O usuário assiste ao anúncio e **confirma**.
4. A ferramenta é liberada, por um período a definir.

Nesse modelo, o usuário "paga" com atenção, não com dinheiro nem com dados cadastrais.

## 3. O que fica fora do modelo (decidir cedo, para dar confiança)

Proposta inicial, a confirmar:

- **Sempre gratuito, sem anúncio:** backup (exportar/importar), acesso aos dados que o usuário já salvou, a home e a navegação.
- **Candidatas a ficarem atrás de anúncio:** apenas ferramentas novas ou de uso ocasional. Quais ferramentas e por quanto tempo é **decisão em aberto** (seção 8).
- Nenhuma ferramenta que já é oferecida de graça no lançamento deve passar a ser bloqueada sem aviso claro e sem alternativa para quem já usava.

## 4. Pré-requisitos antes de começar

Só vale iniciar a Fase B (abaixo) quando:

- [ ] A plataforma estiver publicada, estável e com uso real, medido pelo painel `/admin/`.
- [ ] Houver dados suficientes de uso para saber **quais ferramentas** são mais usadas e por quantas pessoas (a medição anônima do AgroPainel já registra a ferramenta aberta, país e tipo de aparelho).
- [ ] Houver decisão sobre **domínio próprio**. O endereço `workers.dev` pertence à Cloudflare, e redes de anúncio provavelmente exigem domínio próprio. **A conferir** nas regras de cada rede na hora.
- [ ] Uma rede ou serviço que ofereça anúncio recompensado em **site web** (não só em aplicativo) tiver sido identificado, com as regras de elegibilidade, de conteúdo e de pagamento lidas. **Não verificado neste documento**: os requisitos mudam e devem ser conferidos nas páginas oficiais.
- [ ] A **política de privacidade** estiver escrita e publicada (seção 6).
- [ ] Houver aprovação explícita do responsável pelo projeto.

## 5. Visão técnica (rascunho, a validar)

Sem contas, o desbloqueio **não pode depender de usuário logado**. Opções a avaliar:

| Opção | Como funciona | Vantagem | Limitação |
|---|---|---|---|
| A. Desbloqueio no navegador | Ao confirmar o anúncio, o navegador guarda uma marca com validade (por exemplo, no `localStorage`). | Simples, sem servidor, sem conta. | O usuário pode apagar ou alterar a marca; aceitável se o objetivo for só incentivar, não impedir. |
| B. Desbloqueio com confirmação no Worker | O navegador pede ao Worker um "recibo" curto assinado; o Worker só entrega se a rede de anúncio confirmar a recompensa. | Mais difícil de burlar. | Mais código, usa D1/Worker (limites do plano gratuito) e depende do que a rede oferecer. |

Pontos de atenção, valem para as duas:

- **Gestão Rural abre por `file://`** em alguns casos, onde anúncios e Worker não funcionam. Por isso a Gestão Rural não deve depender de anúncio.
- **Uso offline / app instalado:** o manifest não promete offline. Um anúncio exige internet; definir o que acontece sem conexão (por exemplo, manter a ferramenta indisponível ou liberada, a decidir).
- **Armazenamento é por endereço.** Trocar para domínio próprio zera as marcas de desbloqueio (e os dados locais; veja `ROLLBACK.md`).
- **Falha do anúncio** (sem anúncio disponível, bloqueador, erro): definir comportamento claro e justo, para o usuário não ficar travado por problema que não é dele.
- **Isolamento:** o código de anúncios deve ficar separado (arquivo próprio), carregado só onde for usado, sem afetar a medição, o `/admin/` nem as APIs atuais.
- **Medição:** se for preciso medir exibições/recompensas, isso exige ampliar a lista fixa de eventos da coleta. Será mudança de código e precisa de fase própria.

## 6. Privacidade e conformidade (LGPD)

- Hoje a medição é anônima (hash diário, sem gravar IP) e o README descreve isso. Anúncios normalmente envolvem **terceiros** que podem usar cookies e identificadores do aparelho, o que muda o quadro de privacidade.
- Antes de qualquer anúncio: política de privacidade atualizada, aviso claro ao usuário e, se a rede ou a lei exigirem, **consentimento** (por exemplo, para anúncios personalizados). Conferir as exigências vigentes da LGPD e da própria rede; **este documento não é orientação jurídica**.
- O público inclui produtores rurais de todas as idades; evitar qualquer mecanismo enganoso (botão de "fechar" escondido, recompensa que não é entregue etc.).
- Não coletar dados de pagamento no site (regra do plano gratuito da Cloudflare, já registrada em `DEPLOY.md`).

## 7. Fases propostas (cada uma exige aprovação)

| Fase | Conteúdo | Código? |
|---|---|---|
| **A. Lançamento sem anúncios** | Publicar, divulgar, observar uso e estabilidade. Esta é a situação atual do plano. | Não |
| **B. Pesquisa** | Escolher a rede/serviço, ler as regras, decidir domínio, definir quais ferramentas e que regras de liberação. Escrever a política de privacidade. | Não |
| **C. Protótipo isolado** | Testar o fluxo de anúncio recompensado numa cópia, com uma única ferramenta de teste e anúncio de teste da própria rede. | Sim |
| **D. Piloto** | Liberar para parte dos usuários, com uma ou poucas ferramentas, medir reação e receita. | Sim |
| **E. Decisão** | Ampliar, ajustar ou abandonar com base nos números. | Depende |

Critério de parada: se os anúncios incomodarem os usuários, derrubarem o uso ou o custo/complexidade superar a receita, **voltar ao modelo 100% gratuito** (ver retorno na seção 9).

## 8. Decisões em aberto

1. Quais ferramentas (se alguma) ficariam atrás de anúncio, e por quanto tempo cada liberação dura (uma vez, por sessão, por hora, por dia).
2. Domínio próprio: quando e qual.
3. Qual rede ou serviço de anúncios recompensados para web, e quais as regras de elegibilidade e de pagamento.
4. Desbloqueio só no navegador (opção A) ou com confirmação no Worker (opção B).
5. O que acontece quando não há anúncio disponível ou o usuário está sem internet.
6. Meta de receita que justifique a complexidade (referência: a meta de monetização do projeto ainda precisa ser traduzida em número de visitas/anúncios por mês).
7. Alternativas ou complementos a avaliar à parte: apoio voluntário, patrocinadores diretos, outras formas sem anúncio.

## 9. Retorno

Por ser opcional e isolada, a função de anúncios deve poder ser **desligada sem afetar o resto**: desativar o código de anúncios (chave de configuração ou remoção do arquivo próprio) e liberar todas as ferramentas. Nenhum dado do usuário depende dela, então o retorno não apaga nada. Quando a Fase C existir, esse procedimento deve ser acrescentado ao `ROLLBACK.md`.

## 10. O que este roadmap NÃO faz

- Não altera funcionalidades, código, banco de dados, Worker nem configuração.
- Não implementa anúncios, login de visitante, contas ou pagamentos.
- Não define prazos nem promete receita.
