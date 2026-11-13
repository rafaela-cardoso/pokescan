// pokescan · Copyright © 2026 Rafaela Cardoso · PolyForm Noncommercial 1.0.0
//
// Intermediário do pokescan, com duas funções:
//  - GET  ?url=...: busca uma imagem do servidor da Liga e a devolve em base64 (o servidor da Liga não deixa outro
//    site ler os pixels). Só aceita imagens da Liga: não é um proxy aberto.
//  - POST {acao: 'lerCarta', token, imagem}: lê a foto da carta com o Gemini (nome, número, sigla, idioma).
//  - POST {acao: 'compararCartas', token, imagem, opcoes: [urls]}: mostra ao Gemini a foto e as imagens da Liga das
//    cartas com o mesmo nome e número (energias básicas, reimpressões) e pergunta qual é a mesma impressão.
//    A chave do Gemini fica nas propriedades do script, nunca no site. Só atende quem entrou no pokescan com o
//    login Google do app (o token é conferido no Google e precisa ser do Client ID do pokescan).
//
// Como publicar (uma vez):
//   1. script.google.com -> Novo projeto -> cole este arquivo -> Salvar.
//   2. Implantar -> Nova implantação -> tipo "App da Web":
//        Executar como: Eu  ·  Quem pode acessar: Qualquer pessoa
//   3. Autorize, copie a URL que termina em /exec e cole no pokescan em Configurar -> "Intermediário de imagens".
// Para a leitura pelo Gemini (veja o README, seção "Leitura pelo Gemini"):
//   4. Configurações do projeto (engrenagem) -> Propriedades do script:
//        GEMINI_API_KEY = a chave criada em aistudio.google.com
//        CLIENT_ID      = o Client ID do pokescan (….apps.googleusercontent.com)
//        MODELO_GEMINI  = (opcional) modelo do Gemini; padrão abaixo
//   5. Depois de mudar o código: Implantar -> Gerenciar implantações -> editar -> Versão: Nova versão (a URL não muda).

const HOSTS_PERMITIDOS = ['repositorio.sbrauble.com'];

function doGet(e) {
  try {
    const url = String((e && e.parameter && e.parameter.url) || '');
    if (!permitida_(url)) return json_({ ok: false, erro: 'Endereço não permitido.' });
    const cache = CacheService.getScriptCache();
    const chave = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url));
    const guardado = cache.get(chave);
    if (guardado) return ContentService.createTextOutput(guardado).setMimeType(ContentService.MimeType.JSON);

    const img = imagemDaLiga_(url);
    if (img.erro) return json_({ ok: false, erro: img.erro });
    const corpo = JSON.stringify({ ok: true, tipo: img.tipo, base64: img.base64 });
    if (corpo.length < 100000) cache.put(chave, corpo, 21600); // 6 horas
    return ContentService.createTextOutput(corpo).setMimeType(ContentService.MimeType.JSON);
  } catch (erro) {
    return json_({ ok: false, erro: String(erro && erro.message ? erro.message : erro) });
  }
}

