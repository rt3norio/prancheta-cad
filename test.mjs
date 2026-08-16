import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(process.argv[2], 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) throw new Error('script block not found');
let src = m[1];

/* ---- stubs de DOM ---- */
const TOKENS = {
  '--sheet':'#F4F6F2','--ground':'#E4E7E4','--rail':'#DBDFDB','--edge':'#BCC4BE',
  '--ink':'#161C19','--ink-2':'#4A554E','--ink-3':'#7C877F','--graphite':'#2B3330',
  '--hatch':'#C9D0CA','--accent':'#0C7488','--amber':'#9A6200','--danger':'#9E2B1F',
  '--grid-1':'#CBD2CC','--grid-2':'#B8C1BA','--cross':'#4A554E','--paper-3d':'#EDEFEB',
  '--f-disp':'Bahnschrift,sans-serif','--f-mono':'Consolas,monospace'
};
/* ctx 2d instrumentado: grava os polígonos preenchidos, na ordem em que são pintados */
const REC = { poly: [], cur: [] };
const ctxProxy = new Proxy({}, {
  get(t, k){
    if (k === 'measureText') return () => ({width: 24});
    if (k === 'beginPath')   return () => { REC.cur = []; };
    if (k === 'moveTo' || k === 'lineTo') return (x, y) => REC.cur.push([x, y]);
    if (k === 'fill')        return () => { if (REC.cur.length >= 3) REC.poly.push({pts: REC.cur.slice(), style: t.fillStyle}); };
    if (k in t) return t[k];
    return () => {};
  },
  set(t, k, v){ t[k] = v; return true; }
});
const mkEl = (id) => {
  const el = {
    id, style:{}, value:'', textContent:'', innerHTML:'', children:[], scrollTop:0, scrollHeight:0,
    dataset:{}, querySelectorAll(){ return []; },
    classList:{ _s:new Set(), toggle(c,v){ v ? this._s.add(c) : this._s.delete(c); }, add(c){this._s.add(c);},
                remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);} },
    getContext(){ return ctxProxy; },
    hidden:false, attrs:{},
    setAttribute(k, v){ this.attrs[k] = String(v); }, getAttribute(k){ return this.attrs[k] ?? null; },
    addEventListener(){}, removeEventListener(){}, setPointerCapture(){}, focus(){},
    appendChild(c){ this.children.push(c); }, removeChild(c){ this.children.shift(); }, remove(){},
    querySelector(){ return mkEl('q'); }, closest(){ return null; }, select(){},
    getBoundingClientRect(){ return {width:1280, height:720, left:0, top:0}; }
  };
  return el;
};
const els = {};
const doc = {
  documentElement: mkEl('root'),
  getElementById(id){ return els[id] || (els[id] = mkEl(id)); },
  createElement(){ return mkEl('new'); },
  querySelectorAll(){ return []; },
  querySelector(sel){ return els['sel:' + sel] || (els['sel:' + sel] = mkEl(sel)); },
  addEventListener(){}, execCommand(){ return true; }
};
doc.body = mkEl('body');
const TIMERS = new Map();
let TIMER_ID = 0;
const dispararTimers = () => { const fns = [...TIMERS.values()]; TIMERS.clear(); fns.forEach(f => f()); };
const sandbox = {
  document: doc,
  window: { addEventListener(){}, devicePixelRatio: 1 },
  innerWidth: 1280, innerHeight: 800,
  // ids crescentes e disparo manual: setTimeout real nunca devolve 0
  setTimeout(fn){ TIMERS.set(++TIMER_ID, fn); return TIMER_ID; },
  clearTimeout(id){ TIMERS.delete(id); },
  Blob, FileReader: class {}, Promise,
  URL: { createObjectURL: () => 'blob:teste', revokeObjectURL(){} },
  getComputedStyle(){ return { getPropertyValue(v){ return TOKENS[v] || '#808080'; } }; },
  requestAnimationFrame(fn){ fn(); return 1; },
  localStorage: { _d:{}, getItem(k){ return this._d[k] ?? null; }, setItem(k,v){ this._d[k]=v; } },
  console, Math, JSON, parseFloat, parseInt, isNaN, Set, Map, Array, Object, Number, String, Error
};
sandbox.globalThis = sandbox;

src += `
globalThis.__api = { get M(){ return M; }, CFG, view, cam, U, quads: () => quads,
  build3D, solidSpans, toSVG, parsePoint, demo, addWall, wallLen, bbox, centroid,
  setMode, startCmd, render, render3D, render3DSoft, zoomExtents, opsOf,
  mode: () => mode, sel, CMDS, initCam, feedPoint, getAC: () => AC, lastCmd: () => lastCmd,
  pickOpening, pickWall, pickBox, renderProps, syncTools, matPersp, matLookAt, matMul,
  getSelOp: () => selOp, setSelOp: v => { selOp = v; },
  getSelBox: () => selBox, setSelBox: v => { selBox = v; },
  getSelDim: () => selDim, setSelDim: v => { selDim = v; },
  pickDim, dimLine, autoDims, pickAutoDim,
  PALETA, boxCorners, doorLeaf, drawBoxes, shadePair, quadHex, darken,
  snapPoint, snapLines, segInter, dentroDeParede, carregarDoc, nomeBase, escreverArquivo,
  setConsole, atualizaDica, consoleAberto: () => consoleAberto,
  consideraAquisicao, limpaRastro, adquirir, aplicaRastro, track: () => track, tecla,
  agirNoPonto, syncBarra, abreProps, dedos, iniciaPinca, movePinca, W2S, S2W,
  setCur: p => { cur = p; }, getCur: () => cur,
  setMira, modoMira: () => modoMira, toqueDown, toqueMove, toqueUp,
  gl: () => gl, isDirty3d: () => dirty3d };
`;

vm.createContext(sandbox);
vm.runInContext(src, sandbox, {filename: 'prancheta.js'});
const A = sandbox.__api;

/* parede sul da planta de exemplo: de (0,0) a (9000,0), espessura 150 */
const paredeSul = () => A.M.walls.find(w =>
  Math.abs(w.ay) < 1 && Math.abs(w.by) < 1 && Math.abs(w.bx - 9000) < 1);

