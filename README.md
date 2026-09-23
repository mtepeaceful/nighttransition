# NightTransition

Extensão de navegador (Manifest V3) que aplica um ritual de desaceleração digital antes de dormir: aquece a cor das páginas aos poucos com um filtro de base fotobiológica e avisa quando você passa tempo demais em sites de alto estímulo durante a noite.

## Por quê

A exposição a telas e luz azul (380–500nm) antes de dormir suprime a produção de melatonina e atrasa o início do sono. Em vez de bloquear o acesso, a extensão reduz progressivamente esse estímulo e dá um empurrão consciente para o usuário perceber quanto tempo está gastando, sem impor fricção agressiva.

## Funcionalidades

- **Temperatura do filtro em Kelvin** — você escolhe a temperatura de 6.500 K (neutro) a 1.900 K (luz de vela), em passos de 100 K, e ela vale a qualquer hora da noite. O filtro é um overlay (não um simples `filter: sepia()`) com a cor exata do corpo negro na temperatura escolhida. Com o filtro totalmente aplicado, o branco da página fica exatamente nessa temperatura e sobre a curva de temperatura (|Duv| ≤ 0,003), sem puxar para rosa nem para verde.
- **Esquentar aos poucos ao longo da noite (opcional)** — em vez de ficar fixo, o filtro começa em 25% do caminho entre 6.500 K e a temperatura escolhida (≈ 4.000 K para um alvo de 1.900 K) e chega a ela no fim da noite. A interpolação é em mired (1/K), a escala em que passos iguais são percebidos como mudanças iguais.
- **Transição suave de entrada** — no horário de início, o filtro sai do neutro e chega à temperatura escolhida ao longo de uma duração ajustável (efeito "pôr do sol digital"), ou entra direto, conforme preferência. Testes garantem que a temperatura só desce durante a transição e ao longo da noite, que qualquer temperatura entre 1.900 e 6.500 K é atingida exatamente e que o branco não sai da curva.
- **Horário automático** — início e fim configuráveis; liga e desliga sozinho, inclusive se o navegador for reaberto no meio da janela.
- **Modo manual** — botão "Ativar/Desativar agora" para testar sem esperar o horário. Ativado de dia, aplica direto a temperatura escolhida. A escolha manual vale até o próximo horário de início ou fim, mesmo que o navegador fique fechado nesse meio-tempo, e depois volta ao automático.
- **Lembrete consciente** — em sites configurados como de alto estímulo, conta o **tempo ativo** (aba visível) durante a noite, somando todas as abas e visitas do mesmo site. Ao atingir o limite configurado, um modal mostra esse tempo e exige um pequeno countdown antes de liberar a navegação, sem bloquear o acesso definitivamente. Depois de fechado, o lembrete volta a cada novo limite de uso. Recarregar a página não pula o lembrete. Funciona também em sites que trocam de conteúdo sem recarregar (YouTube, TikTok, Twitch) e em abas abertas antes do início da noite.
- **Monitor do filtro no popup** — mostra a temperatura de cor correlata (CCT) do branco da página com o filtro aplicado, calculada pela distância à curva do corpo negro no espaço CIE 1960 (6.500 K sem filtro). Mostra também o nome da faixa atual (luz do dia, branco-quente, âmbar, luz de vela) e a intensidade: quanto do caminho entre 6.500 K e a temperatura escolhida já foi aplicado, que sobe durante a transição de entrada e, no modo progressivo, ao longo da noite.
- **Card "Ritual de desaceleração"** — antes da noite, conta quanto falta para o aviso "Hora de desacelerar". Durante a noite, mostra até quando o ritual vai, ou se foi pausado manualmente. Se a aba atual é um site da lista, mostra também quanto falta para a próxima pausa naquele site, em mm:ss contando segundo a segundo, com barra de progresso. O tempo é contado pela aba enquanto ela está visível, com o popup aberto ou fechado. Ao abrir o popup, o Service Worker pede à aba o tempo ainda não reportado, então o valor exibido é exato. Se a aba foi aberta antes de instalar ou recarregar a extensão, o Chrome não conecta o content script a ela. O card pede para recarregar a aba. Se a aba está em segundo plano, a contagem aparece como pausada.
- **Gestão de sites bloqueados por chips** — adicionar/remover sites com validação de domínio; cada alteração é salva na hora.
- **Interface de pôr do sol** — popup escuro em tons de âmbar e brasa, com superfícies translúcidas e títulos em serifa, na mesma paleta do modal de lembrete. Tem altura máxima de 520px (as configurações rolam por dentro), foco visível para navegação por teclado e respeita a preferência do sistema por menos movimento.

