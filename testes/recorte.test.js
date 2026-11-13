import test from 'node:test';
import assert from 'node:assert/strict';

// camera.js usa document/navigator só nas funções de câmera; as de recorte são puras.
const { recortarDoFundo, encontrarRetangulo, PROPORCAO } = await import('../src/camera.js');

// Foto sintética: fundo + carta com moldura (prateada ou amarela) e conteúdo variado por dentro.
function foto({ W = 300, H = 400, fundo = [203, 205, 207], moldura = [232, 232, 230], x = 40, y = 50, h = 300, listras = false }) {
  const data = new Uint8ClampedArray(W * H * 4);
  const w = Math.round(h * PROPORCAO), e = Math.round(w * 0.045);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      let cor = listras ? [120 + 30 * Math.sin(py / 4), 80, 45] : fundo;
      if (px >= x && px < x + w && py >= y && py < y + h) {
        const naMoldura = px < x + e || px >= x + w - e || py < y + e || py >= y + h - e;
        cor = naMoldura ? moldura : [(px * 7) % 200, (py * 3) % 180, 120]; // arte/texto
      }
      const i = (py * W + px) * 4;
      data[i] = cor[0]; data[i + 1] = cor[1]; data[i + 2] = cor[2]; data[i + 3] = 255;
    }
  }
  return { img: { data, width: W, height: H }, verdade: { x, y, w, h } };
}

const perto = (r, v, tol = 4) => r && Math.abs(r.x - v.x) <= tol && Math.abs(r.y - v.y) <= tol
  && Math.abs(r.w - v.w) <= tol * 2 && Math.abs(r.h - v.h) <= tol * 2;

test('borda prateada sobre fundo cinza-claro (pouco contraste)', () => {
  const { img, verdade } = foto({});
  assert.ok(perto(recortarDoFundo(img), verdade), JSON.stringify(recortarDoFundo(img)));
});

test('borda amarela sobre fundo escuro', () => {
  const { img, verdade } = foto({ fundo: [38, 41, 47], moldura: [235, 200, 60] });
  assert.ok(perto(recortarDoFundo(img), verdade));
});

test('fundo listrado (madeira): o método do fundo desiste e o das bordas acha a carta', () => {
  const { img, verdade } = foto({ listras: true, moldura: [232, 232, 230] });
  assert.equal(recortarDoFundo(img), null);
  assert.ok(perto(encontrarRetangulo(img), verdade, 5), JSON.stringify(encontrarRetangulo(img)));
});

test('sem carta (só fundo): nada é recortado', () => {
  const { img } = foto({ h: 0 });
  assert.equal(recortarDoFundo(img), null);
});

test('foto do Drive: margem em volta da carta, sem passar dos limites da imagem', async () => {
  const { areaComMargem } = await import('../src/camera.js');
  // carta no meio de uma foto 1000x1400: 10% de cada lado
  assert.deepEqual(areaComMargem(200, 300, 630, 880, 1000, 1400, 0.1), { x: 137, y: 212, w: 756, h: 1056 });
  // carta encostada no canto: a margem para na borda da foto
  const a = areaComMargem(0, 0, 630, 880, 700, 900, 0.1);
  assert.equal(a.x, 0);
  assert.equal(a.y, 0);
  assert.equal(a.w, 693);
  assert.equal(a.h, 900);
});