// ---------- leitura da carta pelo Gemini ----------
// Cota grátis (projeto bot-leilao, nov/2026): 3.5 Flash-Lite 15/min e 500/dia; 3.8 Flash 5/min e 20/dia.
const MODELO_PADRAO = 'gemini-3.5-flash-lite';
const MODELOS_RESERVA = ['gemini-3.8-flash'];
const INSTRUCAO = [
  'Esta é a foto de uma carta de Pokémon TCG. Leia o que está IMPRESSO na carta e responda só com um JSON:',
  '{"nome": string, "nomeIngles": string, "numero": string, "total": string, "sigla": string, "idioma": string, "extra": string, "energia": string}',
  '- nome: o nome da carta como impresso, no idioma da carta, sem o HP/PS e sem "Básico"/"Estágio 1". Inclua sufixos',
  '  que fazem parte do nome (ex, V, VMAX, VSTAR, GX, EX, Prime, de Treinador como "Gabite da Cíntia").',
  '- nomeIngles: o nome dessa carta em inglês, como nas cartas em inglês (ex.: "Pikachu", "Charizard ex",',
  '  "Boss\'s Orders", "Cynthia\'s Gabite"). Para carta em inglês, igual ao nome. Energia Básica: "Grass Energy",',
  '  "Fire Energy"... (o tipo do campo energia + " Energy").',
  '- numero e total: o número de coleção no rodapé, "090/084" -> numero "090", total "084" (mantenha zeros e letras,',
  '  como "TG05"/"TG30"). Promo sem total ("XY64", "SVP 045"): numero "XY64", total "".',
  '- sigla: as letras da coleção impressas numa caixinha antes do número (ex.: "PBL", "ASC"), sem o idioma miúdo',
  '  ao lado ("PT"). Vazio se a carta não tiver.',
  '- idioma: o idioma do texto da carta: EN, PT, JP, KO, ZH-TW (chinês tradicional), ZH-CN (simplificado), FR, DE,',
  '  ES ou IT.',
  '- extra: o acabamento da carta, pelo brilho e pelo padrão visíveis na foto:',
  '  "Master Ball" = padrão brilhante de várias Master Balls (roxas) fora da arte;',
  '  "Pokeball Foil" = padrão brilhante de várias Poké Balls fora da arte;',
  '  "Reverse Foil" = brilho/holográfico em toda a carta FORA da arte, com a arte sem brilho;',
  '  "Foil" = brilho/holográfico só DENTRO da arte, ou carta inteira brilhante (full art, ilustração especial);',
  '  "Normal" = sem brilho holográfico. Se não der para ver o brilho na foto, use "".',
  '- energia: só em carta de Energia Básica ("Energia Básica", "Basic Energy", 基本エネルギー): o tipo pelo símbolo',
  '  e pela cor, em inglês: Grass, Fire, Water, Lightning, Psychic, Fighting, Darkness, Metal ou Fairy. Nas outras, "".',
  'Se algo não estiver legível, use "". Não invente.',
].join('\n');

const INSTRUCAO_COMPARAR = [
  'A primeira imagem é a foto de uma carta de Pokémon TCG. As outras são as opções do catálogo, numeradas, todas com',
  'o mesmo nome e número. Qual opção é a MESMA impressão da foto? Compare a arte e o fundo, o padrão do brilho, os',
  'selos e logotipos (qual é, o tamanho e a POSIÇÃO: por exemplo, o selo vermelho e preto do Play! Pokémon no canto',
  'inferior direito, em cima da borda prateada ou deslocado para dentro da arte), a borda e o rodapé. Ignore o idioma',
  'do texto (o catálogo pode mostrar a versão em inglês), a iluminação, o ângulo e os reflexos da foto.',
  'Responda só com um JSON: {"opcao": número da opção (0 se nenhuma serve), "confianca": "alta", "media" ou "baixa",',
  '"motivo": frase curta em português}.',
].join('\n');
const MAXIMO_OPCOES = 8;

