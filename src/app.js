// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Interface: câmera -> OCR -> Liga Pokémon -> revisão -> planilha.
import { PADRAO, ESTADOS } from './config.js';
import * as camera from './camera.js';
import { lerCarta, lerIdioma, aquecer } from './ocr.js';
import { lerComGemini, compararComGemini, MAXIMO_OPCOES } from './visao.js';
import { novoDetector, LARGURA as LARG_MINI, ALTURA as ALT_MINI } from './automatico.js';
import { descobrirIdiomas, filtrarPorIdiomaDaEdicao, confirmarIdiomaDaEdicao, idiomaConhecido } from './edicoes.js';
import { detectarExtra } from './extras.js';
import {
  buscarCandidatos, linkLiga, EXTRAS, filtrarPorNome, filtrarPorIdioma, filtrarPorTotal, filtrarPorSigla, siglaParaLink, nomeBate,
} from './liga.js';
import { formatarCarta, numeroCatalogo } from './carta.js';
import { NOMES_IDIOMA } from './idioma.js';
import { idDaPlanilha, gidDaPlanilha, lerPlanilha, adicionarCarta } from './planilha.js';
import * as conta from './google.js';
import { idDaPasta, nomeDaFoto, enviarFoto, fotoEmJpeg, guardarFoto, lerFoto, apagarFoto } from './drive.js';
import { ler, gravar } from './armazenamento.js';

const $ = (id) => document.getElementById(id);
// Coreano é sempre KR (o OCR e a Liga dizem KO; o app grava KR).
const IDIOMAS = ['EN', 'PT', 'JP', 'KR', 'CH', 'CHS'];
// "ZH" = chinês sem dar para saber se é tradicional ou simplificado: marca CH (tradicional) para conferir
const idiomaDetectado = (i) => (i === 'KO' ? 'KR' : i === 'ZH' ? 'CH' : i);
const CONFIANCA_ALTA = 0.85;

const cfg = { ...PADRAO, ...ler('config', {}) };
if (!cfg.clienteId) cfg.clienteId = PADRAO.clienteId;
if (!cfg.proxyImagens) cfg.proxyImagens = PADRAO.proxyImagens;
// planilha e aba padrão da publicação, enquanto você não escolher outra em Configurar
if (!cfg.planilha && PADRAO.planilha) { cfg.planilha = PADRAO.planilha; cfg.aba = PADRAO.aba || ''; }
const salvarCfg = () => gravar('config', cfg);

let historico = ler('historico', []); // [{ registro, situacao: 'ok'|'pendente', erro? }]
let leitura = null; // { candidatos, ... } da carta em revisão
let ocupado = false;

// ---------- avisos ----------
let timerAviso;
function avisar(msg, tipo = '') {
  const a = $('aviso');
  a.textContent = msg;
  a.className = `aviso ${tipo}`;
  a.hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => { a.hidden = true; }, tipo === 'erro' ? 6000 : 3000);
}

// ---------- chips (idioma / estado) ----------
function chips(el, valores, rotulo, aoEscolher) {
  el.innerHTML = '';
  for (const v of valores) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.valor = v;
    b.textContent = rotulo(v);
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { marcar(el, v); aoEscolher?.(v); });
    el.appendChild(b);
  }
}
function marcar(el, valor) {
  for (const b of el.children) {
    const sim = b.dataset.valor === valor;
    b.classList.toggle('ativo', sim);
    b.setAttribute('aria-checked', String(sim));
  }
}
const marcado = (el) => [...el.children].find((b) => b.classList.contains('ativo'))?.dataset.valor || '';

// ---------- destino ----------
function mostrarDestino() {
  const d = $('destino');
  if (cfg.planilha && cfg.aba) {
    d.textContent = `${cfg.tituloPlanilha || 'Planilha'} › ${cfg.aba}`;
    d.classList.remove('alerta');
  } else if (idDaPlanilha(cfg.planilha) && gidDaPlanilha(cfg.planilha)) {
    d.textContent = 'Planilha do link (aba definida ao gravar)';
    d.classList.remove('alerta');
  } else {
    d.textContent = 'Escolher planilha';
    d.classList.add('alerta');
  }
}

// ---------- telas ----------
function abrirAjustes() {
  $('telaScanner').hidden = true;
  $('telaFila').hidden = true;
  $('telaAjustes').hidden = false;
  camera.desligar();
  $('clienteId').value = cfg.clienteId;
  $('planilha').value = cfg.planilha;
  $('nomeEmIngles').checked = cfg.nomeEmIngles;
  $('proxyImagens').value = cfg.proxyImagens || '';
  $('salvarDireto').checked = cfg.salvarDireto;
  $('lerComGemini').checked = cfg.lerComGemini;
  $('salvarFoto').checked = cfg.salvarFoto;
  $('pastaDrive').value = cfg.pastaDrive || '';
  marcar($('chipsEstadoPadrao'), cfg.estado);
  marcar($('chipsIdiomaPadrao'), cfg.idioma);
  $('extraPadrao').value = cfg.extra;
  if (cfg.aba) preencherAbas(cfg.abas || [cfg.aba], cfg.aba);
  mostrarConta();
  window.scrollTo(0, 0);
}

function fecharAjustes() {
  cfg.clienteId = $('clienteId').value.trim();
  cfg.nomeEmIngles = $('nomeEmIngles').checked;
  cfg.proxyImagens = $('proxyImagens').value.trim();
  cfg.salvarDireto = $('salvarDireto').checked;
  cfg.lerComGemini = $('lerComGemini').checked;
  cfg.salvarFoto = $('salvarFoto').checked;
  cfg.pastaDrive = $('pastaDrive').value.trim();
  if (cfg.salvarFoto && !idDaPasta(cfg.pastaDrive)) avisar('Para salvar as fotos, cole o link da pasta do Drive em Configurar.', 'erro');
  cfg.estado = marcado($('chipsEstadoPadrao')) || 'NM';
  cfg.idioma = marcado($('chipsIdiomaPadrao'));
  cfg.extra = $('extraPadrao').value || 'Normal';
  const novaPlanilha = $('planilha').value.trim();
  if (novaPlanilha !== cfg.planilha) { cfg.planilha = novaPlanilha; cfg.aba = ''; cfg.abas = []; cfg.tituloPlanilha = ''; }
  if ($('aba').value) cfg.aba = $('aba').value;
  salvarCfg();
  mostrarDestino();
  $('telaAjustes').hidden = true;
  $('telaScanner').hidden = false;
  iniciarCamera();
}

function mostrarConta() {
  const on = conta.conectado(cfg.clienteId);
  $('entrar').hidden = on;
  $('sair').hidden = !on;
  $('statusConta').textContent = on ? 'Conectado. O acesso dura 1 hora e é renovado sozinho ao gravar.' : '';
}

function preencherAbas(abas, escolhida) {
  const s = $('aba');
  s.innerHTML = '';
  for (const a of abas) {
    const o = document.createElement('option');
    o.value = a; o.textContent = a;
    s.appendChild(o);
  }
  s.value = escolhida && abas.includes(escolhida) ? escolhida : abas[0] || '';
}

async function carregarAbas() {
  const id = idDaPlanilha($('planilha').value);
  if (!id) return avisar('Cole o link completo da planilha do Google Sheets.', 'erro');
  try {
    cfg.clienteId = $('clienteId').value.trim();
    // guarda o link antes do login: no app instalado o login sai da página e volta depois
    const link = $('planilha').value.trim();
    if (link !== cfg.planilha) Object.assign(cfg, { planilha: link, aba: '', abas: [], tituloPlanilha: '' });
    salvarCfg();
    const token = await conta.obterToken(cfg.clienteId, { depois: 'abas' });
    mostrarConta();
    const p = await lerPlanilha(token, id);
    cfg.tituloPlanilha = p.titulo;
    cfg.abas = p.abas;
    preencherAbas(p.abas, cfg.aba || p.gids[gidDaPlanilha(cfg.planilha)]);
    cfg.aba = $('aba').value;
    salvarCfg();
    $('statusPlanilha').textContent = `“${p.titulo}”: ${p.abas.length} aba(s). Escolha onde as cartas serão gravadas.`;
  } catch (e) {
    if (e.status === 401) conta.invalidar();
    avisar(e.message, e.redirecionando ? '' : 'erro');
  }
}