## Instalação (modo desenvolvedor)

1. Acesse `chrome://extensions`
2. Ative o **Modo do desenvolvedor**
3. Clique em **Carregar sem compactação**
4. Selecione a pasta raiz deste repositório (a que contém o `manifest.json`)

## Arquitetura e Decisões de Design

A extensão segue uma **arquitetura desacoplada e orientada a eventos** em três camadas, cada uma com um nível de privilégio diferente. Só o Service Worker toca o `chrome.storage` e aplica regras de negócio; as outras camadas pedem e recebem dados por mensagens.

```
┌──────────────────────┐                     ┌─────────────────────────────┐
│  UI isolada (Popup)  │                     │  Content Script (página)    │
│  configurações,      │                     │  overlay de cor, modal de   │
│  botão ativar/desat. │                     │  lembrete, mede aba visível │
└──────────┬───────────┘                     └──────────────┬──────────────┘
           │ GET_POPUP_STATE              GET_PAGE_STATE    │  ▲ APPLY_OVERLAY
           │ SAVE_SETTINGS                REPORT_ACTIVE_TIME│  │ (a cada minuto
           │ UPDATE_BLOCKED_SITES         (a cada 15s)      │  │  durante a noite)
           │ TOGGLE_NIGHT_MODE            REMINDER_DISMISSED│  │
           ▼                                                ▼  │
┌──────────────────────────────────────────────────────────────┴─────────────┐
│  Service Worker (background)                                               │
│  valida remetente e payload → agendamento, override manual com expiração,  │
│  tempo ativo por site e lembretes → chrome.storage (sync / local)          │
│  gravações em fila · chrome.alarms (1 min) · chrome.notifications          │
└────────────────────────────────────────────────────────────────────────────┘
```

### Conformidade com Manifest V3

O background é um **Service Worker efêmero**, não uma *background page* persistente: o Chrome o acorda por eventos (`onInstalled`, `onStartup`, `alarms.onAlarm`, `runtime.onMessage`) e o suspende quando fica ocioso. Por isso não há estado global em memória. Configurações vivem em `chrome.storage.sync` e o estado da noite (modo ativo, override manual e sua expiração, tempo ativo por site) em `chrome.storage.local`, relidos a cada evento. As operações que leem e gravam o estado passam por uma fila, para que relatórios simultâneos de várias abas não se sobrescrevam. O agendamento usa `chrome.alarms` em vez de `setInterval`, que morreria junto com o worker. Um alarme a cada 1 minuto atualiza a rampa e a cor. Um segundo alarme é agendado para o instante exato da próxima virada (início, fim ou expiração de uma ação manual), para que o filtro ligue e desligue no horário e não até 1 minuto depois. Alterar o horário de início ou fim cancela qualquer "Ativar/Desativar agora" pendente, que foi calculado com o horário antigo. Todos os listeners são registrados de forma síncrona no topo do módulo, como o MV3 exige.

A extensão não faz nenhuma requisição externa. Se algum dia fizer, a chamada deve ser feita exclusivamente pelo Service Worker, via HTTPS.

### Segurança por isolamento (anti-DOM Skimming)

