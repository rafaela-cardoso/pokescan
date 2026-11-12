// pokescan · Copyright © 2026 Rafaela Cardoso · PolyForm Noncommercial 1.0.0
//
// Intermediário de imagens para o pokescan ler, por OCR, o idioma das edições sugeridas pela Liga.
// O servidor de imagens da Liga não deixa outro site ler os pixels (CORS); este script busca a imagem do lado do
// Google e a devolve em base64. Só aceita imagens do servidor da Liga: não é um proxy aberto.
//
// Como publicar (uma vez):
//   1. script.google.com -> Novo projeto -> cole este arquivo -> Salvar.
//   2. Implantar -> Nova implantação -> tipo "App da Web":
//        Executar como: Eu  ·  Quem pode acessar: Qualquer pessoa
//   3. Autorize, copie a URL que termina em /exec e cole no pokescan em Configurar -> "Intermediário de imagens".

const HOSTS_PERMITIDOS = ['repositorio.sbrauble.com'];

function doGet(e) {
  try {
    const url = String((e && e.parameter && e.parameter.url) || '');
    const m = url.match(/^https:\/\/([^\/?#]+)\//);
    if (!m || HOSTS_PERMITIDOS.indexOf(m[1].toLowerCase()) < 0) {
      return json_({ ok: false, erro: 'Endereço não permitido.' });
    }
    const cache = CacheService.getScriptCache();
    const chave = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url));
    const guardado = cache.get(chave);
    if (guardado) return ContentService.createTextOutput(guardado).setMimeType(ContentService.MimeType.JSON);

    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) return json_({ ok: false, erro: 'HTTP ' + r.getResponseCode() });
    const blob = r.getBlob();
    if (!/^image\//.test(blob.getContentType())) return json_({ ok: false, erro: 'Não é uma imagem.' });
    const bytes = blob.getBytes();
    if (bytes.length > 2 * 1024 * 1024) return json_({ ok: false, erro: 'Imagem grande demais.' });

    const corpo = JSON.stringify({ ok: true, tipo: blob.getContentType(), base64: Utilities.base64Encode(bytes) });
    if (corpo.length < 100000) cache.put(chave, corpo, 21600); // 6 horas
    return ContentService.createTextOutput(corpo).setMimeType(ContentService.MimeType.JSON);
  } catch (erro) {
    return json_({ ok: false, erro: String(erro && erro.message ? erro.message : erro) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