// ---------- câmera ----------
async function iniciarCamera() {
  if ($('telaScanner').hidden || camera.ligada()) return;
  try {
    await camera.ligar($('video'));
    $('semCamera').hidden = true;
    $('dica').hidden = false;
    requestAnimationFrame(() => camera.posicionarMoldura($('video'), $('moldura')));
    const temLuz = await camera.lanterna(false).catch(() => false);
    $('lanterna').hidden = !temLuz;
    $('espacoLanterna').hidden = temLuz;
  } catch (e) {
    $('semCamera').hidden = false;
    $('dica').hidden = true;
    $('semCameraMsg').textContent = e.name === 'NotAllowedError'
      ? 'Permita o uso da câmera no navegador e toque em Ligar câmera. Sem câmera, use “Galeria”.'
      : (e.message || 'Não consegui abrir a câmera.');
  }
}

let luz = false;
async function alternarLanterna() {
  luz = !luz;
  if (!(await camera.lanterna(luz).catch(() => false))) luz = false;
  $('lanterna').classList.toggle('ativo', luz);
}

// ---------- leitura ----------
function progresso(status, p) {
  const fase = /load|initializ/i.test(status) ? 'Preparando o OCR (só demora na 1ª vez)…' : 'Lendo a carta…';
  $('lendoMsg').textContent = fase;
  $('barraProgresso').style.width = `${Math.round(p * 100)}%`;
}

// Leitura pelo Gemini (intermediário + login Google). Sem login, intermediário ou cota, devolve null e o OCR lê.
// Não abre o login aqui: a leitura não vem de um toque em "Entrar", e o popup seria barrado.
let avisoGemini = '';
async function lerPrimeiroComGemini(canvas) {
  avisoGemini = '';
  if (!cfg.lerComGemini || !cfg.proxyImagens) return null;
  if (!conta.conectado(cfg.clienteId)) { avisoGemini = 'Gemini: entre com Google em Configurar para usar'; return null; }
  $('lendoMsg').textContent = 'Lendo a carta com o Gemini…';
  $('barraProgresso').style.width = '50%';
  try {
    return await lerComGemini(canvas, { proxy: cfg.proxyImagens, token: await conta.obterToken(cfg.clienteId) });
  } catch (e) {
    if (e.login) conta.invalidar();
    avisoGemini = `Gemini não leu (${e.message}); lido pelo OCR`;
    return null;
  }
}

// Lê a foto (Gemini; OCR só em último caso) e sugere o extra. Não mexe na tela de revisão.
async function lerImagemDaCarta(canvas, { aoProgresso = progresso } = {}) {
  const lido = await lerPrimeiroComGemini(canvas) || await lerCarta(canvas, { progresso: aoProgresso });
  lido.avisoGemini = avisoGemini;
  // extra: o do Gemini quando ele viu o brilho; senão, a análise de brilho e cor da foto (extras.js)
    if (lido.extraGemini) {
      lido.extraDetectado = lido.extraGemini === 'Normal' ? null : lido.extraGemini;
      lido.extraFonte = 'Gemini';
    } else {
      try { lido.extraDetectado = detectarExtra(canvas).extra; } catch { lido.extraDetectado = null; }
      lido.extraFonte = 'imagem';
    }
    // número acima do total (090/084: ilustração especial, secreta): a carta é holo inteira e não existe em Reverse
    const acimaDoTotal = (lido.numeros || []).some((n) => /^\d+$/.test(n.numero) && /^\d+$/.test(n.total) && Number(n.numero) > Number(n.total));
    if (acimaDoTotal && lido.extraDetectado === 'Reverse Foil') lido.extraDetectado = null;
  return lido;
}

// A leitura achou alguma carta? (foto automática da mesa vazia ou de uma mão: nada lido)
const temCarta = (lido) => !!(lido?.nome || lido?.numeros?.length);

// Busca na Liga e abre a revisão da carta.
async function revisar(canvas, lido) {
  const mini = $('miniatura');
  mini.width = 189; mini.height = 264;
  mini.getContext('2d').drawImage(canvas, 0, 0, mini.width, mini.height);
  $('lendoMsg').textContent = 'Procurando na Liga Pokémon…';
  leitura = { lido, candidatos: [], escolha: null, erro: '', canvas };
  await consultarLiga(lido);
  await desempatarPelaImagem(leitura, canvas);
  mostrarResultado();
  verificarEdicoes(leitura); // em segundo plano: lê o idioma das edições sugeridas
  if (cfg.salvarDireto && leitura.confiavel) await salvar();
}

// Uma carta: lê, busca na Liga e mostra. No modo fila, só guarda a foto para ler em segundo plano.
async function processar(canvas, { automatica = false } = {}) {
  if (cfg.modoFila) return enfileirar(canvas, automatica);
  if (ocupado) return;
  ocupado = true;
  $('lendo').hidden = false;
  $('ler').disabled = true;
  try {
    const lido = await lerImagemDaCarta(canvas);
    if (automatica && !temCarta(lido)) { detector.ignorar(); return; } // mesa vazia: não abre nada
    await revisar(canvas, lido);
  } catch (e) {
    avisar(e.message || 'Falha na leitura.', 'erro');
  } finally {
    ocupado = false;
    $('lendo').hidden = true;
    $('ler').disabled = false;
    mostrarFila();
  }
}

// ---------- várias cartas (fila) ----------
// Cada foto entra na fila e é lida em segundo plano, uma por vez (a cota grátis do Gemini é de 15 por minuto), e já
// buscada na Liga. A fila tem tela própria: cada carta é um menu que abre e fecha, com caixa de seleção e as opções
// de revisão; o que você muda fica guardado na carta até enviar ou descartar. No fim, "Enviar selecionadas" e
// "Descartar selecionadas". "Escanear mais cartas" volta para a câmera sem perder a fila. A fila fica só na memória.
const fila = []; // { id, canvas, automatica, estado: 'lendo' | 'buscando' | 'pronta', lido, candidatos, atual, form, ... }
let lendoFila = false;
let proximoId = 1;

function enfileirar(canvas, automatica) {
  const item = { id: proximoId++, canvas, automatica, estado: 'lendo', selecionada: false };
  fila.push(item);
  avisar(`Carta ${fila.length} na fila`);
  desenharItem(item);
  mostrarFila();
  lerFila();
}

function tirarDaFila(item) {
  const i = fila.indexOf(item);
  if (i >= 0) fila.splice(i, 1);
  item.el?.remove();
  mostrarFila();
}

// Lê (Gemini; OCR em último caso) e busca na Liga, uma carta por vez.
async function lerFila() {
  if (lendoFila) return;
  lendoFila = true;
  try {
    for (let item; (item = fila.find((i) => i.estado === 'lendo'));) {
      try {
        item.lido = await lerImagemDaCarta(item.canvas, { aoProgresso: () => {} });
      } catch {
        item.lido = null;
      }
      if (!temCarta(item.lido)) {
        tirarDaFila(item);
        if (item.automatica) detector.ignorar();
        else avisar('Não achei carta numa das fotos da fila.');
        continue;
      }
      item.estado = 'buscando';
      desenharItem(item);
      await consultarLiga(item.lido, item);
      await desempatarPelaImagem(item, item.canvas);
      iniciarFormulario(item);
      item.estado = 'pronta';
      item.selecionada = !!item.atual; // já marcada quando a carta da Liga foi escolhida
      desenharItem(item);
      mostrarFila();
    }
  } finally {
    lendoFila = false;
  }
}