Tudo o que é configuração ou dado do usuário (horários, temperatura, lista de sites) é exibido e editado **somente no Popup**, que roda na origem `chrome-extension://` e está fora do alcance de scripts da página. O content script roda no *Isolated World* padrão (sem `world: "MAIN"`) e injeta apenas elementos visuais sem campos de entrada: o overlay de cor e o modal de lembrete. Assim nenhum script da página consegue ler dados da extensão pelo DOM (*DOM Skimming*) nem contaminar protótipos compartilhados (*Prototype Pollution*).

O DOM é montado apenas com `createElement` e `textContent`. Não há `innerHTML` nem `document.write()`, e o hostname exibido no lembrete nunca é interpretado como HTML.

### Defesa em profundidade na mensageria

Cada mensagem recebida pelo Service Worker passa por três checagens antes de ser processada ([message-guard.js](src/utils/message-guard.js)):

1. **`sender.id === chrome.runtime.id`**: rejeita mensagens de qualquer outra extensão.
2. **Contexto de origem por tipo de mensagem**: comandos da UI (`SAVE_SETTINGS`, `UPDATE_BLOCKED_SITES`, `TOGGLE_NIGHT_MODE`, `GET_POPUP_STATE`) só são aceitos quando `sender.origin` é a origem da própria extensão e não há `sender.tab`. `GET_PAGE_STATE`, `REPORT_ACTIVE_TIME` e `REMINDER_DISMISSED` só são aceitos de content scripts (`sender.tab` presente). Um content script comprometido não consegue alterar configurações.
3. **Validação do payload**: a forma da mensagem é conferida primeiro. `SAVE_SETTINGS` exige um objeto simples, `UPDATE_BLOCKED_SITES` exige uma lista, e `REPORT_ACTIVE_TIME` só aceita um tempo numérico entre 0 e 60 s, o que impede inflar o contador. Os outros tipos não aceitam payload. Depois as configurações passam por `sanitizeSettings` ([validation.js](src/utils/validation.js)), que valida horários `HH:MM`, limita números às faixas permitidas e filtra domínios inválidos. O hostname usado na contagem de tempo vem de `sender.url`, fornecido pelo Chrome, e nunca do conteúdo da mensagem.

No sentido inverso, o content script só aceita `APPLY_OVERLAY` vindo da própria extensão, descarta valores de cor não numéricos e só monta o lembrete se `hostname` for string e os tempos forem números finitos, e com a aba visível.

### Princípio do menor privilégio

| Permissão | Por que é necessária |
|---|---|
| `storage` | Persistir configurações e estado |
| `alarms` | Acordar o Service Worker a cada minuto para checar a janela noturna |
| `notifications` | Avisar o início do ritual de encerramento |
| `activeTab` | Ao abrir o popup, saber o site da aba atual para mostrar quanto falta para a próxima pausa nele. Vale só para a aba em que o usuário clicou no ícone, e só naquele momento |

Não são solicitadas `tabs`, `history`, `scripting`, `webRequest` nem `host_permissions`. O `activeTab` foi preferido à permissão `tabs` porque não exibe aviso de "ler seu histórico" na instalação e não dá acesso a outras abas. O hostname da aba é lido pelo Service Worker, nunca enviado pelo popup. Para propagar a cor do overlay, o worker usa `chrome.tabs.query`/`sendMessage`, que não exigem a permissão `tabs` porque só usam IDs de aba, sem ler URL nem título. O content script é declarado com `matches: ["<all_urls>"]` porque o filtro precisa cobrir qualquer página visitada à noite; em troca, ele não tem privilégio próprio e não lê o storage diretamente. A CSP `script-src 'self'` impede código remoto: todo o JavaScript vem empacotado na extensão. Essa lista enxuta facilita a revisão na Chrome Web Store e deixa claro que nenhum dado de navegação sai do navegador.

### Organização de pastas

