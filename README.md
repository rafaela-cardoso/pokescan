# pokescan

App para celular que **lê cartas pela câmera** e **grava numa planilha do Google Sheets à sua escolha**.

Feito a partir da leitura de idiomas por OCR do [bot-leilao](https://github.com/rafaela-cardoso/bot-leilao) (o mesmo
tesseract.js e a mesma classificação de idioma, em `src/idioma.js`) e da busca de cartas do
[liga_price_sheets](https://github.com/rafaela-cardoso/liga_price_sheets) (catálogo da Liga Pokémon).

- Aponte a câmera para a carta, encaixe na moldura e toque no botão vermelho. No Android, o app tira uma foto na
  resolução máxima do sensor (bem mais nítida que o vídeo).
- O app lê o **nome** (topo), o **número de coleção** (rodapé: canto esquerdo, canto direito e faixa inteira) e o
  **idioma** (EN, PT, JP, KR, CH, CHS). Entre inglês e português ele aceita palavras com letras lidas errado
  ("Fraquesa") e usa também o rodapé da caixa de texto. Cada faixa é ampliada e binarizada antes do OCR (a caixa de texto com
  limiar adaptativo, que aguenta o fundo irregular do foil e reflexos).
- Com isso, busca a carta na **Liga Pokémon**, do mesmo jeito que o liga_price_sheets: `Nome (nº/total)`, o número com
  e sem zeros, e o nome. A busca tolera erros de leitura: dígitos trocados (`026/125` ainda acha `026/128`) e nome
  ilegível (a escolha passa a depender do número). As cartas encontradas aparecem com a imagem da Liga: se o app não
  tiver certeza, **toque na carta certa**.
- O app tenta reconhecer pela imagem os padrões **Poké Ball**, **Master Ball** e **Reverse Foil** (veja abaixo) e já
  sugere o extra.
- Você confere, escolhe o **estado** (M, NM, SP, MP, HP, D) e o **extra** (Normal, Foil, Reverse Foil, Promo...) e grava.
- O **número é sempre lido**, mesmo quando o nome sai certo: é ele que separa as várias impressões da mesma carta
  (Boss's Orders tem dezenas). O rodapé é lido várias vezes (cantos e faixa inteira, com dois tipos de limiar), e todos
  os trechos de dígitos ficam como pista. Se o número não sai inteiro (ex.: `1541320` numa foto pequena), o app
  pergunta à Liga por `Nome (154` e dá nota maior à impressão cujo número aparece nos trechos lidos.
- Cartas sem nome legível (japonês, chinês, coreano): a escolha depende só do número, então o app busca também
  números com um dígito trocado (`032` ↔ `092`) e sempre pede para você conferir a carta na grade.
- **Ver preços desta carta na Liga Pokémon** abre a página da carta na Liga.
- Sem internet ou com erro, a carta fica numa fila de **pendentes**, que pode ser reenviada ou descartada.

As chamadas à busca da Liga seguem as regras do liga_price_sheets: no mínimo 400 ms entre uma e outra e, se a Liga
pedir calma (erro 429), novas tentativas depois de 2, 4 e 8 segundos.

É um app da web instalável (PWA): não precisa de loja de aplicativos. No Android (Chrome) use **⋮ → Instalar app**;
no iPhone (Safari) use **Compartilhar → Adicionar à Tela de Início**.

### Por que o app não grava o preço da Liga

A busca de cartas da Liga é uma API aberta, mas os **preços** só existem na página da carta (`cards_stock`), que é
protegida pelo Cloudflare (verificação de navegador) e mostra parte dos valores como imagens. O liga_price_sheets lê
essa página numa aba do Chrome; um app no celular não consegue. Por isso o pokescan grava a carta **no formato que o
liga_price_sheets lê** (Carta, Estado, Extra, Idioma) e a extensão preenche **Preço (Liga)**, **Link Liga** e **Erros**
depois, no computador.

## Planilha

O app preenche **só seis colunas**: Quantidade, Carta, Estado, Extra, Idioma e Link liga. Todas as outras
(Preço (Liga), Erros, Preço (compra), 10% off, opções, lance inicial, fechamento, pagamento, fórmulas, observações)
ficam como estão: Preço (Liga) e Erros são do liga_price_sheets, e as demais do leilão.

| Título da coluna (qualquer um destes) | O que o app grava |
|---|---|
| Quantidade, Qtd | quantas cartas iguais você leu (padrão `1`); se a carta já está na planilha, **soma** (veja abaixo) |
| Carta (ou Nome, se não houver Carta) | `Pikachu (026/128)` — formato do liga_price_sheets e do bot de leilão |
| Estado, Qualidade, Condição | `M`, `NM`, `SP`, `MP`, `HP` ou `D` |
| Extra | vazio (Normal), `Foil`, `Reverse Foil`, `Promo`... (os nomes aceitos pelo liga_price_sheets) |
| Idioma, Língua | `EN`, `PT`, `JP`, `KR`, `CH` ou `CHS` |
| Link liga, Liga, Link | link da carta na Liga Pokémon |

Acentos e maiúsculas nos títulos não importam. O cabeçalho é procurado nas **15 primeiras linhas** (pode haver título
ou totais acima dele).

**Onde a carta é gravada:**

- **A carta já está na planilha** (mesma Carta, Estado, Extra e Idioma): o app **soma** a quantidade lida à que já
  estava naquela linha, sem criar outra. Quantidade vazia conta como 1 (a linha já representa uma carta); se a célula
  tiver texto em vez de número, ela não é tocada e a carta vai para uma linha nova.
- **Carta nova:** vai para a linha **logo abaixo da última preenchida**, sem inserir linhas e sem usar buracos no meio
  da lista. Nada é sobrescrito.

Se a aba estiver vazia, o app cria o cabeçalho da planilha de leilão:

`Quantidade | Carta | Estado | Preço (Liga) | Extra | Idioma | Erros | Preço (compra) | Link liga | 10% off | opçoes | lance inicial | fechamento | pagamento`

**Coreano:** o app grava sempre `KR` (o bot de leilão lê `KR`). Na comparação com cartas já gravadas, `KR` e `KO`
contam como o mesmo idioma (o liga_price_sheets aceita os dois).

**Link liga:** gravado como o texto **Abrir na Liga** com o link da carta, já na edição da coleção (`&ed=ASC`).

**Pendentes:** sem internet ou com erro, a carta fica na lista **Gravadas** marcada como pendente. **Enviar pendentes**
tenta de novo; **Descartar pendentes** apaga as que ainda não foram gravadas (as já gravadas não são afetadas).

## Foto automática e várias cartas

- **Foto automática** (logo abaixo do botão de foto): com a câmera ligada, o app tira a foto sozinho quando uma
  carta nova fica parada na moldura por um instante (a moldura fica coral enquanto espera). O botão continua
  funcionando. A mesma carta não é fotografada duas vezes; se a foto saiu sem carta (mesa vazia), o app ignora
  aquela cena. Com uma carta em revisão, a foto automática espera você gravar ou descartar.
- **Várias cartas (fila)**: cada foto (automática, do botão ou da galeria) entra numa fila e é lida e buscada na
  Liga em segundo plano, uma por vez (respeitando o limite do Gemini). **Abrir fila** mostra todas as cartas: cada uma
  é um menu que abre e fecha, com caixa de seleção (visível mesmo fechado) e as opções de revisão. O que você muda fica
  guardado na carta até enviar ou descartar. No fim da tela: **Enviar selecionadas** e **Descartar selecionadas**.
  **Escanear mais cartas** volta para a câmera sem perder a fila. A fila fica só na memória: recarregar o app a perde.
- **Limpar gravadas** (na lista "Gravadas"): tira da lista as cartas já gravadas; as pendentes ficam e a planilha
  não muda.

## Leitura pelo Gemini

O OCR (tesseract.js) lê letra por letra e erra fácil com brilho, arte por trás do texto ou fotos grandes. Com a
opção **Configurar → Ler a carta com o Gemini** (ligada por padrão), a foto recortada vai para o Gemini, que devolve
nome, número, total, sigla da coleção, idioma e o extra (Normal, Foil, Reverse Foil, Pokeball Foil ou Master Ball,
pelo brilho visível na foto; o extra vem como sugestão para conferir). Quando o Gemini não consegue ver o brilho, o
extra é sugerido pela análise da imagem (seção "Extras pela imagem"). O resto (busca na Liga, filtros, link) é o mesmo. Sem login Google,
sem intermediário, sem internet ou com a cota esgotada, o app volta sozinho para o OCR e diz isso no resumo.

Usa a **cota gratuita da API do Gemini** (Google AI Studio), que é separada da assinatura do Gemini. A chave fica
no seu intermediário Apps Script, nunca no site, e o script só atende quem entrou no pokescan com o login Google do
app (o token é conferido no Google e precisa ser do Client ID do pokescan).

Passo a passo (uma vez):

1. Em [aistudio.google.com](https://aistudio.google.com), entre com sua conta Google → **Get API key** → **Create
   API key**. Copie a chave. Na cota grátis, o Google pode usar o que é enviado para melhorar os produtos dele.
2. Abra o seu projeto do intermediário em [script.google.com](https://script.google.com) e troque o código pelo de
   `proxy/AppsScript_imagens.gs` (o mesmo arquivo de antes, agora com a leitura pelo Gemini). Salve.
3. **Configurações do projeto** (engrenagem) → **Propriedades do script** → adicione:
   - `GEMINI_API_KEY`: a chave do passo 1;
   - `CLIENT_ID`: o Client ID do pokescan (`….apps.googleusercontent.com`);
   - `MODELO_GEMINI` (opcional): outro modelo do Gemini. O padrão está no início do script.
4. **Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão → Implantar**. A URL continua a
   mesma, e o app já usa.

Sempre que `proxy/AppsScript_imagens.gs` mudar (por exemplo, quando o extra passou a ser pedido ao Gemini), repita os
passos 2 e 4: cole o código novo e publique uma nova versão. As propriedades do script continuam lá.

Com a leitura do Gemini, a busca na Liga usa o nome e o número exatamente como estão na carta (uma ou duas
consultas). Para cartas em japonês, coreano ou chinês, o Gemini também devolve o nome em inglês, que é o usado na
busca; as versões com sufixo no número ("030C/103") e os Gem Packs chineses ("1004-04/140") também são achados.

Se o Gemini responder que está sobrecarregado (503), o intermediário tenta de novo duas vezes, troca de modelo e,
se ainda assim falhar, o app espera e tenta mais duas vezes; o OCR só lê em último caso.

Os limites da cota grátis (pedidos por minuto e por dia) aparecem em
[aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit).

## Fotos no Drive

Com **Configurar → Fotos no Drive** ligado, cada carta gravada também tem a foto (o recorte da carta) salva na pasta
do Drive informada, com o nome da coluna Carta e `-` no lugar de `/`: `Gabite da Cíntia (110-217).jpg`. O login
pede o acesso ao Drive (escopo do Drive inteiro: o restrito não permite gravar numa pasta que o app não criou).
Se a foto não subir, ela fica guardada no celular e vai com **Enviar pendentes**. Na publicação, o link da pasta
vem da variável `POKESCAN_PASTA_DRIVE` do repositório.

## Coleção (sigla)

Desde Scarlet & Violet, a carta traz a sigla da coleção numa caixa preta antes do número (`ASC PT 110/217`).
A mesma carta pode existir em coleções diferentes, então o app lê essa sigla e:

1. deixa na grade só as edições da Liga dessa coleção (e as variantes dela: `ASC` vale para `ASCES` e `ASCPB`);
2. mostra a sigla no campo **Coleção**, que pode ser corrigido à mão;
3. monta o link da Liga já na edição certa.

A busca da Liga só informa o número da edição; a sigla vem da tabela `src/edicoes-liga.js`, tirada da
[página de edições da Liga](https://www.ligapokemon.com.br/?view=cards/edicoes). Quando sair coleção nova, salve essa
página pelo navegador (Ctrl+S, "somente HTML") em `_teste/edicoes.html` e rode `npm run edicoes`.

## Idioma das edições sugeridas

A busca da Liga não informa o idioma da edição: a japonesa `030/103`, a chinesa `030C/103` e a internacional
`030/128` voltam iguais. O app tira as de outro idioma em três passos (cada um só se sobrar alguma carta):

1. **Total lido:** se o número e o total lidos batem exatamente com uma carta, as de outro total (outra coleção) saem.
2. **Sufixo da Liga:** `030C` é edição chinesa e `026K` é coreana.
3. **OCR na imagem de cada sugestão** (opcional, precisa do intermediário abaixo): o app lê o texto da imagem da Liga
   e separa as edições **latinas** (inglês, português…) das **asiáticas**. Testado em 7 imagens da Liga: 7 certas.
   Entre japonês e chinês o OCR não é confiável nessas imagens pequenas (as chinesas saíram como japonês), então ali
   vale o sufixo. O idioma fica guardado **por edição** no celular: cada edição é lida uma vez só (a 1ª leitura de
   imagens asiáticas baixa os dados do OCR e leva alguns segundos; a grade aparece antes e é filtrada depois).

### Intermediário de imagens (para o passo 3)

O servidor de imagens da Liga não deixa outro site ler os pixels (CORS). O arquivo `proxy/AppsScript_imagens.gs` é um
Apps Script que busca a imagem do lado do Google e devolve ao app. Ele só aceita imagens da Liga (não é proxy aberto)
e guarda cada imagem por 6 horas.

1. [script.google.com](https://script.google.com) → **Novo projeto** → cole o arquivo → **Salvar**.
2. **Implantar → Nova implantação → App da Web**: executar como **Eu**, acesso **Qualquer pessoa**.
3. Copie a URL que termina em `/exec` e cole no app em **Configurar → Intermediário de imagens** (ou cadastre em
   **Settings → Secrets and variables → Actions → Variables** como `POKESCAN_PROXY_IMAGENS`, e a CI já publica o app
   com ela).

O seu intermediário já publicado está gravado como padrão em `src/config.js` (`proxyImagens`), então o app já sai com
ele, no computador e no celular. Para trocar, edite esse valor ou use o campo em **Configurar**.

Para testar no computador sem ele, o `npm start` tem o mesmo intermediário em `http://localhost:5173/proxy-imagem`.

## Extras pela imagem

O app sugere o extra olhando a caixa de texto da carta, onde o foil do reverse aparece:

| Extra | Como é reconhecido |
|---|---|
| **Pokeball Foil** | emblema grande e mais claro no canto de baixo à direita, cortado por uma faixa escura, metade de cima clara |
| **Master Ball** | o mesmo emblema, com a metade de cima escura (o "M" e as bolinhas) |
| **Reverse Foil** | fundo da caixa de texto (sem as letras) cheio de textura, com bordas fortes e cinza-metálico |
| Normal | fundo liso, ou texturizado mas colorido (cartas antigas) |

Calibrado com as cartas de referência (Flittle Poké Ball e Master Ball, fotos do Boss's Orders normal, holo e reverse)
e com scans normais da Liga. Cada uma também foi testada mais escura, mais clara, borrada, deslocada e em baixa
resolução: 60 de 60 certos, sem falsos positivos. Com tão poucos exemplos, é só uma **sugestão**: confira o campo
**Extra** antes de gravar.

- **Foil/Holo** (brilho só na arte) não é detectado: numa foto parada o brilho do holo quase não aparece, e as medidas
  da foto holo ficaram iguais às da normal.
- **Full Art** não é extra na Liga: é outra carta, com número próprio, e o número já a identifica.
- Coleções em que o padrão Poké Ball/Master Ball é um monte de bolinhas pequenas (e não um emblema grande) tendem a
  aparecer como **Reverse Foil**: troque o extra se for o caso.

Fotos da **galeria** com fundo em volta: o app acha a carta e recorta sozinho, com borda **amarela** ou **prateada**
(Scarlet & Violet). Primeiro procura a borda amarela; depois, em fundo liso (mesa, tapete, papel, inclusive cinza ou
branco), recorta o que difere da cor do fundo; em fundo estampado (madeira), procura as quatro bordas retas que formam
um retângulo de carta. Testado com 75 montagens (cartas prateadas e amarelas sobre 5 fundos, em várias posições e
tamanhos): todas recortadas certo. A carta precisa estar reta; carta dentro de sleeve/toploader pode sair recortada
pelo plástico, um pouco maior.

## Configuração (uma vez)

### 1. Publicar o app (para usar no celular)

A câmera do navegador só funciona em `https` (ou `localhost`). O jeito mais simples é o GitHub Pages:

1. Crie o repositório `pokescan` no GitHub e envie este projeto (`git push`).
2. Em **Settings → Pages → Source**, escolha **GitHub Actions**.
3. A cada push na `main`, a CI roda os testes e publica em `https://SEU-USUARIO.github.io/pokescan/`.

### 2. Google (para gravar na planilha)

O app grava com a **sua** conta Google (não usa conta de serviço como o bot), então funciona com qualquer planilha
que você possa editar. É preciso um *Client ID* OAuth, gratuito:

1. Em [console.cloud.google.com](https://console.cloud.google.com), crie um projeto (ou use o do bot).
2. **APIs e serviços → Biblioteca**: ative a **Google Sheets API** (e a **Google Drive API**, para salvar as fotos).
3. **APIs e serviços → Tela de consentimento OAuth**: tipo **Externo**, preencha nome e e-mail; em **Público-alvo /
   Usuários de teste**, adicione o seu Gmail (o app fica em modo de teste, só para você e quem você adicionar).
4. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**. Em **Origens JavaScript
   autorizadas**, adicione:
   - `https://SEU-USUARIO.github.io`
   - `http://localhost:5173` (para testar no computador)

   Em **URIs de redirecionamento autorizados**, adicione o endereço do app, com a barra no final:
   - `https://SEU-USUARIO.github.io/pokescan/`
   - `http://localhost:5173/`

   No navegador o login abre num popup; no app instalado na tela inicial (onde o iPhone não abre popup) a página
   vai para o Google e volta para o app, e é para isso que serve o redirecionamento.
5. Copie o **ID do cliente** (`….apps.googleusercontent.com`) e cole no app em **Configurar → Client ID**.
   Para não ter de digitar no celular, cadastre-o também em **Settings → Secrets and variables → Actions →
   Variables** do repositório, com o nome `POKESCAN_CLIENT_ID`: a CI já publica o app com ele preenchido.

O Client ID não é segredo (fica visível no navegador). Nenhum dado passa por servidor próprio: o celular fala direto
com o Google e com a busca da Liga.

### 3. No app

**Configurar** (engrenagem) → **Entrar com Google** → cole o **link da planilha** → **Carregar abas** → escolha a aba
→ **Pronto**. Ali também ficam o estado e o idioma padrão, a opção de gravar o nome em inglês e a opção de gravar
direto quando a leitura for confiável.

**Planilha padrão:** cadastre o link em **Settings → Secrets and variables → Actions → Variables** como
`POKESCAN_PLANILHA` e o app publicado já abre com ela; não é preciso colar nada no celular. Se o link tiver `gid=`
(o link copiado com uma aba aberta tem), essa aba é escolhida sozinha na primeira gravação, depois do login. Para
fixar outra aba pelo nome, use também `POKESCAN_ABA`. Dá para trocar a qualquer momento em **Configurar**.

O link fica fora do código do repositório, mas **vai dentro do site publicado** (qualquer pessoa que abra o app pode
vê-lo). Isso não dá acesso à planilha: o app grava com a conta Google de quem fez login, então só quem tem permissão
de edição na planilha consegue gravar, e com o app em modo de teste só os usuários de teste conseguem entrar. Mantenha
o compartilhamento da planilha e das pastas acima dela como **Restrito** (sem "qualquer pessoa com o link").

## Dicas de leitura

- Boa luz e a carta inteira dentro da moldura, reta, com o nome no topo. Use **Luz** (lanterna) se o aparelho tiver.
- Cartas em sleeve brilhante: incline um pouco para tirar o reflexo do nome e do número.
- A 1ª leitura baixa os dados do OCR (alguns MB) e demora mais; as próximas levam 1–3 s.
- Se a leitura vier errada, abra **Texto lido pelo OCR** no fim do cartão para ver o que foi lido em cada faixa.
  Corrija o número ou o nome e toque em **Buscar de novo na Liga**.
- Japonês, coreano e chinês: o idioma é detectado, mas a numeração dessas edições é diferente; confira a carta
  escolhida.
- **Galeria** aceita uma foto já tirada; ela deve mostrar **só a carta**, recortada (o centro é recortado na proporção
  da carta).

## Desenvolvimento

Sem dependências: só Node.js 20+ para os testes e o servidor local.

```bash
npm start        # http://localhost:5173 (no computador a câmera funciona com webcam)
npm test         # testes (pasta testes/)
npm run checar   # sintaxe de todos os arquivos
npm run site     # monta _site/ (o que vai para o GitHub Pages)
```

| Arquivo | O que faz |
|---|---|
| `src/idioma.js` | idioma pelo texto lido (portado do bot-leilao) |
| `src/carta.js` | número de coleção, nome, legibilidade e semelhança de nomes, formato `Nome (nº/total)` |
| `src/ocr.js` | recorte das faixas, binarização (Otsu) e tesseract.js |
| `src/camera.js` | câmera traseira, foto em alta resolução, moldura, lanterna e foto da galeria |
| `src/extras.js` | sugestão de extra pela imagem (Poké Ball, Master Ball, Reverse Foil) |
| `src/edicoes.js` | idioma das edições sugeridas: OCR nas imagens da Liga (via intermediário) e cache por edição |
| `src/liga.js` | busca na Liga Pokémon (como o liga_price_sheets) e nota de cada candidato |
| `src/planilha.js` | Google Sheets: cabeçalho, soma da quantidade, próxima linha livre e gravação nas 6 colunas |
| `src/google.js` | login com a conta Google |
| `src/app.js` | interface |

## Licença

[PolyForm Noncommercial 1.0.0](LICENSE.md) — uso não comercial. Inclui código do bot-leilao, sob a mesma licença, e
segue a busca de cartas do liga_price_sheets. Os dados e imagens das cartas são da Liga Pokémon.