// Valores iniciais da revisão (os mesmos da tela de uma carta).
function iniciarFormulario(item) {
  const { lido } = item;
  item.atual = item.escolha || null;
  item.form = {
    quantidade: 1,
    idioma: lido.idioma ? idiomaDetectado(lido.idioma) : cfg.idioma,
    estado: cfg.estado,
    extra: lido.extraDetectado || cfg.extra,
  };
  aplicarCandidatoNoItem(item, item.atual);
}

function aplicarCandidatoNoItem(item, c) {
  const { lido } = item;
  item.atual = c || null;
  Object.assign(item.form, {
    nome: c ? (cfg.nomeEmIngles ? c.nomeEN || c.nome : c.nome || c.nomeEN) : lido.nome,
    numero: c ? c.numero : lido.numero,
    total: c ? c.total : lido.total,
    sigla: c ? siglaParaLink(c, lido.siglas || []) : (lido.siglas?.[0] || ''),
  });
}

const tituloDoItem = (item) => {
  const f = item.form;
  if (!f) return item.lido?.nome || 'Carta';
  return formatarCarta({ nome: f.nome, numero: f.numero, total: f.total }) + (f.sigla ? ` · ${f.sigla}` : '');
};

function estadoDoItem(item) {
  if (!item.candidatos?.length) return ['ruim', 'não achei na Liga'];
  if (item.confiavel && item.atual) return ['bom', 'pronta'];
  return ['medio', item.atual ? 'confira' : 'escolha a carta'];
}

// Cria (uma vez) ou atualiza o menu da carta. O corpo é montado quando a carta fica pronta e não é refeito depois:
// assim o que você digitou continua lá ao fechar e abrir.
function desenharItem(item) {
  if (item.estado !== 'pronta' && !item.el) return; // ainda lendo: só o contador acima da lista
  if (!item.el) {
    const d = document.createElement('details');
    d.className = 'item-fila';
    const s = document.createElement('summary');
    const caixa = document.createElement('input');
    caixa.type = 'checkbox';
    caixa.setAttribute('aria-label', 'Selecionar carta');
    caixa.addEventListener('click', (ev) => ev.stopPropagation()); // marcar não abre o menu
    caixa.addEventListener('change', () => { item.selecionada = caixa.checked; mostrarFila(); });
    const mini = document.createElement('canvas');
    mini.width = 80; mini.height = 112;
    mini.getContext('2d').drawImage(item.canvas, 0, 0, mini.width, mini.height);
    const titulo = document.createElement('span');
    titulo.className = 'titulo-item';
    const b = document.createElement('b');
    const sub = document.createElement('span');
    titulo.append(b, sub);
    const est = document.createElement('span');
    est.className = 'estado-item';
    const seta = document.createElement('span');
    seta.className = 'seta';
    seta.textContent = '▾';
    s.append(caixa, mini, titulo, est, seta);
    const corpo = document.createElement('div');
    corpo.className = 'corpo';
    d.append(s, corpo);
    item.el = d;
    item.ui = { caixa, b, sub, est, corpo };
    $('listaFila').appendChild(d);
  }
  const { caixa, b, sub, est, corpo } = item.ui;
  caixa.checked = !!item.selecionada;
  caixa.disabled = item.estado !== 'pronta';
  b.textContent = tituloDoItem(item);
  const f = item.form;
  sub.textContent = f ? [`${f.quantidade}x`, f.estado, f.extra !== 'Normal' ? f.extra : '', f.idioma].filter(Boolean).join(' · ') : 'Carta na fila';
  const [classe, texto] = estadoDoItem(item);
  est.className = `estado-item ${classe}`;
  est.textContent = texto;
  if (item.estado === 'pronta' && !corpo.childElementCount) montarCorpo(item);
}

function campoTexto(rotulo, valor, aoMudar, { curto = false, tipo = 'text' } = {}) {
  const l = document.createElement('label');
  l.className = `campo${curto ? ' curto' : ''}`;
  const sp = document.createElement('span');
  sp.textContent = rotulo;
  const i = document.createElement('input');
  i.type = tipo;
  i.autocomplete = 'off';
  i.value = valor ?? '';
  if (tipo === 'number') i.min = '1';
  i.addEventListener('input', () => aoMudar(i.value));
  l.append(sp, i);
  return [l, i];
}

function montarCorpo(item) {
  const { corpo } = item.ui;
  const { lido } = item;
  corpo.innerHTML = '';

  const resumo = document.createElement('p');
  resumo.className = 'resumo';
  resumo.textContent = [`Lido por: ${lido.lidoPor || 'OCR'}`, lido.avisoGemini, item.avisoImagem, item.erro && `Liga: ${item.erro}`].filter(Boolean).join(' · ');
  corpo.appendChild(resumo);
  const fig = document.createElement('figure');
  fig.className = 'previa-foto';
  const btTroca = Object.assign(document.createElement('button'), { type: 'button', className: 'btn pequeno', textContent: 'Tirar outra foto' });
  btTroca.addEventListener('click', () => pedirOutraFoto(item, true));
  fig.append(Object.assign(document.createElement('img'), { alt: 'Foto que vai para o Drive (toque para ampliar)' }), document.createElement('figcaption'), btTroca);
  corpo.appendChild(fig);
  item.ui.atualizarPrevia = () => previaFoto(fig, item.canvas, item.form);

  // cartas da Liga
  const campoGrade = document.createElement('div');
  campoGrade.className = 'campo';
  const rotGrade = document.createElement('span');
  rotGrade.textContent = item.candidatos.length ? 'Na Liga Pokémon — toque na carta certa' : 'Nada encontrado na Liga';
  const grade = document.createElement('div');
  grade.className = 'candidatos';
  campoGrade.append(rotGrade, grade);
  corpo.appendChild(campoGrade);

  const campos = {};
  const link = document.createElement('a');
  link.className = 'link-liga';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Ver preços desta carta na Liga Pokémon ↗';
  const atualizar = () => {
    for (const el of grade.children) el.classList.toggle('ativo', el.dataset.id === (item.atual ? item.atual.id : ''));
    link.hidden = !item.atual;
    if (item.atual) link.href = linkLiga(item.atual.nomeLiga, { sigla: item.form.sigla, numero: item.atual.numero });
    previaFoto(fig, item.canvas, item.form);
    desenharItem(item);
  };
  const escolher = (c) => {
    aplicarCandidatoNoItem(item, c);
    for (const k of ['nome', 'numero', 'total', 'sigla']) campos[k].value = item.form[k] ?? '';
    if (c) confirmarIdiomaDaEdicao(c, idiomaParaEdicoes(lido));
    atualizar();
  };
  for (const c of item.candidatos) {
    const bt = cartaoCandidato(c, () => escolher(c));
    grade.appendChild(bt);
  }
  if (item.candidatos.length) {
    const nenhuma = document.createElement('button');
    nenhuma.type = 'button';
    nenhuma.className = 'candidato nenhuma';
    nenhuma.dataset.id = '';
    nenhuma.textContent = 'Nenhuma destas';
    nenhuma.addEventListener('click', () => escolher(null));
    grade.appendChild(nenhuma);
  }

  const muda = (k) => (v) => { item.form[k] = v; atualizar(); };
  const [lNome, iNome] = campoTexto('Nome', item.form.nome, muda('nome'));
  campos.nome = iNome;
  corpo.appendChild(lNome);
  const linha = document.createElement('div');
  linha.className = 'linha';
  for (const [k, rot, op] of [['numero', 'Número'], ['total', 'Total'], ['sigla', 'Coleção', { curto: true }], ['quantidade', 'Qtd.', { curto: true, tipo: 'number' }]]) {
    const [l, i] = campoTexto(rot, item.form[k], k === 'quantidade' ? (v) => { item.form.quantidade = Math.max(1, Number(v) || 1); atualizar(); }
      : k === 'sigla' ? (v) => { item.form.sigla = v.trim().toUpperCase(); atualizar(); } : muda(k), op);
    campos[k] = i;
    linha.appendChild(l);
  }
  corpo.append(linha, link);

  for (const [k, rot, valores] of [['idioma', 'Idioma', IDIOMAS], ['estado', 'Estado', ESTADOS]]) {
    const c = document.createElement('div');
    c.className = 'campo';
    const sp = document.createElement('span');
    sp.textContent = rot;
    const ch = document.createElement('div');
    ch.className = 'chips';
    chips(ch, valores, (v) => v, (v) => { item.form[k] = v; atualizar(); });
    marcar(ch, item.form[k]);
    c.append(sp, ch);
    corpo.appendChild(c);
  }
  const lExtra = document.createElement('label');
  lExtra.className = 'campo';
  const spE = document.createElement('span');
  spE.textContent = lido.extraDetectado ? `Extra (sugerido ${lido.extraFonte === 'Gemini' ? 'pelo Gemini' : 'pela imagem'}: confira)` : 'Extra';
  const sel = document.createElement('select');
  for (const e of EXTRAS) sel.add(new Option(e, e));
  sel.value = item.form.extra;
  sel.addEventListener('change', () => { item.form.extra = sel.value; atualizar(); });
  lExtra.append(spE, sel);
  corpo.appendChild(lExtra);

  atualizar();
}