```
night-transition/
├── manifest.json
├── README.md
├── PRIVACY.md                     # política de privacidade (URL usada na Chrome Web Store)
├── .gitignore                     # chaves .pem, pacotes .zip/.crx, .env/.npmrc, node_modules, temp/
├── src/
│   ├── background/
│   │   └── service-worker.js      # orquestração, regras de negócio, storage, roteamento de mensagens
│   ├── content/
│   │   ├── content-script.js      # camada fina: aplica overlay, mede tempo visível, exibe lembrete
│   │   └── content-style.css
│   ├── ui/
│   │   └── popup/                 # UI isolada: status, ativar/desativar, configurações
│   │       ├── popup.html
│   │       ├── popup.js
│   │       └── popup.css
│   └── utils/                     # ES modules compartilhados por Service Worker e Popup
│       ├── constants.js           # defaults, tipos de mensagem, nome do alarm
│       ├── storage.js             # acesso a chrome.storage (usado só pelo Service Worker)
│       ├── validation.js          # normalização de domínios e sanitização de settings
│       ├── message-guard.js       # decide se uma mensagem é aceita e de qual contexto
│       ├── site-usage.js          # tempo ativo por site e regra de quando lembrar
│       ├── color-temperature.js   # cor do corpo negro por K, interpolação em mired, CCT/Duv do branco
│       ├── filter-status.js       # estágio, intensidade atual, status do ritual e do lembrete
│       └── night-phase.js         # fase, progresso, cor do overlay e próxima fronteira do horário
├── assets/
│   └── icons/
│       ├── icon-16.png
│       ├── icon-48.png
│       └── icon-128.png
└── tests/                         # só desenvolvimento, fora do pacote publicado
    ├── package.json               # scripts test / lint / check / pack e devDependencies
    ├── eslint.config.js           # regras de segurança do ESLint
    ├── night-phase.test.js
    ├── site-usage.test.js
    ├── color-temperature.test.js
    ├── filter-status.test.js
    ├── validation.test.js
    ├── message-guard.test.js
    ├── service-worker.test.js     # integração com chrome.* simulado e relógio controlado
    ├── manifest.test.js
    ├── static-security.test.js
    ├── pack.test.js               # confere o conteúdo do .zip de publicação
    └── scripts/
        └── pack.js                # gera dist/night-transition-<versão>.zip
```

Não há Side Panel. Toda a interface cabe no popup, e adicioná-lo exigiria a permissão `sidePanel` sem necessidade. Content scripts declarados no manifest não podem ser ES modules, então `content-script.js` não importa nada de `utils/` e repete só os dois tipos de mensagem que usa. Toda a lógica que ele precisaria importar fica no Service Worker.

## Testes e checagens de segurança

Requer Node.js 20+. Tudo fica em `tests/`, fora do pacote da extensão:

```
cd tests
npm install
npm run check
```

`npm run check` roda duas etapas:

- **ESLint de segurança** sobre `src/`: bloqueia `eval`, `new Function`, `setTimeout` com string, `localStorage` e atribuições inseguras a `innerHTML`/`outerHTML` (plugin `no-unsanitized` da Mozilla).
- **Testes com `node:test`:**
  - `night-phase.test.js`: cálculo de fase, rampa (chega ao máximo exatamente no minuto configurado), cor e próxima fronteira do horário.
  - `site-usage.test.js`: soma de tempo ativo, limiar do lembrete e repetição após fechar.
  - `color-temperature.test.js`: cores do corpo negro contra referências, branco puro ≈ 6.500 K, qualquer temperatura de 1.900 a 6.500 K atingida exatamente, |Duv| ≤ 0,006 em todas as combinações, interpolação em mired e modo progressivo.
  - `filter-status.test.js`: temperatura escolhida vale a qualquer hora no modo fixo, a temperatura só desce durante a transição e no modo progressivo, cálculo da intensidade, intensidade atual na rampa, contagem até o ritual e tempo até a próxima pausa.
  - `service-worker.test.js`: o Service Worker real com `chrome.*` simulado e relógio controlado. Cobre liga/desliga no horário com uma única notificação, rampa do overlay, lembrete no tempo certo, repetição, recarga sem pular o lembrete, tempo de dia ou fora da lista não contado, abas simultâneas, reset ao fim da noite, expiração do modo manual com o navegador fechado, aviso do ritual mesmo com o filtro ligado manualmente de dia, estado do popup pela aba ativa e bloqueio de configurações vindas de content script.
  - `validation.test.js`: sanitização de configurações contra entrada maliciosa e prototype pollution.
  - `message-guard.test.js`: roteamento de mensagens. Rejeita outras extensões, content scripts tentando comandos da UI e payloads malformados.
  - `manifest.test.js`: MV3, nome e descrição dentro dos limites da Chrome Web Store (75 e 132 caracteres), permissões iguais à allowlist, CSP restritiva, sem `host_permissions`/`web_accessible_resources`, arquivos referenciados existentes.
  - `static-security.test.js`: varre `src/` atrás de sinks de XSS, execução dinâmica, URLs remotas, segredos hardcoded e scripts ou handlers inline no HTML.
  - `pack.test.js`: o `.zip` de publicação tem o `manifest.json` na raiz, leva só `manifest.json`, `src/` e `assets/`, inclui tudo o que o manifest referencia, descompacta idêntico ao disco e é reproduzível.