/* ---- asserções ---- */
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { const r = fn(); if (r === false) throw new Error('retornou false');
        console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' — ' + e.message); fail++; }
};
const ta = async (name, fn) => {
  try { await fn(); console.log('  ok   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' — ' + e.message); fail++; }
};
const eq = (a, b, msg) => { if (a !== b) throw new Error((msg||'') + ' esperado ' + b + ', obtido ' + a); };
const near = (a, b, tol, msg) => { if (Math.abs(a-b) > tol) throw new Error((msg||'') + ' esperado ~' + b + ', obtido ' + a); };

console.log('\nMODELO');
t('planta de exemplo: 4 paredes de perímetro + 3 divisórias', () => eq(A.M.walls.length, 7, 'nº de paredes'));
t('planta de exemplo carregou vãos',    () => { if (A.M.ops.length !== 7) throw new Error(A.M.ops.length + ' vãos'); });
t('perímetro 9,00 × 6,50 m', () => {
  const bb = A.bbox();
  near(bb.x1 - bb.x0, 9000 + 150, 1, 'largura');
  near(bb.y1 - bb.y0, 6500 + 150, 1, 'altura');
});
t('todo vão pertence a uma parede existente', () => {
  for (const o of A.M.ops) if (!A.M.walls.some(w => w.id === o.w)) throw new Error('vão órfão ' + o.id);
});

console.log('\nGEOMETRIA DE VÃOS');
t('solidSpans corta a parede nos vãos', () => {
  const w = A.M.walls.find(v => A.opsOf(v).length === 2);
  const sp = A.solidSpans(w);
  eq(sp.length, 3, 'nº de trechos sólidos');
  const total = sp.reduce((s, [a, b]) => s + (b - a), 0);
  const cut = A.opsOf(w).reduce((s, o) => s + o.wid, 0);
  near(total, A.wallLen(w) - cut, 1, 'comprimento sólido');
});
t('solidSpans sem vãos devolve trecho único', () => {
  const w = A.M.walls.find(v => A.opsOf(v).length === 0);
  const sp = A.solidSpans(w);
  eq(sp.length, 1); near(sp[0][1] - sp[0][0], A.wallLen(w), 0.01);
});

console.log('\nMALHA 3D');
t('build3D gera faces', () => { A.build3D(); if (A.quads().length < 60) throw new Error(A.quads().length + ' faces'); });
t('nenhuma face degenerada / NaN', () => {
  for (const q of A.quads()) for (const v of q.v)
    for (const c of v) if (!isFinite(c)) throw new Error('vértice NaN');
});
t('normais unitárias', () => {
  for (const q of A.quads()) {
    const L = Math.hypot(...q.n);
    if (Math.abs(L - 1) > 1e-6) throw new Error('normal |n|=' + L);
  }
});
const topoDe = tipo => {
  let z = 0;
  for (const q of A.quads()) if (q.c === tipo) for (const v of q.v) z = Math.max(z, v[2]);
  return z;
};
const comCorte = (valor, fn) => {
  const c0 = A.CFG.corte3d;
  A.CFG.corte3d = valor; A.build3D();
  try { return fn(); } finally { A.CFG.corte3d = c0; A.build3D(); }
};
t('sem corte, as paredes sobem até o pé-direito', () =>
  comCorte(0, () => near(topoDe('wall'), A.CFG.wallH, 1, 'topo das paredes')));
t('com corte, as paredes param na altura de corte', () =>
  comCorte(1200, () => near(topoDe('wall'), 1200, 1, 'topo das paredes')));
t('o corte não encurta os móveis', () => {
  const maisAlto = Math.max(...A.M.boxes.map(b => (b.z || 0) + b.h));
  comCorte(1200, () => near(topoDe('box'), maisAlto, 1, 'topo dos móveis'));
});
t('corte acima do pé-direito é o mesmo que não cortar', () => {
  const sem = comCorte(0, () => A.quads().length);
  const alto = comCorte(999999, () => A.quads().length);
  eq(alto, sem, 'número de faces');
});
t('o corte preserva os vãos que ficam abaixo dele', () => {
  // porta de 210 cortada a 120: o vão continua vazado, sem verga
  comCorte(1200, () => {
    const w = A.M.walls.find(v => A.opsOf(v).some(o => o.kind === 'porta'));
    const o = A.opsOf(w).find(x => x.kind === 'porta');
    const L = A.wallLen(w), u = {x:(w.bx-w.ax)/L, y:(w.by-w.ay)/L};
    const cx = w.ax + u.x*o.d, cy = w.ay + u.y*o.d;
    for (const q of A.quads()) {
      if (q.c !== 'wall') continue;
      const qx = q.v.reduce((s,v)=>s+v[0],0)/4, qy = q.v.reduce((s,v)=>s+v[1],0)/4;
      const qz = q.v.reduce((s,v)=>s+v[2],0)/4;
      if (Math.hypot(qx-cx, qy-cy) < o.wid/4 && qz > 10 && qz < 1190)
        throw new Error('apareceu parede dentro do vão da porta depois do corte');
    }
  });
});
t('vão de porta fica vazado (nenhuma face sólida dentro do vão)', () => {
  const w = A.M.walls.find(v => A.opsOf(v).some(o => o.kind === 'porta'));
  const o = A.opsOf(w).find(x => x.kind === 'porta');
  const L = A.wallLen(w), u = {x:(w.bx-w.ax)/L, y:(w.by-w.ay)/L};
  const c = {x: w.ax + u.x*o.d, y: w.ay + u.y*o.d, z: o.h/2};
  for (const q of A.quads()) {
    if (q.c !== 'wall') continue;
    const cx = q.v.reduce((s,v)=>s+v[0],0)/4, cy = q.v.reduce((s,v)=>s+v[1],0)/4, cz = q.v.reduce((s,v)=>s+v[2],0)/4;
    if (Math.hypot(cx-c.x, cy-c.y) < o.wid/4 && Math.abs(cz-c.z) < o.h/4)
      throw new Error('face dentro do vão da porta');
  }
});
t('renderiza 3D sem exceção', () => { A.setMode('3d'); A.render3D(); A.setMode('2d'); });
t('renderiza 2D sem exceção', () => { A.render(); });
t('sem WebGL, cai no render por software', () => {
  if (A.gl() !== null) throw new Error('esperava gl === null com o stub');
});

console.log('\nREGRESSÃO: PISO SALTANDO NA FRENTE DAS PAREDES');
/* pinta o piso de magenta pelo token para poder identificá-lo na ordem de pintura */
t('o piso é sempre o primeiro polígono pintado, em qualquer ângulo de órbita', () => {
  const orig = TOKENS['--paper-3d'];
  TOKENS['--paper-3d'] = '#FF00FF';
  const ehPiso = s => { const [r,g,b] = String(s).match(/\d+/g).map(Number); return r > 150 && g < 100 && b > 150; };
  try {
    A.setMode('3d');
    let checados = 0;
    for (const az of [-2.6, -1.7, -0.85, 0, 0.9, 1.8, 2.7]) {
      for (const el of [0.15, 0.42, 1.1]) {
        A.cam.az = az; A.cam.el = el; A.cam.init = true;
        REC.poly.length = 0;
        A.render3DSoft();
        const idx = REC.poly.findIndex(p => ehPiso(p.style));
        if (idx < 0) throw new Error('az=' + az.toFixed(2) + ' el=' + el + ': piso não foi desenhado');
        if (idx !== 0) throw new Error('az=' + az.toFixed(2) + ' el=' + el +
          ': piso pintado na posição ' + idx + ' de ' + REC.poly.length + ' — cobriria as paredes anteriores');
        checados++;
      }
    }
    if (checados < 21) throw new Error('só ' + checados + ' ângulos avaliados');
  } finally {
    TOKENS['--paper-3d'] = orig;
    A.setMode('2d');
  }
});

console.log('\nMATRIZES DE CÂMERA');
const applyM = (m, p) => {
  const o = [0,0,0,0];
  for (let r = 0; r < 4; r++)
    o[r] = m[0*4+r]*p[0] + m[1*4+r]*p[1] + m[2*4+r]*p[2] + m[3*4+r]*p[3];
  return o;
};
t('matLookAt põe o alvo no eixo -Z da câmera', () => {
  const V = A.matLookAt([10000, 0, 0], [0, 0, 0], [0, 0, 1]);
  const o = applyM(V, [0, 0, 0, 1]);
  near(o[0], 0, 1e-3, 'x'); near(o[1], 0, 1e-3, 'y'); near(o[2], -10000, 1e-3, 'z');
});
t('matLookAt mantém o mundo +Z como cima da tela', () => {
  const V = A.matLookAt([10000, 0, 0], [0, 0, 0], [0, 0, 1]);
  const o = applyM(V, [0, 0, 1000, 1]);
  if (o[1] <= 0) throw new Error('+Z do mundo deveria subir na tela, obtido y=' + o[1]);
});
t('matPersp mapeia near/far para -1 e +1 em NDC', () => {
  const P = A.matPersp(Math.PI/4, 1.5, 100, 10000);
  const n = applyM(P, [0, 0, -100, 1]),  f = applyM(P, [0, 0, -10000, 1]);
  near(n[2]/n[3], -1, 1e-4, 'near'); near(f[2]/f[3], 1, 1e-4, 'far');
});
t('matMul concorda com aplicar as matrizes em sequência', () => {
  const P = A.matPersp(Math.PI/4, 1.2, 50, 5000);
  const V = A.matLookAt([3000, 2000, 1500], [0, 0, 0], [0, 0, 1]);
  const p = [700, -400, 250, 1];
  const a = applyM(A.matMul(P, V), p), b = applyM(P, applyM(V, p));
  for (let i = 0; i < 4; i++) near(a[i], b[i], 1e-2, 'componente ' + i);
});

console.log('\nVÃOS: SELEÇÃO E EDIÇÃO');
t('pickOpening acerta o centro do vão', () => {
  const o = A.M.ops[0];
  const w = A.M.walls.find(v => v.id === o.w);
  const L = A.wallLen(w), u = {x:(w.bx-w.ax)/L, y:(w.by-w.ay)/L};
  const hit = A.pickOpening({x: w.ax + u.x*o.d, y: w.ay + u.y*o.d});
  if (!hit || hit.id !== o.id) throw new Error('não achou o vão sob o clique');
});
t('pickOpening não pega ponto fora do vão', () => {
  const o = A.M.ops[0];
  const w = A.M.walls.find(v => v.id === o.w);
  const L = A.wallLen(w), u = {x:(w.bx-w.ax)/L, y:(w.by-w.ay)/L};
  const d = o.d + o.wid;                       // uma largura adiante do vão
  if (d < L) {
    const hit = A.pickOpening({x: w.ax + u.x*d, y: w.ay + u.y*d});
    if (hit && hit.id === o.id) throw new Error('pegou o vão fora dos seus limites');
  }
});
t('alterar altura do vão selecionado muda a malha 3D', () => {
  const o = A.M.ops.find(v => v.kind === 'janela');
  A.setSelOp(o.id);
  const antes = o.h;
  o.h = 1800; A.build3D();
  let zTopo = 0;
  const w = A.M.walls.find(v => v.id === o.w);
  const L = A.wallLen(w), u = {x:(w.bx-w.ax)/L, y:(w.by-w.ay)/L};
  const cx = w.ax + u.x*o.d, cy = w.ay + u.y*o.d;
  for (const q of A.quads()) {
    const qx = q.v.reduce((s,v)=>s+v[0],0)/4, qy = q.v.reduce((s,v)=>s+v[1],0)/4;
    if (Math.hypot(qx-cx, qy-cy) < o.wid/3)
      for (const v of q.v) if (v[2] > o.sill) zTopo = Math.max(zTopo, Math.min(v[2], o.sill + o.h));
  }
  near(o.sill + o.h, 2700, 1, 'topo do vão');
  o.h = antes; A.setSelOp(null); A.build3D();
});
t('painel de propriedades monta sem exceção em cada contexto', () => {
  A.renderProps();                                  // nada selecionado
  A.setSelOp(A.M.ops[0].id); A.renderProps();       // vão selecionado
  A.setSelOp(null);
  A.sel.add(A.M.walls[0].id); A.renderProps();      // parede selecionada
  A.sel.clear();
  A.startCmd('JAN'); A.renderProps();               // ferramenta janela ativa
  A.startCmd('POR'); A.renderProps();               // ferramenta porta ativa
});
t('PALT / JALT / PEIT ajustam os padrões', () => {
  A.startCmd('PALT', '215'); near(A.CFG.doorH, 2150, .01);
  A.startCmd('JALT', '110'); near(A.CFG.winH, 1100, .01);
  A.startCmd('PEIT', '100'); near(A.CFG.winSill, 1000, .01);
});

console.log('\nREGRESSÃO: PORTA NÃO SELECIONÁVEL');
t('clique na folha e no arco seleciona a porta, em todas as portas da planta', () => {
  const portas = A.M.ops.filter(o => o.kind === 'porta');
  if (!portas.length) throw new Error('a planta não tem portas');
  for (const o of portas) {
    const w = A.M.walls.find(v => v.id === o.w);
    const {h, u, n} = A.doorLeaf(w, o);
    const alvos = {
      'centro do vão': {x: w.ax + u.x*o.d, y: w.ay + u.y*o.d},
      'meio da folha': {x: h.x + n.x*o.wid*0.5, y: h.y + n.y*o.wid*0.5},
      'ponta da folha': {x: h.x + n.x*o.wid*0.95, y: h.y + n.y*o.wid*0.95},
      'arco a 45°': {x: h.x + (u.x+n.x)*o.wid*0.7071, y: h.y + (u.y+n.y)*o.wid*0.7071}
    };
    for (const [onde, p] of Object.entries(alvos)) {
      const hit = A.pickOpening(p);
      if (!hit || hit.id !== o.id)
        throw new Error('porta#' + o.id + ', clique em "' + onde + '" -> ' + (hit ? hit.kind + '#' + hit.id : 'nada'));
    }
  }
});
t('clique dentro do quadrante mas longe do arco não seleciona a porta', () => {
  const o = A.M.ops.find(v => v.kind === 'porta');
  const w = A.M.walls.find(v => v.id === o.w);
  const {h, u, n} = A.doorLeaf(w, o);
  const p = {x: h.x + (u.x+n.x)*o.wid*0.25, y: h.y + (u.y+n.y)*o.wid*0.25};  // meio do miolo vazio
  const hit = A.pickOpening(p);
  if (hit && hit.id === o.id) throw new Error('a área sensível virou o quadrante inteiro');
});
t('janela continua selecionável só pelo próprio vão', () => {
  const o = A.M.ops.find(v => v.kind === 'janela');
  const w = A.M.walls.find(v => v.id === o.w);
  const L = A.wallLen(w), u = {x:(w.bx-w.ax)/L, y:(w.by-w.ay)/L};
  const hit = A.pickOpening({x: w.ax + u.x*o.d, y: w.ay + u.y*o.d});
  if (!hit || hit.id !== o.id) throw new Error('janela deixou de ser selecionável');
});

console.log('\nREGRESSÃO: COTA NÃO SELECIONÁVEL');
t('DIM cria a cota e já a deixa selecionada', () => {
  const n0 = A.M.dims.length;
  A.startCmd('DIM');
  A.feedPoint({x: 1000, y: 8000}); A.feedPoint({x: 4000, y: 8000}); A.feedPoint({x: 4000, y: 8600});
  eq(A.M.dims.length, n0 + 1, 'cotas criadas');
  const d = A.M.dims[A.M.dims.length - 1];
  eq(A.getSelDim(), d.id, 'a cota recém-criada fica selecionada');
  near(Math.abs(d.off), 600, 1, 'afastamento vindo do terceiro clique');
});
t('clique sobre a linha de cota a seleciona', () => {
  const d = A.M.dims[A.M.dims.length - 1];
  const l = A.dimLine(d);
  for (const [onde, p] of [
    ['meio',    {x:(l.a.x+l.b.x)/2, y:(l.a.y+l.b.y)/2}],
    ['perto de uma ponta', {x: l.a.x + (l.b.x-l.a.x)*0.1, y: l.a.y + (l.b.y-l.a.y)*0.1}]
  ]) {
    const hit = A.pickDim(p);
    if (!hit || hit.id !== d.id) throw new Error('clique no ' + onde + ' -> ' + (hit ? hit.id : 'nada'));
  }
});
t('clique longe da linha de cota não a seleciona', () => {
  const d = A.M.dims[A.M.dims.length - 1];
  const l = A.dimLine(d);
  const hit = A.pickDim({x:(l.a.x+l.b.x)/2, y:(l.a.y+l.b.y)/2 + 3000});
  if (hit && hit.id === d.id) throw new Error('pegou a cota bem longe dela');
});
t('a linha de cota acompanha o afastamento', () => {
  const d = A.M.dims[A.M.dims.length - 1];
  const off0 = d.off;
  d.off = 1500;
  const l = A.dimLine(d);
  near(Math.abs(l.a.y - d.ay), 1500, 1, 'deslocamento aplicado');
  const hit = A.pickDim({x:(l.a.x+l.b.x)/2, y:(l.a.y+l.b.y)/2});
  if (!hit || hit.id !== d.id) throw new Error('após mudar o afastamento a cota some do hit-test');
  d.off = off0;
});
t('painel da cota monta e informa a medida', () => {
  A.setSelDim(A.M.dims[A.M.dims.length - 1].id);
  A.renderProps();
  A.setSelDim(null);
});
t('mover desloca a cota selecionada', () => {
  const d = A.M.dims[A.M.dims.length - 1];
  const x0 = d.ax, y0 = d.ay;
  A.setSelDim(d.id);
  A.startCmd('M');
  A.feedPoint({x:0, y:0}); A.feedPoint({x:700, y:-300});
  near(d.ax, x0 + 700, .01, 'ax'); near(d.ay, y0 - 300, .01, 'ay');
  A.setSelDim(null);
});
t('apagar remove a cota selecionada', () => {
  const d = A.M.dims[A.M.dims.length - 1];
  A.setSelDim(d.id);
  A.startCmd('E');
  if (A.M.dims.some(v => v.id === d.id)) throw new Error('a cota continua no desenho');
  eq(A.getSelDim(), null, 'seleção limpa');
});
t('cota automática de parede é clicável e aponta para a parede', () => {
  const autos = A.autoDims();
  if (!autos.length) throw new Error('nenhuma cota automática gerada');
  const daParede = autos.filter(d => d.wall);
  eq(daParede.length, A.M.walls.length, 'uma cota automática por parede');
  for (const d of daParede) {
    const l = A.dimLine(d);
    const hit = A.pickAutoDim({x:(l.a.x+l.b.x)/2, y:(l.a.y+l.b.y)/2});
    if (!hit) throw new Error('cota automática da parede#' + d.wall.id + ' não é clicável');
    if (!hit.wall && !hit.geral) throw new Error('cota automática sem origem identificável');
  }
});
t('cotas automáticas ficam fora da parede que medem', () => {
  for (const d of A.autoDims()) {
    if (!d.wall) continue;
    const l = A.dimLine(d);
    const meio = {x:(l.a.x+l.b.x)/2, y:(l.a.y+l.b.y)/2};
    if (A.dentroDeParede(meio))
      throw new Error('a cota da parede#' + d.wall.id + ' foi parar dentro da alvenaria');
  }
});
t('NENHUMA cota automática cai sobre o desenho', () => {
  const bb = A.bbox();
  for (const d of A.autoDims()) {
    const l = A.dimLine(d);
    for (let i = 0; i <= 10; i++) {
      const p = {x: l.a.x + (l.b.x-l.a.x)*i/10, y: l.a.y + (l.b.y-l.a.y)*i/10};
      if (p.x > bb.x0 + 1 && p.x < bb.x1 - 1 && p.y > bb.y0 + 1 && p.y < bb.y1 - 1)
        throw new Error('a cota de ' + (d.geral || 'parede#' + d.wall.id) +
          ' passa por dentro da planta, em (' + (p.x/10).toFixed(0) + ',' + (p.y/10).toFixed(0) + ')cm');
    }
  }
});
t('nenhuma cota automática cruza um móvel', () => {
  for (const d of A.autoDims()) {
    const l = A.dimLine(d);
    for (const b of A.M.boxes) {
      const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
      for (let i = 0; i <= 24; i++) {
        const p = {x: l.a.x + (l.b.x-l.a.x)*i/24, y: l.a.y + (l.b.y-l.a.y)*i/24};
        const dx = p.x - b.x, dy = p.y - b.y;
        if (Math.abs(dx*c + dy*s) < b.w/2 && Math.abs(-dx*s + dy*c) < b.d/2)
          throw new Error('cota de ' + (d.geral || 'parede#' + d.wall.id) + ' cruza "' + (b.nome || b.id) + '"');
      }
    }
  }
});
t('cotas empurradas para o mesmo lado não se sobrepõem', () => {
  const porLado = new Map();
  for (const d of A.autoDims()) {
    if (!d.wall) continue;
    const l = A.dimLine(d);
    const horizontal = Math.abs(l.b.y - l.a.y) < Math.abs(l.b.x - l.a.x);
    const chave = horizontal ? 'h' : 'v';
    const faixa = horizontal ? l.a.y : l.a.x;
    if (!porLado.has(chave)) porLado.set(chave, []);
    porLado.get(chave).push({faixa, id: d.wall.id});
  }
  for (const [eixo, arr] of porLado) {
    arr.sort((a, b) => a.faixa - b.faixa);
    for (let i = 1; i < arr.length; i++) {
      const gap = arr[i].faixa - arr[i-1].faixa;
      if (gap > 1 && gap < 200)
        throw new Error('eixo ' + eixo + ': cotas das paredes #' + arr[i-1].id + ' e #' + arr[i].id +
          ' a apenas ' + gap.toFixed(0) + 'mm uma da outra — o texto colide');
    }
  }
});
t('a cota geral fica além de todas as outras', () => {
  const dims = A.autoDims();
  const geralLargura = dims.find(d => d.geral === 'largura');
  const lg = A.dimLine(geralLargura);
  for (const d of dims) {
    if (d.geral) continue;
    const l = A.dimLine(d);
    const horizontal = Math.abs(l.b.y - l.a.y) < Math.abs(l.b.x - l.a.x);
    if (horizontal && l.a.y < 0 && l.a.y < lg.a.y)
      throw new Error('a cota da parede#' + d.wall.id + ' ficou mais longe que a cota geral');
  }
});
t('as cotas gerais do contorno ficam FORA do desenho, nos dois eixos', () => {
  const bb = A.bbox();
  const gerais = A.autoDims().filter(d => d.geral);
  eq(gerais.length, 2, 'cotas gerais');
  for (const d of gerais) {
    const l = A.dimLine(d);
    const meio = {x:(l.a.x+l.b.x)/2, y:(l.a.y+l.b.y)/2};
    const dentro = meio.x > bb.x0 && meio.x < bb.x1 && meio.y > bb.y0 && meio.y < bb.y1;
    if (dentro)
      throw new Error('cota geral de ' + d.geral + ' caiu dentro do desenho, em (' +
        meio.x.toFixed(0) + ',' + meio.y.toFixed(0) + ') — atravessa a planta e os móveis');
  }
});
t('as cotas gerais medem o contorno inteiro', () => {
  const bb = A.bbox();
  const g = Object.fromEntries(A.autoDims().filter(d => d.geral).map(d => [d.geral, d]));
  near(Math.hypot(g.largura.bx-g.largura.ax, g.largura.by-g.largura.ay), bb.x1-bb.x0, 1, 'largura');
  near(Math.hypot(g.altura.bx-g.altura.ax, g.altura.by-g.altura.ay), bb.y1-bb.y0, 1, 'altura');
});
t('nenhuma cota geral passa por cima de um móvel', () => {
  for (const d of A.autoDims().filter(v => v.geral)) {
    const l = A.dimLine(d);
    for (const b of A.M.boxes) {
      const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
      for (let i = 0; i <= 20; i++) {                    // amostra ao longo da linha de cota
        const p = {x: l.a.x + (l.b.x-l.a.x)*i/20, y: l.a.y + (l.b.y-l.a.y)*i/20};
        const dx = p.x - b.x, dy = p.y - b.y;
        const u = dx*c + dy*s, v = -dx*s + dy*c;
        if (Math.abs(u) < b.w/2 && Math.abs(v) < b.d/2)
          throw new Error('a cota geral de ' + d.geral + ' cruza "' + (b.nome || b.id) + '"');
      }
    }
  }
});
t('com COTAS desligado, nada de cota automática responde ao clique', () => {
  const autos = A.autoDims();
  const l = A.dimLine(autos[0]);
  const meio = {x:(l.a.x+l.b.x)/2, y:(l.a.y+l.b.y)/2};
  A.CFG.autoDim = false;
  const hit = A.pickAutoDim(meio);
  A.CFG.autoDim = true;
  if (hit) throw new Error('cota desligada continua clicável');
});

console.log('\nMÓVEIS');
t('planta de exemplo traz móveis, todos com cor da paleta', () => {
  if (A.M.boxes.length < 5) throw new Error('só ' + A.M.boxes.length + ' móveis');
  const cores = new Set(A.PALETA.map(p => p.c));
  for (const b of A.M.boxes) if (!cores.has(b.color)) throw new Error('cor fora da paleta: ' + b.color);
});
t('nenhum móvel da planta de exemplo invade a alvenaria', () => {
  for (const b of A.M.boxes)
    for (const c of A.boxCorners(b))
      if (A.dentroDeParede(c))
        throw new Error('"' + (b.nome || b.id) + '" tem canto dentro de uma parede');
});
t('CX cria a caixa a partir de dois cantos opostos', () => {
  const n0 = A.M.boxes.length;
  A.startCmd('CX');
  A.feedPoint({x: 1000, y: 1000}); A.feedPoint({x: 2600, y: 1800});
  eq(A.M.boxes.length, n0 + 1, 'móveis criados');
  const b = A.M.boxes[A.M.boxes.length - 1];
  near(b.w, 1600, .01, 'largura'); near(b.d, 800, .01, 'profundidade');
  near(b.x, 1800, .01, 'centro x'); near(b.y, 1400, .01, 'centro y');
  eq(b.color, A.CFG.boxColor, 'cor');
});
t('pickBox acerta o centro e recusa fora da caixa', () => {
  const b = A.M.boxes[A.M.boxes.length - 1];
  const dentro = A.pickBox({x: b.x, y: b.y});
  if (!dentro || dentro.id !== b.id) throw new Error('não achou a caixa sob o clique');
  const fora = A.pickBox({x: b.x + b.w, y: b.y + b.d});
  if (fora && fora.id === b.id) throw new Error('pegou a caixa bem fora dela');
});
t('pickBox respeita a rotação', () => {
  const b = A.M.boxes[A.M.boxes.length - 1];
  b.rot = Math.PI/2;                       // gira 90°: largura e profundidade trocam de eixo
  const noEixoLongo = {x: b.x, y: b.y + b.w*0.45};
  const noEixoCurto = {x: b.x + b.w*0.45, y: b.y};
  const a1 = A.pickBox(noEixoLongo), a2 = A.pickBox(noEixoCurto);
  b.rot = 0;
  if (!a1 || a1.id !== b.id) throw new Error('após girar, o lado longo deixou de ser clicável');
  if (a2 && a2.id === b.id)  throw new Error('após girar, ainda pega no eixo antigo');
});
t('boxCorners gira em torno do centro preservando as medidas', () => {
  const b = {x: 5000, y: 3000, w: 1600, d: 800, rot: Math.PI/6};
  const c = A.boxCorners(b);
  near(Math.hypot(c[1].x-c[0].x, c[1].y-c[0].y), 1600, .01, 'lado largura');
  near(Math.hypot(c[2].x-c[1].x, c[2].y-c[1].y), 800, .01, 'lado profundidade');
  const cx = c.reduce((s,p)=>s+p.x,0)/4, cy = c.reduce((s,p)=>s+p.y,0)/4;
  near(cx, b.x, .01, 'centro x'); near(cy, b.y, .01, 'centro y');
});
t('cada móvel vira 6 faces no 3D, com a sua cor', () => {
  A.build3D();
  const doBox = A.quads().filter(q => q.c === 'box');
  const semBase = A.M.boxes.filter(b => (b.z || 0) === 0).length;
  const comBase = A.M.boxes.length - semBase;
  eq(doBox.length, semBase*5 + comBase*6, 'faces de móveis');
  for (const b of A.M.boxes)
    if (!doBox.some(q => q.hex === b.color)) throw new Error('móvel sem faces com a cor ' + b.color);
});
t('móvel elevado começa na sua base e termina na altura certa', () => {
  const b = A.M.boxes.find(v => (v.z || 0) > 0);
  if (!b) throw new Error('a planta não tem móvel elevado');
  A.build3D();
  let zmin = Infinity, zmax = -Infinity;
  for (const q of A.quads()) if (q.c === 'box' && q.hex === b.color)
    for (const v of q.v){ zmin = Math.min(zmin, v[2]); zmax = Math.max(zmax, v[2]); }
  near(zmin, b.z, 1, 'base'); near(zmax, b.z + b.h, 1, 'topo');
});
t('quadHex resolve parede, piso e móvel', () => {
  const hex = A.M.boxes[0].color;
  eq(A.quadHex({c:'box', hex}), hex);
  if (A.quadHex({c:'wall'}) === A.quadHex({c:'floor'})) throw new Error('parede e piso com a mesma cor');
});
t('shadePair mantém a sombra mais escura que a luz em fundo claro', () => {
  const lum = c => 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
  for (const p of A.PALETA) {
    const {lo, hi} = A.shadePair(p.c, '#F4F6F2');
    if (lum(lo) >= lum(hi)) throw new Error(p.n + ': sombra não é mais escura que a luz');
    for (const v of [...lo, ...hi]) if (v < 0 || v > 1) throw new Error(p.n + ': componente fora de 0..1');
  }
});
t('COR troca o padrão e recolore o móvel selecionado', () => {
  const b = A.M.boxes[0];
  A.setSelBox(b.id);
  A.startCmd('COR', '4');
  eq(b.color, A.PALETA[3].c, 'cor do móvel');
  eq(A.CFG.boxColor, A.PALETA[3].c, 'cor padrão');
  A.setSelBox(null);
});
t('apagar móvel selecionado o remove do desenho e da malha', () => {
  const b = A.M.boxes[A.M.boxes.length - 1];
  A.setSelBox(b.id);
  A.startCmd('E');
  if (A.M.boxes.some(v => v.id === b.id)) throw new Error('o móvel continua no modelo');
  A.build3D();
  A.setSelBox(null);
});
t('mover desloca o móvel selecionado', () => {
  const b = A.M.boxes[0];
  A.setSelBox(b.id);
  const x0 = b.x, y0 = b.y;
  A.startCmd('M');
  A.feedPoint({x: 0, y: 0}); A.feedPoint({x: 500, y: -250});
  near(b.x, x0 + 500, .01, 'x'); near(b.y, y0 - 250, .01, 'y');
  b.x = x0; b.y = y0; A.setSelBox(null);
});
t('painel do móvel monta com todos os campos', () => {
  A.setSelBox(A.M.boxes[0].id);
  A.renderProps();
  A.setSelBox(null);
  A.startCmd('CX'); A.renderProps();
  A.startCmd('SEL' in A.CMDS ? 'Z' : 'Z');
});
t('SVG inclui os móveis com a cor e continua bem formado', () => {
  const s = A.toSVG();
  for (const b of A.M.boxes)
    if (!s.includes('fill="' + b.color + '"')) throw new Error('móvel ausente do SVG: ' + b.color);
  if (/NaN/.test(s)) throw new Error('SVG contém NaN');
  const open = (s.match(/<(?!\/)(?!\?)[a-zA-Z]/g) || []).length;
  const close = (s.match(/<\//g) || []).length + (s.match(/\/>/g) || []).length;
  eq(open, close, 'tags abertas vs fechadas');
});
console.log('\nREGRESSÃO: ORTO IMPEDIA DESENHAR MÓVEL');
t('com Orto ligado, os dois cantos do móvel continuam livres', () => {
  A.CFG.ortho = true;
  A.startCmd('CX');
  const a = {x: 20000, y: 20000};
  A.feedPoint(a);
  const p = A.snapPoint({x: a.x + 1600, y: a.y + 800}, a);
  if (Math.abs(p.x - a.x) < 1 || Math.abs(p.y - a.y) < 1)
    throw new Error('o Orto colapsou o retângulo: (' + (p.x-a.x) + ',' + (p.y-a.y) + ')');
  A.feedPoint(p);
  const b = A.M.boxes[A.M.boxes.length - 1];
  if (b.w < 10 || b.d < 10) throw new Error('móvel sem área: ' + b.w + '×' + b.d);
  near(b.w, 1600, 60, 'largura'); near(b.d, 800, 60, 'profundidade');
  A.M.boxes.pop();
});
t('o Orto continua valendo para parede', () => {
  A.CFG.ortho = true;
  A.startCmd('L');
  const a = {x: 20000, y: 20000};
  A.feedPoint(a);
  const p = A.snapPoint({x: a.x + 3000, y: a.y + 400}, a);
  near(p.y, a.y, 1, 'o traço travou na horizontal');
  A.startCmd('Z');
});

console.log('\nREGRESSÃO: TROCAR DE MODO CANCELAVA O COMANDO');
const MODOS = [
  ['ORTO', () => A.CFG.ortho], ['OSNAP', () => A.CFG.osnap],
  ['GRADE', () => A.CFG.snapGrid], ['RASTRO', () => A.CFG.track],
  ['COTA', () => A.CFG.autoDim], ['CORTE', () => A.CFG.corte3d > 0]
];
t('alternar um modo no meio do desenho não cancela o comando', () => {
  for (const [cmd, ler] of MODOS) {
    A.startCmd('L');
    A.feedPoint({x: 20000, y: 20000});         // já com um ponto colocado
    const antes = ler();
    A.startCmd(cmd);
    const ac = A.getAC();
    if (!ac) throw new Error(cmd + ' cancelou o comando em andamento');
    eq(ac.spec.key, 'L', cmd + ': comando ativo trocou');
    eq(ac.pts.length, 1, cmd + ': o ponto já colocado se perdeu');
    if (ler() === antes) throw new Error(cmd + ' não chegou a alternar o modo');
    A.startCmd(cmd);                            // devolve ao estado original
    A.startCmd('Z');
  }
});
t('ajustar medida no meio do desenho também não cancela', () => {
  A.startCmd('L');
  A.feedPoint({x: 20000, y: 20000});
  A.startCmd('ESP', '25');
  near(A.CFG.wallT, 250, .01, 'espessura aplicada');
  const ac = A.getAC();
  if (!ac || ac.spec.key !== 'L') throw new Error('ESP cancelou o desenho');
  eq(ac.pts.length, 1, 'o ponto se perdeu');
  A.startCmd('ESP', '15');
  A.startCmd('Z');
});
t('zoom é transparente e preserva o desenho em andamento', () => {
  A.startCmd('L');
  A.feedPoint({x: 20000, y: 20000});
  A.startCmd('Z');
  const ac = A.getAC();
  if (!ac || ac.spec.key !== 'L') throw new Error('o zoom cancelou o desenho');
  eq(ac.pts.length, 1, 'o ponto se perdeu');
  A.startCmd('E');                             // encerra de fato
  A.startCmd('Z');
});
t('um comando transparente não vira o "último comando" repetido pelo Enter', () => {
  A.startCmd('L'); A.startCmd('Z');            // L é de desenho, Z é transparente
  A.startCmd('ORTO'); A.startCmd('ORTO');
  eq(A.lastCmd(), 'L', 'Enter repetiria o toggle em vez do desenho');
});
t('comandos de desenho continuam encerrando o anterior', () => {
  A.startCmd('L');
  A.feedPoint({x: 20000, y: 20000});
  A.startCmd('CX');
  const ac = A.getAC();
  eq(ac.spec.key, 'CX', 'a ferramenta deveria ter trocado');
  eq(ac.pts.length, 0, 'a nova ferramenta começou suja');
  A.startCmd('Z');
});

console.log('\nPAN');
t('a ferramenta Pan existe e é reconhecida por P, PAN e DESLOCAR', () => {
  for (const k of ['P', 'PAN', 'DESLOCAR'])
    if (!A.CMDS[k]) throw new Error('falta o alias ' + k);
  eq(A.CMDS.P.key, 'P', 'chave da ferramenta');
});
t('Pan fica ativa até ser encerrada, sem consumir cliques', () => {
  A.startCmd('P');
  const ac = A.getAC();
  if (!ac) throw new Error('a ferramenta não permaneceu ativa');
  eq(ac.spec.key, 'P', 'ferramenta ativa');
  if (ac.spec.point) throw new Error('Pan não deveria consumir pontos do desenho');
  A.startCmd('Z');
});
t('Esc encerra o Pan e devolve o cursor ao normal', () => {
  A.startCmd('P');
  if (!els['cv'].classList.contains('pan')) throw new Error('cursor de pan não foi aplicado');
  A.tecla({key:'Escape'});
  if (els['cv'].classList.contains('pan')) throw new Error('cursor de pan ficou preso');
});
t('escolher outra ferramenta encerra o Pan', () => {
  A.startCmd('P');
  A.startCmd('L');                                  // ferramenta de desenho, não transparente
  if (els['cv'].classList.contains('pan')) throw new Error('cursor de pan ficou preso');
  A.tecla({key:'Escape'});
});
t('um comando transparente NÃO encerra o Pan', () => {
  A.startCmd('P');
  A.startCmd('ORTO'); A.startCmd('ORTO');           // alterna e volta
  const ac = A.getAC();
  if (!ac || ac.spec.key !== 'P') throw new Error('o toggle derrubou o Pan');
  if (!els['cv'].classList.contains('pan')) throw new Error('o cursor de pan se perdeu');
  A.tecla({key:'Escape'});
});
t('as setas deslocam a vista e o Shift acelera', () => {
  const x0 = A.view.x, y0 = A.view.y;
  A.tecla({key:'ArrowRight'});
  const d1 = A.view.x - x0;
  if (d1 <= 0) throw new Error('seta direita não deslocou');
  A.view.x = x0;
  A.tecla({key:'ArrowRight', shiftKey:true});
  const d2 = A.view.x - x0;
  if (d2 <= d1) throw new Error('Shift deveria deslocar mais');
  A.view.x = x0;
  A.tecla({key:'ArrowUp'});
  if (A.view.y <= y0) throw new Error('seta para cima não deslocou');
  A.view.y = y0;
});
t('as setas não deslocam enquanto há texto digitado', () => {
  const x0 = A.view.x;
  els['cin'].value = '300';
  A.tecla({key:'ArrowRight'});
  els['cin'].value = '';
  near(A.view.x, x0, .001, 'a vista não deveria ter mexido');
});

console.log('\nRASTREIO A PARTIR DE PONTOS ADQUIRIDOS');
const canto = () => { const w = paredeSul(); return {x: w.bx, y: w.by}; };
t('mirar um ponto notável e esperar adquire o ponto', () => {
  A.limpaRastro();
  A.CFG.track = true;
  A.startCmd('L');
  A.snapPoint({x: canto().x + 20, y: canto().y + 20}, null);   // osnap pega a extremidade
  A.consideraAquisicao({x: canto().x, y: canto().y}, 'ext');
  dispararTimers();
  eq(A.track().length, 1, 'pontos adquiridos');
  A.startCmd('Z');
});
t('só pontos notáveis são adquiridos — grade e face não', () => {
  A.limpaRastro();
  for (const tipo of ['grade', 'orto', 'face', 'eixo', null]) {
    A.consideraAquisicao({x: 1000, y: 1000}, tipo);
    dispararTimers();
  }
  eq(A.track().length, 0, 'nada deveria ter sido adquirido');
});
/* pontos bem longe da planta, para isolar o rastreio: o osnap tem prioridade
   sobre ele, então testar em cima de uma parede mediria a outra coisa */
const LIVRE = {x: 14000, y: 9000};
t('afastar o cursor na horizontal trava na guia do ponto adquirido', () => {
  A.limpaRastro(); A.CFG.track = true;
  A.consideraAquisicao(LIVRE, 'ext'); dispararTimers();
  A.startCmd('CX');
  const p = A.snapPoint({x: LIVRE.x - 5000, y: LIVRE.y + 30}, null);
  near(p.y, LIVRE.y, 1, 'travou no Y do ponto adquirido');
  near(p.x, LIVRE.x - 5000, 1, 'o X seguiu livre');
  A.startCmd('Z');
});
t('afastar na vertical trava no X do ponto adquirido', () => {
  A.limpaRastro();
  A.consideraAquisicao(LIVRE, 'ext'); dispararTimers();
  A.startCmd('CX');
  const p = A.snapPoint({x: LIVRE.x + 30, y: LIVRE.y - 5000}, null);
  near(p.x, LIVRE.x, 1, 'travou no X do ponto adquirido');
  near(p.y, LIVRE.y - 5000, 1, 'o Y seguiu livre');
  A.startCmd('Z');
});
t('longe de qualquer guia o rastreio não interfere', () => {
  A.limpaRastro();
  A.consideraAquisicao(LIVRE, 'ext'); dispararTimers();
  A.startCmd('CX');
  const p = A.snapPoint({x: LIVRE.x - 5000, y: LIVRE.y - 5000}, null);
  if (Math.abs(p.y - LIVRE.y) < 1 || Math.abs(p.x - LIVRE.x) < 1)
    throw new Error('travou numa guia estando longe dela');
  A.startCmd('Z');
});
t('duas guias cruzadas dão o ponto de interseção', () => {
  A.limpaRastro();
  const a = {x: 14000, y: 9000}, b = {x: 18000, y: 13000};
  A.consideraAquisicao(a, 'ext'); dispararTimers();
  A.consideraAquisicao(b, 'ext'); dispararTimers();
  eq(A.track().length, 2, 'dois pontos adquiridos');
  A.startCmd('CX');
  const p = A.snapPoint({x: b.x + 25, y: a.y + 25}, null);
  near(p.x, b.x, 1, 'X vem de um ponto'); near(p.y, a.y, 1, 'Y vem do outro');
  A.startCmd('Z');
});
t('o osnap tem prioridade sobre a guia de rastreio', () => {
  A.limpaRastro();
  const w = paredeSul(), face = w.t/2;
  A.consideraAquisicao({x: 5000, y: 4000}, 'ext'); dispararTimers();   // guia horizontal em y=4000
  A.startCmd('CX');
  // cursor junto da face da parede sul: o osnap deve vencer, não a guia
  const p = A.snapPoint({x: 5000, y: face + 20}, null);
  near(p.y, face, 1, 'a face da parede venceu a guia');
  A.startCmd('Z');
});
t('mirar de novo o mesmo ponto solta a aquisição', () => {
  A.limpaRastro();
  const c = canto();
  A.consideraAquisicao(c, 'ext'); dispararTimers();
  eq(A.track().length, 1, 'adquirido');
  A.consideraAquisicao({x: 5000, y: 5000}, 'ext'); dispararTimers();   // sai e volta
  A.consideraAquisicao(c, 'ext'); dispararTimers();
  if (A.track().some(p => Math.hypot(p.x-c.x, p.y-c.y) < 1))
    throw new Error('mirar de novo deveria ter soltado o ponto');
});
t('no máximo dois pontos ficam adquiridos', () => {
  A.limpaRastro();
  for (const x of [1000, 2000, 3000, 4000]) {
    A.consideraAquisicao({x, y: 7000}, 'ext'); dispararTimers();
  }
  eq(A.track().length, 2, 'os mais antigos saem');
});
t('desligar o rastreio limpa os pontos e para de interferir', () => {
  A.limpaRastro();
  const c = canto();
  A.consideraAquisicao(c, 'ext'); dispararTimers();
  A.startCmd('RASTRO');
  eq(A.CFG.track, false, 'desligado');
  eq(A.track().length, 0, 'pontos limpos');
  A.startCmd('CX');
  const p = A.snapPoint({x: c.x - 4000, y: c.y + 30}, null);
  if (Math.abs(p.y - c.y) < 1) throw new Error('ainda travando com o rastreio desligado');
  A.startCmd('RASTRO'); A.startCmd('Z');
});
t('terminar um comando limpa os pontos adquiridos', () => {
  A.startCmd('L');
  A.limpaRastro();
  A.consideraAquisicao(canto(), 'ext'); dispararTimers();
  eq(A.track().length, 1, 'adquirido durante o comando');
  A.tecla({key:'Escape'});                            // encerra de verdade
  eq(A.track().length, 0, 'rastreio limpo ao encerrar o comando');
});

console.log('\nPORTA: INVERTER ABERTURA');
const umaPorta = () => A.M.ops.find(o => o.kind === 'porta');
t('porta nasce com dobradiça e sentido padrão', () => {
  const o = umaPorta();
  const l = A.doorLeaf(A.M.walls.find(w => w.id === o.w), o);
  eq(l.dob, 1, 'dobradiça'); eq(l.abre, 1, 'sentido');
});
t('inverter a dobradiça move a folha para a outra ponta do vão', () => {
  const o = umaPorta(), w = A.M.walls.find(v => v.id === o.w);
  const antes = A.doorLeaf(w, o).h;
  o.dob = -1;
  const depois = A.doorLeaf(w, o).h;
  near(Math.hypot(depois.x-antes.x, depois.y-antes.y), o.wid, 1, 'a dobradiça andou a largura do vão');
  o.dob = 1;
});
t('inverter o sentido joga a folha para a outra face da parede', () => {
  const o = umaPorta(), w = A.M.walls.find(v => v.id === o.w);
  const l1 = A.doorLeaf(w, o);
  const v1 = {x: l1.end.x - l1.h.x, y: l1.end.y - l1.h.y};
  o.abre = -1;
  const l2 = A.doorLeaf(w, o);
  const v2 = {x: l2.end.x - l2.h.x, y: l2.end.y - l2.h.y};
  near(v1.x + v2.x, 0, 1, 'x oposto'); near(v1.y + v2.y, 0, 1, 'y oposto');
  o.abre = 1;
});
t('a folha continua com o comprimento do vão nas quatro combinações', () => {
  const o = umaPorta(), w = A.M.walls.find(v => v.id === o.w);
  for (const dob of [1, -1]) for (const abre of [1, -1]) {
    o.dob = dob; o.abre = abre;
    const l = A.doorLeaf(w, o);
    near(Math.hypot(l.end.x-l.h.x, l.end.y-l.h.y), o.wid, 1, 'dob=' + dob + ' abre=' + abre);
    // a dobradiça tem de cair numa das pontas do vão
    const dH = (l.h.x-w.ax)*l.u.x + (l.h.y-w.ay)*l.u.y;
    if (Math.abs(Math.abs(dH - o.d) - o.wid/2) > 1)
      throw new Error('dobradiça fora da ponta do vão em dob=' + dob);
  }
  o.dob = 1; o.abre = 1;
});
t('o hit-test acompanha as quatro combinações', () => {
  const o = umaPorta(), w = A.M.walls.find(v => v.id === o.w);
  for (const dob of [1, -1]) for (const abre of [1, -1]) {
    o.dob = dob; o.abre = abre;
    const l = A.doorLeaf(w, o);
    const meioFolha = {x:(l.h.x+l.end.x)/2, y:(l.h.y+l.end.y)/2};
    const hit = A.pickOpening(meioFolha);
    if (!hit || hit.id !== o.id)
      throw new Error('folha não clicável com dob=' + dob + ' abre=' + abre);
    const arco = {x: l.h.x + (l.u.x*dob + l.n.x*abre)*o.wid*0.7071,
                  y: l.h.y + (l.u.y*dob + l.n.y*abre)*o.wid*0.7071};
    const hitArco = A.pickOpening(arco);
    if (!hitArco || hitArco.id !== o.id)
      throw new Error('arco não clicável com dob=' + dob + ' abre=' + abre);
  }
  o.dob = 1; o.abre = 1;
});
t('INV e INVS alternam a porta selecionada', () => {
  const o = umaPorta();
  A.setSelOp(o.id);
  A.startCmd('INV');  eq(o.dob, -1, 'dobradiça após INV');
  A.startCmd('INV');  eq(o.dob, 1,  'dobradiça de volta');
  A.startCmd('INVS'); eq(o.abre, -1, 'sentido após INVS');
  A.startCmd('INVS'); eq(o.abre, 1,  'sentido de volta');
  A.setSelOp(null);
});
t('inverter janela pelo comando é recusado', () => {
  const j = A.M.ops.find(o => o.kind === 'janela');
  A.setSelOp(j.id);
  A.startCmd('INV');
  if (j.dob === -1) throw new Error('janela não deveria ter dobradiça');
  A.setSelOp(null); A.startCmd('Z');
});
t('as inversões sobrevivem ao salvar e reabrir', () => {
  const o = umaPorta();
  o.dob = -1; o.abre = -1;
  const doc = JSON.stringify(A.M);
  A.carregarDoc(doc);
  const r = A.M.ops.find(v => v.id === o.id);
  eq(r.dob, -1, 'dobradiça'); eq(r.abre, -1, 'sentido');
  r.dob = 1; r.abre = 1;
});

console.log('\nCONSOLE OPCIONAL');
t('nasce fechado', () => {
  A.setConsole(false);
  eq(A.consoleAberto(), false, 'estado inicial');
});
t('o console fechado NÃO usa display:none — o input tem de seguir focável', () => {
  const html = fs.readFileSync(process.argv[2], 'utf8');
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const regra = css.match(/\.console\.oculto\s*\{([^}]*)\}/);
  if (!regra) throw new Error('falta a regra .console.oculto');
  if (/display\s*:\s*none/.test(regra[1]))
    throw new Error('display:none mataria F8/F3/Esc/Delete/Ctrl+Z e a entrada de coordenadas');
  if (!/overflow\s*:\s*hidden/.test(regra[1])) throw new Error('sem overflow:hidden o conteúdo vaza');
});
t('alternar o console redimensiona o canvas', () => {
  let chamadas = 0;
  const orig = els['cv'].getBoundingClientRect;
  els['cv'].getBoundingClientRect = () => { chamadas++; return {width:1280, height:720, left:0, top:0}; };
  A.setConsole(true); A.setConsole(false);
  els['cv'].getBoundingClientRect = orig;
  if (chamadas < 2) throw new Error('resize() não foi chamado ao abrir e fechar');
});
t('com o console fechado, o prompt do comando vai para o indicador', () => {
  A.setConsole(false);
  A.startCmd('L');
  const el = els['dica'];
  if (!el.classList.contains('on')) throw new Error('indicador não apareceu com comando ativo');
  if (!/ponto/i.test(el.textContent)) throw new Error('indicador não mostra o prompt: ' + el.textContent);
  A.startCmd('Z');
});
t('o aviso do resultado sobrevive ao fim do comando e depois some sozinho', () => {
  A.setConsole(false);
  A.startCmd('L');
  A.tecla({key:'Escape'});                // endCmd loga e repõe o prompt no mesmo instante
  const el = els['dica'];
  if (!el.classList.contains('on'))
    throw new Error('o aviso sumiu no mesmo instante em que endCmd repôs o prompt');
  dispararTimers();                      // passa o tempo do aviso temporário
  if (el.classList.contains('on')) throw new Error('indicador ficou preso na tela');
});
t('com o console aberto o indicador não aparece', () => {
  A.setConsole(true);
  A.startCmd('L');
  if (els['dica'].classList.contains('on')) throw new Error('indicador duplicando o console');
  A.startCmd('Z');
  A.setConsole(false);
});
t('erro fechado vira aviso vermelho no indicador', () => {
  A.setConsole(false);
  A.startCmd('ESP', 'abc');              // valor inválido
  const el = els['dica'];
  if (!el.classList.contains('on')) throw new Error('erro não chegou ao indicador');
  if (!el.classList.contains('erro')) throw new Error('erro sem a marcação vermelha');
});
t('a preferência do console é guardada', () => {
  A.setConsole(true);
  eq(sandbox.localStorage.getItem('prancheta.console'), '1', 'aberto');
  A.setConsole(false);
  eq(sandbox.localStorage.getItem('prancheta.console'), '0', 'fechado');
});
t('o comando CONSOLE alterna o estado', () => {
  A.setConsole(false);
  A.startCmd('CONSOLE'); eq(A.consoleAberto(), true, 'abriu');
  A.startCmd('CONSOLE'); eq(A.consoleAberto(), false, 'fechou');
});

console.log('\nARQUIVO: SALVAR E ABRIR');
t('carregarDoc restaura um desenho completo a partir do texto', () => {
  const original = JSON.stringify(A.M);
  const nParedes = A.M.walls.length, nVaos = A.M.ops.length, nMoveis = A.M.boxes.length;
  A.startCmd('NOVO');
  eq(A.M.walls.length, 0, 'desenho limpo');
  if (!A.carregarDoc(original)) throw new Error('carregarDoc recusou o próprio arquivo que geramos');
  eq(A.M.walls.length, nParedes, 'paredes'); eq(A.M.ops.length, nVaos, 'vãos'); eq(A.M.boxes.length, nMoveis, 'móveis');
});
t('o arquivo salvo preserva medidas, cores e rotações exatamente', () => {
  const antes = JSON.stringify(A.M);
  A.carregarDoc(antes);
  eq(JSON.stringify(A.M), antes, 'ida e volta byte a byte');
});
t('carregarDoc rejeita texto que não é um desenho', () => {
  const antes = A.M.walls.length;
  for (const lixo of ['', 'nada disso', '{}', '[1,2,3]', '{"walls":"x"}']) {
    if (A.carregarDoc(lixo)) throw new Error('aceitou entrada inválida: ' + JSON.stringify(lixo));
  }
  eq(A.M.walls.length, antes, 'desenho intacto após entrada inválida');
});
t('nome do arquivo descreve o conteúdo', () => {
  const n = A.nomeBase();
  if (!/^planta-\d+p(-\d+m)?$/.test(n)) throw new Error('nome inesperado: ' + n);
  if (!n.includes(A.M.walls.length + 'p')) throw new Error('nome não reflete a contagem de paredes');
});
await ta('publicado como artifact, salva pelo visualizador', async () => {
  let pedido = null;
  sandbox.claude = { use: async n => n === 'downloads' ? { save: async req => { pedido = req; return {status:'saved'}; } } : null };
  const r = await A.escreverArquivo('teste.json', '{"a":1}', 'application/json', 'Teste');
  delete sandbox.claude;
  if (!r.ok || r.via !== 'viewer') throw new Error('não usou a capability: ' + JSON.stringify(r));
  eq(pedido.filename, 'teste.json', 'nome do arquivo');
  eq(pedido.data, '{"a":1}', 'conteúdo');
});
await ta('viewer recusando o download não vira erro barulhento', async () => {
  sandbox.claude = { use: async () => ({ save: async () => { const e = new Error('no'); e.code = 'declined'; throw e; } }) };
  const r = await A.escreverArquivo('teste.json', '{}', 'application/json', 'Teste');
  delete sandbox.claude;
  eq(r.ok, false, 'ok'); eq(r.via, 'cancelado', 'via');
});
await ta('extensão bloqueada pelo viewer cai para a saída de texto', async () => {
  sandbox.claude = { use: async () => ({ save: async () => { const e = new Error('svg off'); e.code = 'extension_not_enabled'; throw e; } }) };
  const r = await A.escreverArquivo('teste.svg', '<svg/>', 'image/svg+xml', 'Teste');
  delete sandbox.claude;
  eq(r.ok, false, 'ok'); eq(r.via, 'erro', 'via');
});
await ta('sem a capability, segue para os caminhos locais', async () => {
  sandbox.claude = { use: async () => null };
  let clicado = null;
  const origCreate = doc.createElement;
  doc.createElement = tag => { const el = mkEl(tag); el.click = () => { clicado = el; }; return el; };
  const r = await A.escreverArquivo('teste.json', '{}', 'application/json', 'Teste');
  doc.createElement = origCreate;
  delete sandbox.claude;
  if (!r.ok || r.via !== 'download') throw new Error('não caiu no caminho local: ' + JSON.stringify(r));
  if (!clicado) throw new Error('a âncora não foi clicada');
});
await ta('escreverArquivo usa o seletor de arquivos quando existe', async () => {
  let pedido = null, escrito = '';
  sandbox.window.showSaveFilePicker = async opt => {
    pedido = opt;
    return { name: opt.suggestedName,
             createWritable: async () => ({ write: async b => { escrito = b; }, close: async () => {} }) };
  };
  const r = await A.escreverArquivo('teste.json', '{"a":1}', 'application/json', 'Teste');
  delete sandbox.window.showSaveFilePicker;
  if (!r.ok || r.via !== 'picker') throw new Error('não usou o seletor: ' + JSON.stringify(r));
  eq(pedido.suggestedName, 'teste.json', 'nome sugerido');
  if (!escrito) throw new Error('nada foi escrito no arquivo');
});
await ta('cancelar o seletor não cai no download nem gera erro', async () => {
  sandbox.window.showSaveFilePicker = async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; };
  const r = await A.escreverArquivo('teste.json', '{}', 'application/json', 'Teste');
  delete sandbox.window.showSaveFilePicker;
  eq(r.ok, false, 'ok'); eq(r.via, 'cancelado', 'via');
});
await ta('sem seletor, cai para o download por âncora', async () => {
  let clicado = null;
  const origCreate = doc.createElement;
  doc.createElement = tag => { const el = mkEl(tag); el.click = () => { clicado = el; }; return el; };
  const r = await A.escreverArquivo('teste.json', '{"a":1}', 'application/json', 'Teste');
  doc.createElement = origCreate;
  if (!r.ok || r.via !== 'download') throw new Error('não caiu no download: ' + JSON.stringify(r));
  if (!clicado) throw new Error('a âncora não chegou a ser clicada');
  eq(clicado.download, 'teste.json', 'atributo download');
});

console.log('\nSNAP: FACE DA PAREDE, NÃO O EIXO');
t('a planta tem a parede de referência', () => { if (!paredeSul()) throw new Error('parede sul não encontrada'); });
t('desenhando um móvel, o cursor gruda na face — não no eixo', () => {
  const w = paredeSul(), face = w.t/2;
  A.startCmd('CX');                                   // ferramenta móvel ativa
  for (const x of [5000, 4000]) {                     // 4000 fica perto da divisória em x=3800
    for (const lado of [1, -1]) {
      const bruto = {x, y: lado*face + lado*30};      // 3 cm depois da face
      const p = A.snapPoint(bruto, null);
      near(p.y, lado*face, 1, 'x=' + x + ' lado ' + lado + ': y do snap');
      if (Math.abs(p.y) < 1) throw new Error('x=' + x + ': grudou no eixo, dentro da alvenaria');
    }
  }
  A.startCmd('Z');
});
t('nenhum ponto de snap cai no miolo da alvenaria', () => {
  const w = paredeSul(), face = w.t/2;
  A.startCmd('CX');
  for (let x = 500; x <= 8500; x += 250) {
    for (const dy of [-40, -12, 12, 40]) {
      const p = A.snapPoint({x, y: dy}, null);
      if (A.dentroDeParede(p))
        throw new Error('snap em (' + p.x.toFixed(0) + ',' + p.y.toFixed(0) + ') está dentro de uma parede');
    }
  }
  A.startCmd('Z');
});
t('a face capturada é a mais próxima do cursor, não a oposta', () => {
  const w = paredeSul(), face = w.t/2;
  A.startCmd('CX');
  const p = A.snapPoint({x: 4000, y: face + 20}, null);
  if (p.y < 0) throw new Error('pulou para a face do outro lado da parede');
  A.startCmd('Z');
});
t('desenhando parede, a prioridade volta para o eixo', () => {
  const w = paredeSul();
  A.startCmd('L');
  const p = A.snapPoint({x: w.bx + 30, y: w.by + 30}, null);
  near(p.x, w.bx, 1, 'x'); near(p.y, w.by, 1, 'y');   // extremidade do eixo
  A.startCmd('Z');
});
t('canto de cômodo: interseção de duas faces vira ponto de snap', () => {
  A.startCmd('CX');
  const p = A.snapPoint({x: 100, y: 100}, null);       // perto do canto interno (75,75)
  near(p.x, 75, 1, 'x do canto'); near(p.y, 75, 1, 'y do canto');
  A.startCmd('Z');
});
t('um móvel encostado pelo snap não invade a alvenaria', () => {
  const w = paredeSul(), face = w.t/2;
  A.startCmd('CX');
  const c1 = A.snapPoint({x: 3000, y: face + 25}, null);
  const c2 = {x: 4600, y: c1.y + 800};
  A.feedPoint(c1); A.feedPoint(c2);
  const b = A.M.boxes[A.M.boxes.length - 1];
  const bordaInferior = b.y - b.d/2;
  near(bordaInferior, face, 1, 'borda do móvel encostada na face');
  if (bordaInferior < face - 1) throw new Error('o móvel entrou ' + (face - bordaInferior).toFixed(0) + ' mm na parede');
  A.M.boxes.pop();
});
t('arestas dos móveis também dão snap, para alinhar um no outro', () => {
  const b = A.M.boxes[0];
  const c = A.boxCorners(b);
  A.startCmd('CX');
  const p = A.snapPoint({x: c[0].x + 25, y: c[0].y + 25}, null);
  near(p.x, c[0].x, 1, 'x do canto do móvel'); near(p.y, c[0].y, 1, 'y do canto do móvel');
  A.startCmd('Z');
});
console.log('\nREGRESSÃO: SNAP DE FACE PERDIA O ORTO');
/* parede leste da planta: vertical em x=9000, faces em x=8925 e x=9075 */
const paredeLeste = () => A.M.walls.find(w =>
  Math.abs(w.ax - 9000) < 1 && Math.abs(w.bx - 9000) < 1 && Math.abs(w.by - w.ay) > 1000);
t('a planta tem a parede vertical de referência', () => {
  if (!paredeLeste()) throw new Error('parede leste não encontrada');
});
t('encostar na face mantendo o traço ortogonal ao ponto base', () => {
  const w = paredeLeste(), faceInterna = 9000 - w.t/2;
  A.CFG.ortho = true; A.CFG.osnap = true;
  A.startCmd('L');
  const base = {x: 3000, y: 5000};   // trecho da parede leste sem móveis por perto
  A.feedPoint(base);
  // cursor perto da face interna, mas 12 cm acima da horizontal do ponto base
  const p = A.snapPoint({x: faceInterna + 25, y: base.y + 120}, base);
  near(p.x, faceInterna, 1, 'x parou na face');
  near(p.y, base.y, 1, 'y manteve a ortogonal do ponto base');
  A.tecla({key:'Escape'});
});
t('o mesmo vale para a face externa da parede', () => {
  const w = paredeLeste(), faceExterna = 9000 + w.t/2;
  A.startCmd('L');
  const base = {x: 3000, y: 5000};   // trecho da parede leste sem móveis por perto
  A.feedPoint(base);
  const p = A.snapPoint({x: faceExterna + 20, y: base.y + 100}, base);
  near(p.x, faceExterna, 1, 'x parou na face externa');
  near(p.y, base.y, 1, 'y manteve a ortogonal');
  A.tecla({key:'Escape'});
});
t('sem ponto base ainda não há ortogonal a respeitar', () => {
  const w = paredeLeste(), faceInterna = 9000 - w.t/2;
  A.startCmd('CX');                       // sem base, e CX nem usa orto
  const p = A.snapPoint({x: faceInterna + 20, y: 5000}, null);
  near(p.x, faceInterna, 1, 'ainda gruda na face');
  A.tecla({key:'Escape'});
});
t('com Orto desligado volta a valer o ponto mais próximo da face', () => {
  const w = paredeLeste(), faceInterna = 9000 - w.t/2;
  A.CFG.ortho = false;
  A.startCmd('L');
  const base = {x: 3000, y: 5000};   // trecho da parede leste sem móveis por perto
  A.feedPoint(base);
  const p = A.snapPoint({x: faceInterna + 25, y: base.y + 900}, base);
  near(p.x, faceInterna, 1, 'x na face');
  if (Math.abs(p.y - base.y) < 100) throw new Error('travou na ortogonal com o Orto desligado');
  A.CFG.ortho = true;
  A.tecla({key:'Escape'});
});
t('extremidade continua vencendo o perpendicular', () => {
  const w = paredeLeste();
  A.startCmd('L');
  const base = {x: 3000, y: w.ay};        // base alinhada com a ponta da parede
  A.feedPoint(base);
  const p = A.snapPoint({x: w.ax + 20, y: w.ay + 20}, base);
  near(p.x, w.ax, 1, 'x do eixo/extremidade'); near(p.y, w.ay, 1, 'y da extremidade');
  A.tecla({key:'Escape'});
});

t('com osnap desligado, sobra apenas a grade', () => {
  const w = paredeSul(), face = w.t/2;
  A.CFG.osnap = false;
  A.startCmd('CX');
  const p = A.snapPoint({x: 4013, y: face + 30}, null);
  A.CFG.osnap = true; A.startCmd('Z');
  near(p.x % A.CFG.grid, 0, .01, 'x múltiplo da grade');
  near(p.y % A.CFG.grid, 0, .01, 'y múltiplo da grade');
});
t('segInter acha o cruzamento e recusa paralelas e cruzamento fora do segmento', () => {
  const h = {a:{x:0,y:0}, b:{x:100,y:0}}, v = {a:{x:50,y:-50}, b:{x:50,y:50}};
  const p = A.segInter(h, v);
  near(p.x, 50, 1e-6); near(p.y, 0, 1e-6);
  if (A.segInter(h, {a:{x:0,y:10}, b:{x:100,y:10}})) throw new Error('paralelas deveriam dar null');
  if (A.segInter(h, {a:{x:500,y:-50}, b:{x:500,y:50}})) throw new Error('cruzamento fora do segmento deveria dar null');
});

console.log('\nENTRADA DE COORDENADAS (unidade = cm)');
const base = {x: 1000, y: 2000};
t('absoluta  "300,150"', () => { const p = A.parsePoint('300,150', base); near(p.x, 3000, .01); near(p.y, 1500, .01); });
t('relativa  "@300,0"',  () => { const p = A.parsePoint('@300,0', base);  near(p.x, 4000, .01); near(p.y, 2000, .01); });
t('polar     "@400<90"', () => { const p = A.parsePoint('@400<90', base); near(p.x, 1000, .01); near(p.y, 6000, .01); });
t('polar     "@100<180"',() => { const p = A.parsePoint('@100<180', base);near(p.x, 0, .01);    near(p.y, 2000, .01); });
t('decimal com vírgula "@2,5<45" trata vírgula como eixo', () => {
  const p = A.parsePoint('@2,5<45', base); if (!p) throw new Error('não parseou');
});
t('lixo devolve null', () => { if (A.parsePoint('abc', base) !== null) throw new Error('deveria ser null'); });

console.log('\nEXPORTAÇÃO SVG');
t('SVG bem formado', () => {
  const s = A.toSVG();
  if (!s.startsWith('<svg')) throw new Error('não começa com <svg');
  if (!s.endsWith('</svg>')) throw new Error('não termina com </svg>');
  const open = (s.match(/<(?!\/)(?!\?)[a-zA-Z]/g) || []).length;
  const close = (s.match(/<\//g) || []).length + (s.match(/\/>/g) || []).length;
  eq(open, close, 'tags abertas vs fechadas');
});
t('SVG sem NaN', () => { if (/NaN/.test(A.toSVG())) throw new Error('contém NaN'); });
t('SVG contém um polígono por trecho sólido de parede, mais um por móvel', () => {
  const s = A.toSVG();
  const polys = (s.match(/<polygon/g) || []).length;
  const spans = A.M.walls.reduce((n, w) => n + A.solidSpans(w).length, 0);
  eq(polys, spans + A.M.boxes.length);
});

console.log('\nCOMANDOS');
t('todos os comandos declaram start()', () => {
  for (const [k, v] of Object.entries(A.CMDS)) if (typeof v.start !== 'function') throw new Error(k + ' sem start');
});
t('aliases essenciais registrados', () => {
  for (const k of ['L','E','M','CO','POR','JAN','DIM','DI','Z','U','RE','3D','ESP','ALT','UN','AJUDA'])
    if (!A.CMDS[k]) throw new Error('falta ' + k);
});
t('L desenha parede via dois pontos', () => {
  const n0 = A.M.walls.length;
  A.startCmd('L');
  A.feedPoint({x:0, y:0}); A.feedPoint({x:5000, y:0});
  eq(A.M.walls.length, n0 + 1, 'paredes criadas');
  const w = A.M.walls[A.M.walls.length-1];
  near(A.wallLen(w), 5000, .01, 'comprimento');
});
t('ESP altera espessura na unidade corrente', () => {
  A.startCmd('ESP', '20'); near(A.CFG.wallT, 200, .01);
  A.startCmd('ESP', '15'); near(A.CFG.wallT, 150, .01);
});
t('UN m reescala a formatação', () => {
  A.startCmd('UN', 'm'); eq(A.U.fmt(4500), '4,50');
  A.startCmd('UN', 'cm'); eq(A.U.fmt(4500), '450');
});

console.log('\nCELULAR: MARCAÇÃO E ESTILO');
t('meta viewport declara a largura do aparelho', () => {
  if (!/<meta name="viewport"[^>]*width=device-width/.test(html))
    throw new Error('sem meta viewport: a página abre em largura de desktop');
});
t('a página declara o charset', () => {
  if (!/<meta charset="utf-8">/i.test(html)) throw new Error('sem charset');
});
t('a altura usa dvh, que acompanha a barra de endereço do celular', () => {
  if (!/height:100dvh/.test(html)) throw new Error('altura ainda presa ao vh');
});
t('existe o ponto de quebra para tela estreita', () => {
  if (!/@media \(max-width:760px\)/.test(html)) throw new Error('sem consulta de mídia');
});
t('a barra de toque traz OK, Esc, desfazer e teclado', () => {
  for (const id of ['bOk','bEsc','bUndo','bTeclado'])
    if (!new RegExp('id="' + id + '"').test(html)) throw new Error('falta ' + id);
});
t('campos de texto a 16px no celular, senão o iOS dá zoom sozinho ao focar', () => {
  if (!/\.props input,\.num,\.prompt input,\.card textarea\{font-size:16px\}/.test(html))
    throw new Error('campo abaixo de 16px dentro do ponto de quebra');
});
t('os botões da coluna de ferramentas alcançam o alvo mínimo de toque', () => {
  if (!/\.toolbar button\{flex:0 0 auto;min-width:56px;min-height:48px/.test(html))
    throw new Error('alvo de toque pequeno demais');
});

console.log('\nCELULAR: GESTOS');
t('pinça de dois dedos dá zoom mantendo o desenho sob o centro dos dedos', () => {
  A.setMode('2d');
  A.view.x = 0; A.view.y = 0; A.view.z = 0.06;
  A.dedos.clear();
  A.dedos.set(1, {x:540, y:300});
  A.dedos.set(2, {x:740, y:420});
  A.iniciaPinca();
  const centro = {x:640, y:360};
  const antes = A.S2W(centro);
  // afasta os dedos ao dobro da distância, com o mesmo centro
  A.dedos.set(1, {x:440, y:240});
  A.dedos.set(2, {x:840, y:480});
  A.movePinca();
  near(A.view.z, 0.12, 1e-9, 'o zoom dobrou');
  const depois = A.S2W(centro);
  near(depois.x, antes.x, .5, 'x sob o centro');
  near(depois.y, antes.y, .5, 'y sob o centro');
  A.dedos.clear();
});
t('a pinça também arrasta: o centro dos dedos leva a vista junto', () => {
  A.view.x = 0; A.view.y = 0; A.view.z = 0.06;
  A.dedos.clear();
  A.dedos.set(1, {x:600, y:360});
  A.dedos.set(2, {x:680, y:360});
  A.iniciaPinca();
  const alvo = A.S2W({x:640, y:360});
  A.dedos.set(1, {x:500, y:260});
  A.dedos.set(2, {x:580, y:260});   // mesma distância: só deslocamento
  A.movePinca();
  near(A.view.z, 0.06, 1e-9, 'sem zoom');
  const s = A.W2S(alvo);
  near(s.x, 540, .5, 'o ponto acompanhou o centro em x');
  near(s.y, 260, .5, 'o ponto acompanhou o centro em y');
  A.dedos.clear();
});

console.log('\nCELULAR: AÇÕES SEM MOUSE');
t('agirNoPonto seleciona a parede sob o ponto, como fazia o clique direto', () => {
  A.tecla({key:'Escape'});
  A.sel.clear(); A.setSelOp(null); A.setSelBox(null); A.setSelDim(null);
  const w = paredeSul();
  A.setCur({x:4500, y:0});
  A.agirNoPonto(false);
  if (!A.sel.has(w.id)) throw new Error('a parede não foi selecionada');
  A.sel.clear(); A.syncTools();
});
t('agirNoPonto alimenta o comando em andamento em vez de selecionar', () => {
  const n0 = A.M.walls.length;
  A.startCmd('L');
  A.setCur({x:0, y:0});     A.agirNoPonto(false);
  A.setCur({x:5000, y:0});  A.agirNoPonto(false);
  eq(A.M.walls.length, n0 + 1, 'parede criada pelo toque');
  A.tecla({key:'Escape'});
});
t('o OK da barra só aparece com um comando em andamento', () => {
  A.tecla({key:'Escape'});
  A.syncBarra();
  eq(els['bOk'].hidden, true, 'sem comando');
  A.startCmd('L');
  eq(els['bOk'].hidden, false, 'com comando');
  A.tecla({key:'Escape'});
  eq(els['bOk'].hidden, true, 'depois do Esc');
});
t('a gaveta de propriedades abre sozinha quando há objeto selecionado', () => {
  A.tecla({key:'Escape'});
  A.sel.clear(); A.setSelOp(null); A.setSelBox(null); A.setSelDim(null);
  A.syncTools(); A.abreProps(false);
  A.sel.add(paredeSul().id);
  A.syncTools();
  if (els['tools'].classList.contains('fechado'))
    throw new Error('não abriu com a parede selecionada');
  eq(els['bProps'].getAttribute('aria-expanded'), 'true', 'aria');
  A.sel.clear();
  A.syncTools();
  if (!els['tools'].classList.contains('fechado'))
    throw new Error('não fechou ao limpar a seleção');
});

console.log('\nCELULAR: MODO MIRA');
/* simula um dedo: os handlers leem a posição do mapa `dedos`, não do evento */
const dedoDown = (x, y, id = 1) => { A.dedos.set(id, {x, y}); A.toqueDown({pointerId:id}); };
const dedoMove = (x, y, id = 1) => { A.dedos.set(id, {x, y}); A.toqueMove({pointerId:id}); };
const dedoUp = (id = 1) => { A.toqueUp({pointerId:id}); A.dedos.delete(id); };
/* a vista fixa deixa a conta de px→mm previsível */
const vistaFixa = () => { A.view.x = 0; A.view.y = 0; A.view.z = 0.06; };
const semSnap = fn => {
  const s = {g:A.CFG.snapGrid, o:A.CFG.osnap, r:A.CFG.ortho, t:A.CFG.track};
  A.CFG.snapGrid = A.CFG.osnap = A.CFG.ortho = A.CFG.track = false;
  try { return fn(); } finally {
    A.CFG.snapGrid = s.g; A.CFG.osnap = s.o; A.CFG.ortho = s.r; A.CFG.track = s.t;
  }
};

t('o ✓ e a marcação do ✛ acompanham o modo', () => {
  A.setMira(false);
  eq(els['bPonto'].hidden, true, 'o ✓ aparece com a mira desligada');
  eq(els['bMira'].classList.contains('on'), false, 'o ✛ marcado sem o modo');
  A.setMira(true);
  eq(els['bPonto'].hidden, false, 'o ✓ sumiu com a mira ligada');
  eq(els['bMira'].classList.contains('on'), true, 'o ✛ não ficou marcado');
});
t('a preferência do modo mira é guardada', () => {
  A.setMira(true);
  eq(sandbox.localStorage.getItem('prancheta.mira'), '1', 'ligada');
  A.setMira(false);
  eq(sandbox.localStorage.getItem('prancheta.mira'), '0', 'desligada');
});
t('o arrasto empurra a cruz de onde ela estava, sem saltar para o dedo', () => semSnap(() => {
  A.tecla({key:'Escape'});
  vistaFixa(); A.setMira(true);
  A.setCur({x:0, y:0});                 // centro da tela: 640,360
  const antes = A.W2S(A.getCur());
  dedoDown(100, 100);                   // dedo longe da cruz, de propósito
  dedoMove(160, 100);                   // 60 px de uma vez: ganho no máximo
  const depois = A.W2S(A.getCur());
  near(depois.x - antes.x, 60, 1, 'a cruz andou o que o dedo andou');
  near(depois.y - antes.y, 0, 1, 'sem deriva no eixo Y');
  if (Math.abs(depois.x - 160) < 30) throw new Error('a cruz saltou para o dedo');
  dedoUp();
}));
t('dedo devagar move menos que dedo rápido, para o mesmo caminho', () => semSnap(() => {
  vistaFixa(); A.setMira(true);
  A.setCur({x:0, y:0});
  const base = A.W2S(A.getCur()).x;
  dedoDown(100, 100); dedoMove(103, 100); dedoMove(106, 100);   // 2 passos de 3 px
  const lento = A.W2S(A.getCur()).x - base;
  dedoUp();
  A.setCur({x:0, y:0});
  dedoDown(100, 100); dedoMove(106, 100);                       // 1 passo de 6 px
  const rapido = A.W2S(A.getCur()).x - base;
  dedoUp();
  near(lento, 3, .2, 'ganho fino com dedo devagar');
  near(rapido, 6, .2, 'ganho cheio com dedo rápido');
  if (lento >= rapido) throw new Error('o ajuste fino não afinou nada');
}));
t('soltar o dedo não comete nada: quem comete é o ✓', () => {
  A.tecla({key:'Escape'});
  vistaFixa(); A.setMira(true);
  A.sel.clear(); A.setSelOp(null); A.setSelBox(null); A.setSelDim(null);
  const n0 = A.M.walls.length;
  A.startCmd('L');
  A.setCur({x:0, y:0});
  dedoDown(300, 300); dedoMove(360, 300); dedoUp();
  eq(A.getAC().pts.length, 0, 'ponto entrou sozinho ao soltar');
  dedoDown(300, 300); dedoMove(300, 360); dedoUp();
  eq(A.M.walls.length, n0, 'parede criada sem ninguém confirmar');
  A.tecla({key:'Escape'});
});
t('o ✓ comete o ponto onde a cruz parou', () => {
  A.tecla({key:'Escape'});
  vistaFixa(); A.setMira(true);
  const n0 = A.M.walls.length;
  A.startCmd('L');
  A.setCur({x:0, y:0});        els['bPonto'].onclick();
  eq(A.getAC().pts.length, 1, 'primeiro ponto não entrou pelo ✓');
  A.setCur({x:5000, y:0});     els['bPonto'].onclick();
  eq(A.M.walls.length, n0 + 1, 'a parede não foi criada pelo ✓');
  near(A.wallLen(A.M.walls[A.M.walls.length-1]), 5000, .01, 'comprimento');
  A.tecla({key:'Escape'});
  A.setMira(false);
});
t('com a mira desligada o toque volta a agir direto no ponto', () => {
  A.tecla({key:'Escape'});
  A.setMira(false);
  vistaFixa();
  const n0 = A.M.walls.length;
  A.startCmd('L');
  A.setCur({x:0, y:0});     dedoDown(640, 360); dedoUp();
  A.setCur({x:3000, y:0});  dedoDown(820, 360); dedoUp();
  eq(A.M.walls.length, n0 + 1, 'o toque direto parou de desenhar');
  A.tecla({key:'Escape'});
});
t('a mira fora da tela volta ao centro quando o modo liga', () => semSnap(() => {
  A.setMira(false);
  vistaFixa();
  A.setCur({x:900000, y:0});          // bem fora da vista
  A.setMira(true);
  const s = A.W2S(A.getCur());
  if (!(s.x > 8 && s.x < 1280-8)) throw new Error('a cruz ficou fora da tela: ' + s.x);
  A.setMira(false);
}));

console.log('\n' + pass + ' passaram, ' + fail + ' falharam\n');
process.exit(fail ? 1 : 0);