// Grava as cartas da fila na planilha, uma por vez. Gravada (ou que virou pendente) sai da fila.
let enviandoFila = false;
async function enviarItens(itens) {
  if (enviandoFila) return;
  const prontos = itens.filter((i) => i.estado === 'pronta');
  if (!prontos.length) return avisar('Nenhuma carta pronta selecionada.');
  // sem planilha escolhida, nada sai da fila
  if (!idDaPlanilha(cfg.planilha)) return avisar('Escolha a planilha em Configurar antes de enviar.', 'erro');
  enviandoFila = true;
  mostrarFila();
  let ok = 0, falhas = 0;
  try {
    for (const item of prontos) {
      let registro;
      try {
        registro = registroDe(item.form, item.atual);
      } catch (e) {
        avisar(`${tituloDoItem(item)}: ${e.message}`, 'erro');
        item.el.open = true;
        falhas++;
        continue;
      }
      const h = await gravarRegistro(registro, item.canvas);
      tirarDaFila(item);
      if (h.situacao === 'ok') ok++; else falhas++;
      if (h.redirecionando) break; // saindo para o login do Google: o resto fica na fila
    }
  } finally {
    enviandoFila = false;
    mostrarFila();
  }
  if (ok && !falhas) avisar(`✓ ${ok} carta(s) gravada(s)`, 'ok');
  else if (ok || falhas) avisar(`${ok} gravada(s), ${falhas} não (veja as pendentes e a fila)`, falhas ? 'erro' : 'ok');
}

function descartarItens(itens) {
  if (!itens.length) return;
  if (!confirm(`Descartar ${itens.length} carta(s) da fila?`)) return;
  itens.forEach(tirarDaFila);
}

function mostrarFila() {
  const lendo = fila.filter((i) => i.estado !== 'pronta').length;
  const prontas = fila.filter((i) => i.estado === 'pronta');
  const sel = prontas.filter((i) => i.selecionada);
  $('statusFila').textContent = [lendo && `lendo ${lendo}…`, prontas.length && `${prontas.length} pronta(s)`].filter(Boolean).join(' · ');
  $('abrirFila').textContent = fila.length ? `Abrir fila (${fila.length})` : 'Abrir fila';
  $('filaVazia').hidden = prontas.length > 0;
  $('carregandoFila').hidden = !lendo;
  $('carregandoTexto').textContent = `Lendo ${lendo} carta(s)…`;
  $('enviarSelecionadas').textContent = `Enviar selecionadas (${sel.length})`;
  $('descartarSelecionadas').textContent = `Descartar selecionadas (${sel.length})`;
  $('enviarSelecionadas').disabled = !sel.length || enviandoFila;
  $('descartarSelecionadas').disabled = !sel.length || enviandoFila;
  $('selecionarTodas').checked = prontas.length > 0 && sel.length === prontas.length;
}

function abrirFila() {
  $('telaScanner').hidden = true;
  $('telaAjustes').hidden = true;
  $('telaFila').hidden = false;
  camera.desligar();
  window.scrollTo(0, 0);
  mostrarFila();
}

function voltarAEscanear() {
  $('telaFila').hidden = true;
  $('telaScanner').hidden = false;
  iniciarCamera();
}

// ---------- foto automática ----------
const detector = novoDetector();
let fotografando = false;

async function tirarFoto({ automatica = false } = {}) {
  if (!camera.ligada()) return iniciarCamera();
  if (fotografando) return;
  fotografando = true;
  try {
    if (!automatica) detector.fotoManual(camera.miniaturaDaMoldura($('video'), LARG_MINI, ALT_MINI));
    const m = $('moldura');
    m.classList.remove('disparou'); void m.offsetWidth; m.classList.add('disparou');
    navigator.vibrate?.(25);
    const canvas = await camera.capturar($('video'));
    if (trocandoFoto) return trocarFoto(canvas);
    await (cfg.modoFila ? processar(canvas, { automatica }) : (processar(canvas, { automatica }), null));
  } catch (e) {
    avisar(e.message, 'erro');
  } finally {
    fotografando = false;
  }
}

function vigiarMoldura() {
  setInterval(() => {
    const m = $('moldura');
    const livre = cfg.fotoAutomatica && !trocandoFoto && camera.ligada() && !$('telaScanner').hidden && !document.hidden && !fotografando
      && (cfg.modoFila || (!ocupado && !leitura)); // revisão aberta: não atropela
    if (!livre) { m.classList.remove('firme'); if (cfg.fotoAutomatica && leitura) $('dica').textContent = 'Foto automática: grave ou descarte a carta aberta'; return; }
    const q = camera.miniaturaDaMoldura($('video'), LARG_MINI, ALT_MINI);
    if (!q) return;
    const disparar = detector.quadro(q);
    m.classList.toggle('firme', detector.parado >= 2);
    // dica na tela: mostra o que a foto automática está vendo (ajuda a achar o ponto certo no celular)
    $('dica').textContent = detector.parado >= 1 ? 'Segure parado…' : `Foto automática: encaixe a carta e segure parado (movimento ${Math.round(detector.movimento)})`;
    if (disparar) tirarFoto({ automatica: true });
  }, 300);
}

// Busca na Liga com as leituras do número (até 2) e escolhe o candidato, se a nota permitir.
async function consultarLiga(lido, alvo = leitura) {
  const vistos = new Map();
  alvo.avisoImagem = '';
  const leiturasNumero = lido.numeros?.length ? lido.numeros : [{ numero: lido.numero, total: lido.total }];
  try {
    for (const n of leiturasNumero.slice(0, 2)) {
      for (const c of await buscarCandidatos({ nome: lido.nome, qualidadeNome: lido.qualidadeNome ?? 1, numero: n.numero, total: n.total, trechosNumero: lido.trechosNumero || [], idioma: lido.idioma, exato: lido.lidoPor === 'Gemini' })) {
        const antes = vistos.get(c.id);
        if (!antes || antes.nota < c.nota) vistos.set(c.id, c);
      }
    }
    alvo.erro = '';
  } catch (e) {
    alvo.erro = e.message;
  }
  // só cartas com o nome lido, do idioma da carta escaneada e da mesma coleção (total) — cada filtro só vale se
  // sobrar alguma carta, para nunca esconder a certa por causa de uma leitura ruim
  let lista = [...vistos.values()].sort((a, b) => b.nota - a.nota);
  lista = filtrarPorNome(lista, lido.nome, lido.qualidadeNome ?? 1);
  lista = filtrarPorIdioma(lista, idiomaParaEdicoes(lido));
  lista = filtrarPorIdiomaDaEdicao(lista, idiomaParaEdicoes(lido), idiomaConhecido, numeroExato(lido)); // edições cujo idioma já foi lido antes
  for (const n of leiturasNumero) {
    const filtrada = filtrarPorTotal(lista, n);
    if (filtrada !== lista) { lista = filtrada; break; }
  }
  lista = filtrarPorSigla(lista, lido.siglas || []); // coleção lida na carta (ASC, PBL...)
  lista = lista.slice(0, 12);
  const [a, b] = lista;
  const folga = a ? a.nota - (b?.nota ?? 0) : 0;
  alvo.candidatos = lista;
  // escolhe sozinho só quando o primeiro se destaca; senão, você toca na carta certa
  alvo.escolha = a && a.nota >= 0.6 && folga >= 0.05 ? a : null;
  // sem nome legível só o número sustenta a escolha: sempre pede conferência
  alvo.confiavel = !!(a && a.nota >= CONFIANCA_ALTA && folga >= 0.1 && (lido.qualidadeNome ?? 1) >= 0.5);
}