Adicionar uma permissão ao `manifest.json` quebra `manifest.test.js` de propósito. Quem adiciona precisa atualizar a allowlist no teste e justificar a permissão na tabela acima.

## Empacotamento

Para gerar o pacote da Chrome Web Store:

```
cd tests
npm run pack
```

O script roda `npm run check` e, se tudo passar, gera `dist/night-transition-<versão>.zip` com apenas `manifest.json`, `src/` e `assets/`, com o manifest na raiz. `tests/`, `README.md`, `PRIVACY.md` e `.gitignore` não entram no pacote. A versão vem do `manifest.json`, e cada envio à loja precisa de uma versão maior que a anterior. O `.gitignore` já impede que o `dist/`, a chave `.pem` de assinatura, o `.npmrc` (que pode guardar o token do npm) e o `node_modules` sejam versionados.

A política de privacidade está em [PRIVACY.md](PRIVACY.md). O link dela no GitHub é o que vai no campo de política de privacidade do painel da loja. Para o link funcionar, o repositório precisa ser público.

## Publicação na Chrome Web Store

1. Crie a conta de desenvolvedor no [painel da Chrome Web Store](https://chrome.google.com/webstore/devconsole). A taxa é de US$ 5, paga uma vez, e a conta Google precisa ter verificação em duas etapas.
2. Gere o pacote com `npm run pack` e teste o `.zip` descompactado em um perfil limpo do Chrome (**Carregar sem compactação**).
3. No painel, envie o `.zip` e preencha a página da loja: descrição, categoria, idioma Português (Brasil), ícone 128×128, pelo menos uma captura de 1280×800 e o bloco promocional de 440×280.
4. Na aba **Privacidade**:
   - **Finalidade única:** ritual noturno de desaceleração digital, que aquece a cor das páginas à noite e lembra o usuário de pausar em sites de alto estímulo.
   - **Permissões:** use as justificativas da tabela [Princípio do menor privilégio](#princípio-do-menor-privilégio). Para o acesso a todos os sites, explique que o content script só aplica o overlay de cor e mostra o lembrete, e que o filtro precisa cobrir qualquer página.
   - **Código remoto:** não.
   - **Dados:** nenhum dado é coletado nem enviado ao desenvolvedor.
   - **Política de privacidade:** link do `PRIVACY.md`.
5. Publique primeiro como **Não listada** para testar a versão da loja e depois torne pública.

Como o content script roda em `<all_urls>`, a extensão passa por revisão aprofundada, que pode levar de alguns dias a algumas semanas.

## Tecnologias

- **Extensão:** Manifest V3 e JavaScript (ES2020+, ES Modules), sem nenhuma dependência em tempo de execução.
- **Desenvolvimento (só em `tests/`):** Node.js 20+ com `node:test`, e ESLint 10 com `eslint-plugin-no-unsanitized` e `globals`.
