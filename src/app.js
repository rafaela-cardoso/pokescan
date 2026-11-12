// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Interface: câmera -> OCR -> Liga Pokémon -> revisão -> planilha.
import { PADRAO, ESTADOS } from './config.js';
import * as camera from './camera.js';
import { lerCarta, lerIdioma, aquecer } from './ocr.js';
import { descobrirIdiomas, filtrarPorIdiomaDaEdicao } from './edicoes.js';
import { detectarExtra } from './extras.js';
import {
  buscarCandidatos, linkLiga, EXTRAS, filtrarPorNome, filtrarPorIdioma, filtrarPorTotal, filtrarPorSigla, siglaParaLink,
} from './liga.js';
import { formatarCarta } from './carta.js';
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
  $('telaAjustes').hidden = false;
  camera.desligar();
  $('clienteId').value = cfg.clienteId;
  $('planilha').value = cfg.planilha;
  $('nomeEmIngles').checked = cfg.nomeEmIngles;
  $('proxyImagens').value = cfg.proxyImagens || '';
  $('salvarDireto').checked = cfg.salvarDireto;
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

async function processar(canvas) {
  if (ocupado) return;
  ocupado = true;
  $('lendo').hidden = false;
  $('ler').disabled = true;
  try {
    const mini = $('miniatura');
    mini.width = 189; mini.height = 264;
    mini.getContext('2d').drawImage(canvas, 0, 0, mini.width, mini.height);

    const lido = await lerCarta(canvas, { progresso });
    try { lido.extraDetectado = detectarExtra(canvas).extra; } catch { lido.extraDetectado = null; }
    $('lendoMsg').textContent = 'Procurando na Liga Pokémon…';
    leitura = { lido, candidatos: [], escolha: null, erro: '', canvas };
    await consultarLiga(lido);
    mostrarResultado();
    verificarEdicoes(leitura); // em segundo plano: lê o idioma das edições sugeridas
    if (cfg.salvarDireto && leitura.confiavel) await salvar();
  } catch (e) {
    avisar(e.message || 'Falha na leitura.', 'erro');
  } finally {
    ocupado = false;
    $('lendo').hidden = true;
    $('ler').disabled = false;
  }
}

// Busca na Liga com as leituras do número (até 2) e escolhe o candidato, se a nota permitir.
async function consultarLiga(lido) {
  const vistos = new Map();
  const leiturasNumero = lido.numeros?.length ? lido.numeros : [{ numero: lido.numero, total: lido.total }];
  try {
    for (const n of leiturasNumero.slice(0, 2)) {
      for (const c of await buscarCandidatos({ nome: lido.nome, qualidadeNome: lido.qualidadeNome ?? 1, numero: n.numero, total: n.total, trechosNumero: lido.trechosNumero || [] })) {
        const antes = vistos.get(c.id);
        if (!antes || antes.nota < c.nota) vistos.set(c.id, c);
      }
    }
    leitura.erro = '';
  } catch (e) {
    leitura.erro = e.message;
  }
  // só cartas com o nome lido, do idioma da carta escaneada e da mesma coleção (total) — cada filtro só vale se
  // sobrar alguma carta, para nunca esconder a certa por causa de uma leitura ruim
  let lista = [...vistos.values()].sort((a, b) => b.nota - a.nota);
  lista = filtrarPorNome(lista, lido.nome, lido.qualidadeNome ?? 1);
  lista = filtrarPorIdioma(lista, idiomaParaEdicoes(lido));
  lista = filtrarPorIdiomaDaEdicao(lista, idiomaParaEdicoes(lido)); // edições cujo idioma já foi lido antes
  for (const n of leiturasNumero) {
    const filtrada = filtrarPorTotal(lista, n);
    if (filtrada !== lista) { lista = filtrada; break; }
  }
  lista = filtrarPorSigla(lista, lido.siglas || []); // coleção lida na carta (ASC, PBL...)
  lista = lista.slice(0, 12);
  const [a, b] = lista;
  const folga = a ? a.nota - (b?.nota ?? 0) : 0;
  leitura.candidatos = lista;
  // escolhe sozinho só quando o primeiro se destaca; senão, você toca na carta certa
  leitura.escolha = a && a.nota >= 0.6 && folga >= 0.05 ? a : null;
  // sem nome legível só o número sustenta a escolha: sempre pede conferência
  leitura.confiavel = !!(a && a.nota >= CONFIANCA_ALTA && folga >= 0.1 && (lido.qualidadeNome ?? 1) >= 0.5);
}

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
    const filtrada = filtrarPorIdiomaDaEdicao(alvo.candidatos, idiomaParaEdicoes(lido));
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
  const link = $('linkLiga');
  link.hidden = !leitura?.atual;
  if (leitura?.atual) link.href = linkAtual();
}