// Cartas com o mesmo nome e número que só a imagem separa: energias básicas ("Grass Energy (001/086)", "(001/90)",
// "(001/∞)": cada Prize Pack tem a sua) e reimpressões. Só para a leitura do Gemini, e só se a escolha automática
// não for uma carta de fora desse grupo.
function empatadas(alvo) {
  const { lido } = alvo;
  if (lido.lidoPor !== 'Gemini') return [];
  const exato = numeroExato(lido);
  const grupo = alvo.candidatos.filter((c) => c.imagem && exato(c) && nomeBate(c, lido.nome));
  if (grupo.length < 2 || (alvo.escolha && !grupo.includes(alvo.escolha))) return [];
  return grupo.slice(0, MAXIMO_OPCOES);
}

// O Gemini compara a foto com as imagens da Liga dessas cartas e escolhe uma (você ainda confere antes de gravar).
async function desempatarPelaImagem(alvo, canvas) {
  const opcoes = empatadas(alvo);
  if (!opcoes.length || !cfg.proxyImagens || !conta.conectado(cfg.clienteId)) return;
  if (alvo === leitura) $('lendoMsg').textContent = `Comparando a foto com ${opcoes.length} cartas da Liga…`;
  try {
    const r = await compararComGemini(canvas, opcoes, { proxy: cfg.proxyImagens, token: await conta.obterToken(cfg.clienteId) });
    if (r.indice < 0) { alvo.avisoImagem = 'Gemini: nenhuma imagem da Liga bateu com a foto'; return; }
    const c = opcoes[r.indice];
    alvo.escolha = c;
    alvo.candidatos = [c, ...alvo.candidatos.filter((x) => x !== c)];
    alvo.avisoImagem = `Escolhida pela imagem (Gemini, confiança ${r.confianca || '?'}${r.motivo ? `: ${r.motivo}` : ''})`;
  } catch (e) {
    if (e.login) conta.invalidar();
    const antigo = /desconhecida/i.test(e.message) ? ' (publique a nova versão do Apps Script)' : '';
    alvo.avisoImagem = `Não comparei as imagens: ${e.message}${antigo}`;
  }
}

// Carta da Liga com o número (e o total, se lido) igual ao da leitura: o palpite de idioma da edição não a esconde.
const semZerosCarta = (s) => numeroCatalogo(String(s ?? '').toUpperCase());
const numeroExato = (lido) => (c) => (lido.numeros || []).some((n) => n.numero && [c, c.impresso].filter(Boolean).some((x) =>
  semZerosCarta(x.numero) === semZerosCarta(n.numero) && (!n.total || semZerosCarta(x.total) === semZerosCarta(n.total))));

// Lê pelo OCR o idioma das edições sugeridas (imagens da Liga, via intermediário) e tira as de outro idioma.
// Roda depois de mostrar a grade; se você já leu outra carta, para.
let statusEdicoes = '';
// Idioma usado para comparar com as edições: o lido ou, se só deu para saber que é latino, "EN" (mesma classe do PT)
const idiomaParaEdicoes = (lido) => lido.idioma || (lido.latino ? 'EN' : '');
async function verificarEdicoes(alvo) {
  const { lido } = alvo;
  if (!cfg.proxyImagens || !idiomaParaEdicoes(lido) || alvo.candidatos.length < 2) return;
  const atual = () => leitura === alvo;
  try {
    statusEdicoes = 'Conferindo o idioma das edições…';
    mostrarResumo();
    await descobrirIdiomas(alvo.candidatos, {
      proxy: cfg.proxyImagens,
      lerIdioma: async (c) => (atual() ? lerIdioma(c) : null),
      aoAvancar: (n, total) => { if (atual()) { statusEdicoes = `Conferindo o idioma das edições (${n}/${total})…`; mostrarResumo(); } },
    });
    if (!atual()) return;
    const antes = alvo.candidatos.length;
    const filtrada = filtrarPorIdiomaDaEdicao(alvo.candidatos, idiomaParaEdicoes(lido), idiomaConhecido, numeroExato(lido));
    statusEdicoes = filtrada.length < antes ? `${antes - filtrada.length} edição(ões) de outro idioma removida(s)` : '';
    if (filtrada.length < antes) {
      const escolhida = alvo.atual && filtrada.includes(alvo.atual) ? alvo.atual : null;
      alvo.candidatos = filtrada;
      if (!escolhida && alvo.escolha && !filtrada.includes(alvo.escolha)) alvo.escolha = filtrada.length === 1 ? filtrada[0] : null;
      if (filtrada.length === 1) alvo.escolha = filtrada[0];
      desenharGrade(escolhida || alvo.escolha);
    }
  } catch (e) {
    statusEdicoes = `Não conferi o idioma das edições: ${e.message}`;
  }
  if (atual()) mostrarResumo();
}

function aplicarCandidato(c) {
  const { lido } = leitura;
  leitura.atual = c || null;
  for (const el of $('candidatos').children) {
    const sim = el.dataset.id === (c ? c.id : '');
    el.classList.toggle('ativo', sim);
    el.setAttribute('aria-checked', String(sim));
  }
  $('nome').value = c ? (cfg.nomeEmIngles ? c.nomeEN : c.nome) : lido.nome;
  $('numero').value = c ? c.numero : lido.numero;
  $('total').value = c ? c.total : lido.total;
  $('sigla').value = c ? siglaParaLink(c, lido.siglas || []) : (lido.siglas?.[0] || '');
  const img = $('imagemCatalogo');
  img.hidden = !c?.imagem;
  if (c?.imagem) img.src = c.imagem;
  atualizarLink();
}

// Link da carta na Liga, na edição do campo "Coleção" (pode ser corrigida à mão).
const siglaDigitada = () => $('sigla').value.trim().toUpperCase();
const linkAtual = () => (leitura?.atual ? linkLiga(leitura.atual.nomeLiga, { sigla: siglaDigitada(), numero: leitura.atual.numero }) : '');
function atualizarLink() {
  atualizarPreviaFoto();
  const link = $('linkLiga');
  link.hidden = !leitura?.atual;
  if (leitura?.atual) link.href = linkAtual();
}

function cartaoCandidato(c, aoEscolher = null) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'candidato';
  b.dataset.id = c.id;
  b.setAttribute('role', 'radio');
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  if (c.imagem) img.src = c.imagem;
  const nome = document.createElement('span');
  nome.textContent = c.nome;
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = `${c.numero}/${c.total}${c.sigla ? ` · ${c.sigla}` : ''}`;
  b.append(img, nome, num);
  b.addEventListener('click', aoEscolher || (() => {
    aplicarCandidato(c);
    if (leitura) confirmarIdiomaDaEdicao(c, idiomaParaEdicoes(leitura.lido));
  }));
  return b;
}