function doPost(e) {
  try {
    const pedido = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (pedido.acao !== 'lerCarta' && pedido.acao !== 'compararCartas') return json_({ ok: false, erro: 'Ação desconhecida.' });
    const props = PropertiesService.getScriptProperties();
    const chave = props.getProperty('GEMINI_API_KEY');
    const clienteId = props.getProperty('CLIENT_ID');
    if (!chave || !clienteId) return json_({ ok: false, erro: 'Faltam GEMINI_API_KEY e CLIENT_ID nas propriedades do Apps Script.' });

    // só o login Google feito no pokescan (Client ID do app) pode usar a sua cota do Gemini
    const info = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(String(pedido.token || '')), { muteHttpExceptions: true });
    if (info.getResponseCode() !== 200) return json_({ ok: false, erro: 'Login do Google inválido ou expirado.', login: true });
    const dono = JSON.parse(info.getContentText());
    if (dono.aud !== clienteId && dono.azp !== clienteId) return json_({ ok: false, erro: 'Login de outro aplicativo.' });

    const imagem = String(pedido.imagem || '');
    if (!imagem || imagem.length > 6 * 1024 * 1024) return json_({ ok: false, erro: 'Imagem ausente ou grande demais.' });

    let partes = [{ inlineData: { mimeType: 'image/jpeg', data: imagem } }, { text: INSTRUCAO }];
    if (pedido.acao === 'compararCartas') {
      const opcoes = (pedido.opcoes || []).slice(0, MAXIMO_OPCOES);
      if (opcoes.length < 2) return json_({ ok: false, erro: 'Mande ao menos duas opções.' });
      partes = [{ text: 'Foto da carta:' }, { inlineData: { mimeType: 'image/jpeg', data: imagem } }];
      for (let i = 0; i < opcoes.length; i++) {
        const img = imagemDaLiga_(String(opcoes[i] || ''));
        if (img.erro) return json_({ ok: false, erro: 'Opção ' + (i + 1) + ': ' + img.erro });
        partes.push({ text: 'Opção ' + (i + 1) + ':' }, { inlineData: { mimeType: img.tipo, data: img.base64 } });
      }
      partes.push({ text: INSTRUCAO_COMPARAR });
    }
    const corpo = {
      contents: [{ parts: partes }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    };
    // cota de um modelo esgotada (429): tenta o próximo da lista
    const modelos = [props.getProperty('MODELO_GEMINI') || MODELO_PADRAO].concat(MODELOS_RESERVA)
      .filter(function (m, i, lista) { return lista.indexOf(m) === i; });
    // 503/500 (Gemini sobrecarregado): espera e tenta de novo; cota esgotada (429) ou ainda sobrecarregado: próximo modelo
    let r, codigo, modelo;
    for (let i = 0; i < modelos.length; i++) {
      modelo = modelos[i];
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        if (tentativa) Utilities.sleep(1500 * tentativa);
        r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modelo) + ':generateContent', {
          method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': chave },
          payload: JSON.stringify(corpo), muteHttpExceptions: true,
        });
        codigo = r.getResponseCode();
        if (codigo !== 503 && codigo !== 500) break;
      }
      if (codigo !== 429 && codigo !== 503 && codigo !== 500) break;
    }
    if (codigo === 429) return json_({ ok: false, erro: 'Cota grátis do Gemini esgotada por agora.', temporario: true });
    if (codigo === 503 || codigo === 500) return json_({ ok: false, erro: 'Gemini sobrecarregado (HTTP ' + codigo + ').', temporario: true });
    if (codigo !== 200) return json_({ ok: false, erro: 'Gemini: HTTP ' + codigo + ' ' + r.getContentText().slice(0, 200) });
    const resposta = JSON.parse(r.getContentText());
    const saida = (((resposta.candidates || [])[0] || {}).content || {}).parts || [];
    const texto = saida.filter(function (p) { return typeof p.text === 'string'; }).map(function (p) { return p.text; }).join('');
    const limpo = texto.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    if (pedido.acao === 'compararCartas') return json_({ ok: true, modelo: modelo, resposta: JSON.parse(limpo) });
    return json_({ ok: true, modelo: modelo, carta: JSON.parse(limpo) });
  } catch (erro) {
    return json_({ ok: false, erro: String(erro && erro.message ? erro.message : erro) });
  }
}

function permitida_(url) {
  const m = String(url).match(/^https:\/\/([^\/?#]+)\//);
  return !!m && HOSTS_PERMITIDOS.indexOf(m[1].toLowerCase()) >= 0;
}

// Imagem de uma carta no servidor da Liga -> { tipo, base64 } ou { erro }. Só aceita os endereços da Liga.
function imagemDaLiga_(url) {
  if (!permitida_(url)) return { erro: 'Endereço não permitido.' };
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) return { erro: 'HTTP ' + r.getResponseCode() };
  const blob = r.getBlob();
  if (!/^image\//.test(blob.getContentType())) return { erro: 'Não é uma imagem.' };
  const bytes = blob.getBytes();
  if (bytes.length > 2 * 1024 * 1024) return { erro: 'Imagem grande demais.' };
  return { tipo: blob.getContentType(), base64: Utilities.base64Encode(bytes) };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