function cartaoCandidato(c) {
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
  b.addEventListener('click', () => aplicarCandidato(c));
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
  partes.push(`Idioma: ${NOMES_IDIOMA[lido.idioma] || 'não identificado'}`);
  if (lido.extraDetectado) partes.push(`Extra pela imagem: ${lido.extraDetectado} (confira)`);
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

function montarRegistro() {
  const c = leitura?.atual;
  const nome = $('nome').value.trim();
  const numero = $('numero').value.trim();
  const total = $('total').value.trim();
  if (!nome && !numero) throw new Error('Preencha ao menos o nome ou o número da carta.');
  // só o que vai para a planilha (Quantidade, Carta, Estado, Extra, Idioma, Link liga) + a hora, para o histórico
  return {
    quantidade: Math.max(1, Number($('quantidade').value) || 1),
    carta: formatarCarta({ nome, numero, total }),
    estado: marcado($('chipsEstado')),
    extra: $('extra').value === 'Normal' ? '' : $('extra').value, // vazio = sem extra (liga_price_sheets)
    idioma: marcado($('chipsIdioma')),
    liga: c ? linkAtual() : '',
    quando: agora(),
  };
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
function prepararFoto(registro) {
  if (!querFoto() || !leitura?.canvas) return null;
  const id = `foto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const guardando = fotoEmJpeg(leitura.canvas).then((img) => guardarFoto(id, img));
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

async function salvar() {
  let registro;
  try { registro = montarRegistro(); } catch (e) { return avisar(e.message, 'erro'); }
  const h = { registro, situacao: 'pendente' };
  const foto = prepararFoto(registro);
  if (foto) h.foto = foto;
  $('salvar').disabled = true;
  try {
    const r = await enviar(registro);
    Object.assign(h, { situacao: 'ok', linha: r.linha, somada: r.somada, total: r.quantidade });
    avisar(r.somada
      ? `✓ ${registro.carta}: já estava na linha ${r.linha}, quantidade agora ${r.quantidade}`
      : `✓ ${registro.carta} gravada na linha ${r.linha}`, 'ok');
  } catch (e) {
    h.erro = e.redirecionando ? 'esperando o login do Google' : e.message;
    if (e.redirecionando) avisar('Abrindo o login do Google… a carta é gravada quando você voltar.');
    else avisar(`Não gravei (${e.message}). Ficou na fila de pendentes.`, 'erro');
  } finally {
    $('salvar').disabled = false;
    historico.unshift(h);
    historico = historico.slice(0, 50);
    gravar('historico', historico);
    mostrarHistorico();
    descartar();
  }
  if (h.situacao === 'ok' && h.foto) {
    if (await subirFoto(h)) avisar(`✓ ${registro.carta}: gravada na planilha e foto salva no Drive`, 'ok');
    else avisar(`Carta gravada, mas a foto não subiu (${h.foto.erro}). Ficou pendente.`, 'erro');
    gravar('historico', historico);
    mostrarHistorico();
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
  $('ler').addEventListener('click', () => {
    if (!camera.ligada()) return iniciarCamera();
    camera.capturar($('video')).then(processar).catch((e) => avisar(e.message, 'erro'));
  });
  $('arquivo').addEventListener('change', async (ev) => {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (f) processar(await camera.deArquivo(f));
  });
  $('descartar').addEventListener('click', descartar);
  $('buscarDeNovo').addEventListener('click', buscarDeNovo);
  $('salvar').addEventListener('click', salvar);
  $('sigla').addEventListener('input', atualizarLink);
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