// Grade de cartas da Liga, com `escolhida` marcada.
function desenharGrade(escolhida) {
  const { candidatos } = leitura;
  const grade = $('candidatos');
  grade.innerHTML = '';
  candidatos.forEach((c) => grade.appendChild(cartaoCandidato(c)));
  if (candidatos.length) {
    const nenhuma = document.createElement('button');
    nenhuma.type = 'button';
    nenhuma.className = 'candidato nenhuma';
    nenhuma.dataset.id = '';
    nenhuma.textContent = 'Nenhuma destas';
    nenhuma.addEventListener('click', () => aplicarCandidato(null));
    grade.appendChild(nenhuma);
  }
  $('campoCandidatos').hidden = !candidatos.length;
  aplicarCandidato(escolhida);
}

// Selo de confiança e resumo do que foi lido.
function mostrarResumo() {
  const { lido, candidatos, escolha, erro } = leitura;
  const selo = $('confianca');
  const tipo = !candidatos.length ? 'ruim' : leitura.confiavel ? 'bom' : 'medio';
  selo.textContent = !candidatos.length ? 'Não achei na Liga' : leitura.confiavel ? 'Leitura confiável'
    : escolha ? 'Confira a carta' : 'Toque na carta certa';
  selo.className = `selo ${tipo}`;
  const partes = [];
  partes.push(lido.nome ? `Nome lido: ${lido.nome}` : 'Nome não lido');
  const nums = (lido.numeros || []).map((n) => [n.numero, n.total].filter(Boolean).join('/'));
  partes.push(nums.length ? `Número lido: ${nums.join(' ou ')}` : 'Número não lido');
  if (lido.siglas?.length) partes.push(`Coleção lida: ${lido.siglas.join(' ou ')}`);
  partes.push(`Lido por: ${lido.lidoPor || 'OCR'}`);
  if (lido.avisoGemini) partes.push(lido.avisoGemini);
  if (leitura.avisoImagem) partes.push(leitura.avisoImagem);
  partes.push(`Idioma: ${NOMES_IDIOMA[lido.idioma] || 'não identificado'}`);
  if (lido.extraDetectado) partes.push(`Extra ${lido.extraFonte === 'Gemini' ? 'pelo Gemini' : 'pela imagem'}: ${lido.extraDetectado} (confira)`);
  else if (lido.extraFonte === 'Gemini') partes.push('Extra pelo Gemini: Normal (confira)');
  if (erro) partes.push(`Liga: ${erro}`);
  if (statusEdicoes) partes.push(statusEdicoes);
  $('resumo').textContent = partes.join(' · ');
}

function mostrarResultado() {
  const { lido, escolha } = leitura;
  statusEdicoes = '';
  desenharGrade(escolha);
  marcar($('chipsIdioma'), lido.idioma ? idiomaDetectado(lido.idioma) : cfg.idioma);
  marcar($('chipsEstado'), cfg.estado);
  $('extra').value = lido.extraDetectado || cfg.extra;
  $('quantidade').value = '1';
  mostrarResumo();
  $('textoBruto').textContent = Object.entries(lido.textos).map(([k, v]) => `[${k}]\n${String(v).trim()}`).join('\n\n');

  $('resultado').hidden = false;
  $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function buscarDeNovo() {
  if (!leitura) return;
  const params = { numero: $('numero').value.trim(), total: $('total').value.trim(), nome: $('nome').value.trim() };
  const sigla = siglaDigitada();
  if (sigla) params.siglas = [sigla];
  leitura.lido = { ...leitura.lido, ...params, qualidadeNome: 1, trechosNumero: [], numeros: params.numero ? [{ numero: params.numero, total: params.total }] : [] };
  await consultarLiga(leitura.lido);
  mostrarResultado();
  if (leitura.erro) avisar(leitura.erro, 'erro');
  else if (!leitura.candidatos.length) avisar('Nada encontrado na Liga com esses dados.');
}

function descartar() {
  leitura = null;
  $('resultado').hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- gravação ----------
const agora = () => new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// Só o que vai para a planilha (Quantidade, Carta, Estado, Extra, Idioma, Link liga) + a hora, para o histórico.
// Vale para a carta aberta na tela e para cada carta da fila.
function registroDe(f, atual) {
  const nome = String(f.nome ?? '').trim(), numero = String(f.numero ?? '').trim(), total = String(f.total ?? '').trim();
  if (!nome && !numero) throw new Error('Preencha ao menos o nome ou o número da carta.');
  return {
    quantidade: Math.max(1, Number(f.quantidade) || 1),
    carta: formatarCarta({ nome, numero, total }),
    estado: f.estado,
    extra: f.extra === 'Normal' ? '' : f.extra, // vazio = sem extra (liga_price_sheets)
    idioma: f.idioma,
    liga: atual ? linkLiga(atual.nomeLiga, { sigla: String(f.sigla ?? '').trim().toUpperCase(), numero: atual.numero }) : '',
    quando: agora(),
  };
}

function montarRegistro() {
  return registroDe({
    nome: $('nome').value, numero: $('numero').value, total: $('total').value, quantidade: $('quantidade').value,
    estado: marcado($('chipsEstado')), extra: $('extra').value, idioma: marcado($('chipsIdioma')), sigla: siglaDigitada(),
  }, leitura?.atual);
}

// Link com "gid=" e aba ainda não escolhida: descobre o nome da aba pelo gid (precisa do login).
async function resolverAba(token, id) {
  if (cfg.aba) return;
  const gid = gidDaPlanilha(cfg.planilha);
  if (!gid) return;
  const p = await lerPlanilha(token, id);
  if (!p.gids[gid]) return;
  Object.assign(cfg, { aba: p.gids[gid], abas: p.abas, tituloPlanilha: p.titulo });
  salvarCfg();
  mostrarDestino();
}

// Pede o login (se preciso) logo no começo, ainda dentro do toque em "Gravar": senão o popup é barrado.
// No app instalado, o login sai da página; a carta fica pendente e é enviada na volta.
// Com "Salvar foto no Drive" ligado, o mesmo login já libera o Drive (assim a foto sobe sem pedir login de novo).
const querFoto = () => cfg.salvarFoto && !!idDaPasta(cfg.pastaDrive);

// Prévia da foto que vai para o Drive (a carta com a margem, camera.js), com o nome do arquivo pelos campos atuais.
// Só aparece com "Fotos no Drive" ligado.
function previaFoto(fig, canvas, campos) {
  fig.hidden = !querFoto() || !canvas;
  if (fig.hidden) return;
  const fonte = canvas.fotoComMargem || canvas;
  fonte.urlPrevia ??= fonte.toDataURL('image/jpeg', 0.85);
  const img = fig.querySelector('img');
  if (img.src !== fonte.urlPrevia) img.src = fonte.urlPrevia;
  img.onclick = () => ampliarFoto(fonte.urlPrevia);
  const nome = String(campos.nome ?? '').trim(), numero = String(campos.numero ?? '').trim(), total = String(campos.total ?? '').trim();
  fig.querySelector('figcaption').textContent = `Foto para o Drive: ${nomeDaFoto(nome || numero ? formatarCarta({ nome, numero, total }) : '')}`;
}
// Foto em tela cheia; um toque na foto alterna entre caber na tela e ampliada (com rolagem).
function ampliarFoto(url) {
  const z = $('zoomFoto');
  z.querySelector('img').src = url;
  z.classList.remove('ampliada');
  z.hidden = false;
}

// "Tirar outra foto": a próxima foto (câmera ou galeria) troca só a imagem da carta (a da prévia e a do Drive);
// nome, número, carta escolhida e o resto continuam como estão. Na fila, volta para a carta depois.
let trocandoFoto = null; // { alvo: leitura ou item da fila, fila: boolean }
function pedirOutraFoto(alvo, naFila) {
  trocandoFoto = { alvo, fila: naFila };
  const nome = (naFila ? alvo.form?.nome : $('nome').value) || 'esta carta';
  $('avisoTrocaTexto').textContent = `Tire a foto nova de ${nome} (só a foto será trocada).`;
  $('avisoTroca').hidden = false;
  if (naFila) voltarAEscanear();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function cancelarTroca() {
  const t = trocandoFoto;
  trocandoFoto = null;
  $('avisoTroca').hidden = true;
  if (t?.fila && fila.includes(t.alvo)) voltarParaItem(t.alvo);
}
function voltarParaItem(item) {
  abrirFila();
  if (item.el) { item.el.open = true; item.el.scrollIntoView({ block: 'start' }); }
}
function trocarFoto(canvas) {
  const { alvo, fila: naFila } = trocandoFoto;
  trocandoFoto = null;
  $('avisoTroca').hidden = true;
  alvo.canvas = canvas;
  if (naFila) {
    if (!fila.includes(alvo)) return avisar('A carta saiu da fila antes da foto nova.', 'erro');
    alvo.ui?.atualizarPrevia?.();
    voltarParaItem(alvo);
  } else {
    if (leitura !== alvo) return avisar('A carta foi fechada antes da foto nova.', 'erro');
    $('miniatura').getContext('2d').drawImage(canvas, 0, 0, $('miniatura').width, $('miniatura').height);
    atualizarPreviaFoto();
    $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  avisar('Foto trocada');
}

const atualizarPreviaFoto = () => previaFoto($('previaFoto'), leitura?.canvas,
  { nome: $('nome').value, numero: $('numero').value, total: $('total').value });
const temFotoPendente = () => historico.some((h) => h.foto?.situacao === 'pendente');
const tokenParaGravar = () => conta.obterToken(cfg.clienteId, { depois: 'reenviar', drive: querFoto() || temFotoPendente() });

async function enviar(registro) {
  const id = idDaPlanilha(cfg.planilha);
  if (id && !cfg.aba && gidDaPlanilha(cfg.planilha)) await resolverAba(await tokenParaGravar(), id);
  if (!id || !cfg.aba) throw new Error('Escolha a planilha e a aba em Configurar.');
  try {
    const token = await tokenParaGravar();
    return await adicionarCarta(token, id, cfg.aba, registro);
  } catch (e) {
    if (e.status === 401) {
      conta.invalidar();
      const token = await tokenParaGravar();
      return adicionarCarta(token, id, cfg.aba, registro);
    }
    throw e;
  }
}

// ---------- foto no Drive ----------
const fotosGuardando = new Map(); // id -> promessa de guardar a foto no celular

// Guarda a foto da carta no celular ANTES de gravar (sobrevive ao login por redirecionamento e à falta de rede).
// Não espera terminar: o pedido de login precisa sair no mesmo toque. Devolve o item de foto do histórico, ou null.
function prepararFoto(registro, canvas) {
  if (!querFoto() || !canvas) return null;
  const id = `foto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // a foto com margem em volta da carta (camera.js); o recorte justo é só para a leitura
  const guardando = fotoEmJpeg(canvas.fotoComMargem || canvas).then((img) => guardarFoto(id, img));
  fotosGuardando.set(id, guardando);
  conta.esperarAntesDeSair(guardando);
  return { id, nome: nomeDaFoto(registro.carta), situacao: 'pendente' };
}

// Sobe a foto pendente de um item do histórico. Devolve true se subiu (ou se não havia foto para subir).
async function subirFoto(h) {
  const f = h.foto;
  if (!f || f.situacao !== 'pendente') return true;
  try {
    await fotosGuardando.get(f.id);
    const img = await lerFoto(f.id);
    if (!img) { Object.assign(f, { situacao: 'perdida', erro: 'a foto não ficou guardada no celular' }); return false; }
    const pasta = idDaPasta(cfg.pastaDrive);
    if (!pasta) throw new Error('cole o link da pasta do Drive em Configurar');
    const token = await conta.obterToken(cfg.clienteId, { depois: 'reenviar', drive: true });
    await enviarFoto(token, pasta, f.nome, img);
    f.situacao = 'ok';
    delete f.erro;
    apagarFoto(f.id);
    fotosGuardando.delete(f.id);
    return true;
  } catch (e) {
    if (e.status === 401) conta.invalidar();
    f.erro = e.redirecionando ? 'esperando o login do Google' : e.message;
    f.redirecionando = !!e.redirecionando;
    return false;
  }
}

// Grava uma carta (planilha + foto no Drive, se ligado) e põe no histórico. Devolve o item do histórico.
// O login é pedido no mesmo toque: não há nenhum await antes do enviar.
async function gravarRegistro(registro, canvas, { avisos = true } = {}) {
  const h = { registro, situacao: 'pendente' };
  const foto = prepararFoto(registro, canvas);
  if (foto) h.foto = foto;
  try {
    const r = await enviar(registro);
    Object.assign(h, { situacao: 'ok', linha: r.linha, somada: r.somada, total: r.quantidade });
    if (avisos) {
      avisar(r.somada
        ? `✓ ${registro.carta}: já estava na linha ${r.linha}, quantidade agora ${r.quantidade}`
        : `✓ ${registro.carta} gravada na linha ${r.linha}`, 'ok');
    }
  } catch (e) {
    h.erro = e.redirecionando ? 'esperando o login do Google' : e.message;
    h.redirecionando = !!e.redirecionando;
    if (e.redirecionando) avisar('Abrindo o login do Google… a carta é gravada quando você voltar.');
    else if (avisos) avisar(`Não gravei (${e.message}). Ficou na fila de pendentes.`, 'erro');
  }
  historico.unshift(h);
  historico = historico.slice(0, 50);
  gravar('historico', historico);
  mostrarHistorico();
  if (h.situacao === 'ok' && h.foto) {
    const subiu = await subirFoto(h);
    if (avisos) {
      if (subiu) avisar(`✓ ${registro.carta}: gravada na planilha e foto salva no Drive`, 'ok');
      else avisar(`Carta gravada, mas a foto não subiu (${h.foto.erro}). Ficou pendente.`, 'erro');
    }
    gravar('historico', historico);
    mostrarHistorico();
  }
  return h;
}

async function salvar() {
  let registro;
  try { registro = montarRegistro(); } catch (e) { return avisar(e.message, 'erro'); }
  const canvas = leitura?.canvas;
  $('salvar').disabled = true;
  try {
    const gravando = gravarRegistro(registro, canvas);
    descartar();
    await gravando;
  } finally {
    $('salvar').disabled = false;
  }
}

const pendente = (h) => h.situacao === 'pendente' || h.foto?.situacao === 'pendente';

async function reenviar() {
  const pendentes = historico.filter(pendente).reverse(); // mais antigas primeiro
  let ok = 0;
  for (const h of pendentes) {
    try {
      if (h.situacao === 'pendente') {
        const r = await enviar(h.registro);
        Object.assign(h, { situacao: 'ok', linha: r.linha, somada: r.somada, total: r.quantidade });
        delete h.erro;
      }
      if (!(await subirFoto(h))) {
        avisar(h.foto.redirecionando ? 'Abrindo o login do Google…' : `Parei no envio da foto: ${h.foto.erro}`, h.foto.redirecionando ? '' : 'erro');
        break;
      }
      ok++;
    } catch (e) {
      if (e.redirecionando) { avisar(e.message); break; }
      h.erro = e.message;
      avisar(`Parei no envio: ${e.message}`, 'erro');
      break;
    }
  }
  gravar('historico', historico);
  mostrarHistorico();
  if (ok) avisar(`✓ ${ok} pendente(s) enviada(s)`, 'ok');
}

// Descarta as cartas que estão esperando para ser gravadas (não mexe nas já gravadas).
function descartarPendentes() {
  const n = historico.filter(pendente).length;
  if (!n) return;
  if (!confirm(`Descartar ${n} pendente(s)? Cartas e fotos pendentes não serão enviadas.`)) return;
  for (const h of historico) {
    if (h.foto?.situacao === 'pendente') { apagarFoto(h.foto.id); h.foto.situacao = 'descartada'; }
  }
  historico = historico.filter((h) => h.situacao !== 'pendente');
  gravar('historico', historico);
  mostrarHistorico();
  avisar(`${n} pendente(s) descartada(s)`);
}

const textoFoto = (f) => (!f ? '' : f.situacao === 'ok' ? 'foto no Drive'
  : f.situacao === 'pendente' ? `foto pendente${f.erro ? `: ${f.erro}` : ''}` : f.situacao === 'perdida' ? 'foto perdida' : '');

// Tira da lista as cartas já gravadas (as pendentes ficam). Não mexe na planilha.
function limparGravadas() {
  const gravadas = historico.filter((h) => !pendente(h)).length;
  if (!gravadas) return;
  if (!confirm(`Limpar ${gravadas} carta(s) já gravada(s) da lista? A planilha não muda; as pendentes ficam.`)) return;
  historico = historico.filter(pendente);
  gravar('historico', historico);
  mostrarHistorico();
  avisar(`${gravadas} carta(s) tirada(s) da lista`);
}

function mostrarHistorico() {
  const ol = $('listaHistorico');
  ol.innerHTML = '';
  for (const h of historico) {
    const li = document.createElement('li');
    li.className = pendente(h) ? 'pendente' : h.situacao;
    const t = document.createElement('span');
    t.className = 'titulo';
    t.textContent = h.registro.carta;
    const d = document.createElement('span');
    d.className = 'detalhe';
    const onde = h.somada ? `somada na linha ${h.linha} (agora ${h.total})` : h.linha ? `linha ${h.linha}` : '';
    d.textContent = [`${h.registro.quantidade || 1}x`, h.registro.estado, h.registro.extra, h.registro.idioma,
      h.situacao === 'pendente' ? `pendente: ${h.erro || ''}` : onde, textoFoto(h.foto), h.registro.quando || h.registro.data]
      .filter(Boolean).join(' · ');
    li.append(t, d);
    ol.appendChild(li);
  }
  $('historicoVazio').hidden = historico.length > 0;
  const temPendente = historico.some(pendente);
  $('reenviar').hidden = !temPendente;
  $('limparGravadas').hidden = !historico.some((h) => !pendente(h));
  $('descartarPendentes').hidden = !temPendente;
}

// ---------- volta do login por redirecionamento (app instalado) ----------
// Devolve true se abriu as configurações (aí a câmera fica desligada).
function voltarDoLogin() {
  const r = conta.capturarRetorno();
  if (!r) return false;
  if (r.erro) avisar(r.erro, 'erro');
  else avisar('Conectado à conta Google', 'ok');
  if (r.depois === 'ajustes' || r.depois === 'abas') {
    abrirAjustes();
    if (!r.erro && r.depois === 'abas') carregarAbas();
    return true;
  }
  if (!r.erro && r.depois === 'reenviar' && historico.some(pendente)) reenviar();
  return false;
}

// ---------- início ----------
function iniciar() {
  chips($('chipsIdioma'), IDIOMAS, (v) => v);
  chips($('chipsEstado'), ESTADOS, (v) => v);
  chips($('chipsEstadoPadrao'), ESTADOS, (v) => v);
  chips($('chipsIdiomaPadrao'), ['', ...IDIOMAS], (v) => v || 'Detectar');
  for (const sel of [$('extra'), $('extraPadrao')]) {
    for (const e of EXTRAS) sel.add(new Option(e, e));
  }

  $('abrirAjustes').addEventListener('click', () => ($('telaAjustes').hidden ? abrirAjustes() : fecharAjustes()));
  $('destino').addEventListener('click', abrirAjustes);
  $('fecharAjustes').addEventListener('click', fecharAjustes);
  $('entrar').addEventListener('click', async () => {
    cfg.clienteId = $('clienteId').value.trim();
    salvarCfg();
    try { await conta.obterToken(cfg.clienteId, { depois: 'ajustes' }); avisar('Conectado à conta Google', 'ok'); } catch (e) { avisar(e.message, e.redirecionando ? '' : 'erro'); }
    mostrarConta();
  });
  $('clienteId').addEventListener('change', () => conta.preparar($('clienteId').value.trim()));
  $('sair').addEventListener('click', () => { conta.sair(); mostrarConta(); });
  $('abrirPlanilha').addEventListener('click', carregarAbas);
  $('aba').addEventListener('change', () => { cfg.aba = $('aba').value; salvarCfg(); });

  $('ligarCamera').addEventListener('click', iniciarCamera);
  $('lanterna').addEventListener('click', alternarLanterna);
  $('ler').addEventListener('click', () => tirarFoto());
  $('abrirFila').addEventListener('click', abrirFila);
  $('voltarEscanear').addEventListener('click', voltarAEscanear);
  $('enviarSelecionadas').addEventListener('click', () => enviarItens(fila.filter((i) => i.selecionada)));
  $('descartarSelecionadas').addEventListener('click', () => descartarItens(fila.filter((i) => i.selecionada)));
  $('selecionarTodas').addEventListener('change', () => {
    for (const i of fila) if (i.estado === 'pronta') { i.selecionada = $('selecionarTodas').checked; desenharItem(i); }
    mostrarFila();
  });
  $('limparGravadas').addEventListener('click', limparGravadas);
  for (const [id, chave] of [['fotoAutomatica', 'fotoAutomatica'], ['modoFila', 'modoFila']]) {
    $(id).checked = !!cfg[chave];
    $(id).addEventListener('change', () => { cfg[chave] = $(id).checked; salvarCfg(); mostrarFila(); galeriaMultipla(); });
  }
  vigiarMoldura();
  mostrarFila();
  // no modo fila, a galeria deixa escolher várias fotos de uma vez: cada uma entra na fila
  const galeriaMultipla = () => { $('arquivo').multiple = !!cfg.modoFila; };
  galeriaMultipla();
  $('arquivo').addEventListener('change', async (ev) => {
    const arquivos = [...(ev.target.files || [])];
    ev.target.value = '';
    if (trocandoFoto && arquivos[0]) {
      try { trocarFoto(await camera.deArquivo(arquivos[0])); } catch { avisar('Não consegui abrir a foto.', 'erro'); }
      return;
    }
    for (const f of cfg.modoFila ? arquivos : arquivos.slice(0, 1)) {
      try {
        processar(await camera.deArquivo(f));
      } catch {
        avisar(`Não consegui abrir a foto ${f.name}.`, 'erro');
      }
    }
  });
  $('descartar').addEventListener('click', descartar);
  $('buscarDeNovo').addEventListener('click', buscarDeNovo);
  $('salvar').addEventListener('click', salvar);
  $('sigla').addEventListener('input', atualizarLink);
  for (const id of ['nome', 'numero', 'total']) $(id).addEventListener('input', atualizarPreviaFoto);
  $('trocarFoto').addEventListener('click', () => leitura && pedirOutraFoto(leitura, false));
  $('cancelarTroca').addEventListener('click', cancelarTroca);
  $('zoomFoto').querySelector('img').addEventListener('click', () => $('zoomFoto').classList.toggle('ampliada'));
  $('fecharZoom').addEventListener('click', () => { $('zoomFoto').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('zoomFoto').hidden = true; });
  $('reenviar').addEventListener('click', reenviar);
  $('descartarPendentes').addEventListener('click', descartarPendentes);

  const reposicionar = () => camera.posicionarMoldura($('video'), $('moldura'));
  window.addEventListener('resize', reposicionar);
  $('video').addEventListener('loadedmetadata', reposicionar);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) camera.desligar(); else iniciarCamera();
  });

  mostrarDestino();
  mostrarHistorico();
  $('semCamera').hidden = false;
  conta.preparar(cfg.clienteId);
  if (!voltarDoLogin()) iniciarCamera();
  // OCR carrega depois do script do tesseract (defer)
  if (globalThis.Tesseract) aquecer(); else window.addEventListener('load', aquecer, { once: true });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

iniciar();
