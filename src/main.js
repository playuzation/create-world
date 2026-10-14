// UI 진입점: 생성 요청, 캔버스 표시(확대/이동), 좌표 정보, 분포 범례.
import { histogram, paint } from './render/renderer.js';
import { BIOMES } from './world/biomes.js';
import { BLOCK_CATEGORIES, BLOCKS } from './world/blocks.js';
import { MAP_SIZE, generateWorld } from './world/generator.js';

const $ = (id) => document.getElementById(id);
const canvas = $('map');
const ctx = canvas.getContext('2d');
const viewport = $('viewport');
const image = ctx.createImageData(MAP_SIZE, MAP_SIZE);

const ZOOMS = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
const KIND_LABELS = { ocean: '바다', river: '강', shore: '해안', land: '육지', mountain: '산악' };

const state = { world: null, seedText: '', mode: 'blocks', zoom: 1, highlight: -1, ms: 0, counts: null };

// ---------- 생성 ----------
let jobId = 0;
let worker = createWorker();

function createWorker() {
  try {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      if (e.data.id === jobId) onWorld(e.data.world, e.data.ms);
    };
    w.onerror = () => {
      // 모듈 워커를 못 쓰는 환경이면 메인 스레드에서 생성한다
      worker = null;
      runInline(state.seedText);
    };
    return w;
  } catch {
    return null;
  }
}

function randomSeed() {
  return String(Math.floor(Math.random() * 1e9));
}

function generate(seedText) {
  state.seedText = seedText.trim() || randomSeed();
  $('seed').value = state.seedText;
  $('busy').hidden = false;
  jobId++;
  if (worker) worker.postMessage({ id: jobId, seed: state.seedText });
  else runInline(state.seedText);
  updateHash();
}

function runInline(seed) {
  const id = jobId;
  setTimeout(() => {
    const t0 = performance.now();
    const world = generateWorld(seed);
    if (id === jobId) onWorld(world, performance.now() - t0);
  }, 20);
}

function onWorld(world, ms) {
  const first = !state.world;
  state.world = world;
  state.ms = ms;
  state.highlight = -1;
  state.counts = { blocks: histogram(world.blocks), biomes: histogram(world.biomes) };
  $('busy').hidden = true;
  draw();
  renderLegend();
  renderMeta();
  if (first) fitZoom();
}

// ---------- 그리기 ----------
function sourceIds() {
  return state.mode === 'biomes' ? state.world.biomes : state.world.blocks;
}

function draw() {
  if (!state.world) return;
  const data = image.data;
  paint(state.world, state.mode, data);
  if (state.highlight >= 0) {
    const src = sourceIds();
    for (let i = 0, o = 0; i < src.length; i++, o += 4) {
      if (src[i] === state.highlight) continue;
      data[o] = data[o] * 0.18 + 12;
      data[o + 1] = data[o + 1] * 0.18 + 14;
      data[o + 2] = data[o + 2] * 0.18 + 18;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function setMode(mode) {
  state.mode = mode;
  state.highlight = -1;
  for (const b of document.querySelectorAll('.segmented button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  }
  draw();
  renderLegend();
  updateHash();
}

// ---------- 확대/이동 ----------
function setZoom(z, anchorX, anchorY) {
  const vr = viewport.getBoundingClientRect();
  const ax = anchorX ?? vr.left + vr.width / 2;
  const ay = anchorY ?? vr.top + vr.height / 2;
  const before = canvas.getBoundingClientRect();
  const mx = (ax - before.left) / state.zoom;
  const my = (ay - before.top) / state.zoom;

  state.zoom = Math.min(16, Math.max(0.25, z));
  canvas.style.width = canvas.style.height = `${MAP_SIZE * state.zoom}px`;
  const after = canvas.getBoundingClientRect();
  viewport.scrollLeft += after.left + mx * state.zoom - ax;
  viewport.scrollTop += after.top + my * state.zoom - ay;
  $('zoom-label').textContent = `${Math.round(state.zoom * 100) / 100}×`;
}

function fitZoom() {
  const z = Math.min(viewport.clientWidth - 32, viewport.clientHeight - 32) / MAP_SIZE; // padding 16px * 2
  setZoom(z >= 1 ? Math.floor(z * 2) / 2 : Math.max(0.25, z));
}

function stepZoom(dir) {
  const next = dir > 0 ? ZOOMS.find((z) => z > state.zoom + 1e-6) : [...ZOOMS].reverse().find((z) => z < state.zoom - 1e-6);
  if (next) setZoom(next);
}

viewport.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    setZoom(state.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  },
  { passive: false },
);

let drag = null;
viewport.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  drag = { x: e.clientX, y: e.clientY, sl: viewport.scrollLeft, st: viewport.scrollTop };
  viewport.classList.add('dragging');
});
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  viewport.scrollLeft = drag.sl - (e.clientX - drag.x);
  viewport.scrollTop = drag.st - (e.clientY - drag.y);
});
window.addEventListener('pointerup', () => {
  drag = null;
  viewport.classList.remove('dragging');
});

// ---------- 좌표 정보 ----------
function probe(e) {
  if (!state.world) return;
  const r = canvas.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * MAP_SIZE);
  const y = Math.floor(((e.clientY - r.top) / r.height) * MAP_SIZE);
  if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return;
  const i = y * MAP_SIZE + x;
  const block = BLOCKS[state.world.blocks[i]];
  const biome = BIOMES[state.world.biomes[i]];
  $('probe-xy').textContent = `${x}, ${y}`;
  $('probe-block').textContent = `${block.name} (${block.key})`;
  $('probe-biome').textContent = biome.name;
}
canvas.addEventListener('pointermove', probe);
canvas.addEventListener('pointerdown', probe);

// ---------- 범례 ----------
function formatPct(count) {
  const p = (count / (MAP_SIZE * MAP_SIZE)) * 100;
  return p < 0.1 ? '<0.1%' : `${p.toFixed(1)}%`;
}

function renderLegend() {
  if (!state.world) return;
  const isBlocks = state.mode === 'blocks';
  const counts = state.counts[state.mode];
  const entries = (isBlocks ? BLOCKS : BIOMES).filter((e) => counts[e.id] > 0).sort((a, b) => counts[b.id] - counts[a.id]);
  $('legend-title').textContent = isBlocks ? `블록 분포 (${entries.length}종)` : `바이옴 분포 (${entries.length}종)`;
  $('clear-highlight').hidden = state.highlight < 0;

  const items = entries.map((e) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(e.id === state.highlight));
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = e.color;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = e.name;
    const tag = document.createElement('small');
    tag.textContent = isBlocks ? BLOCK_CATEGORIES[e.category] : KIND_LABELS[e.kind];
    name.append(tag);
    const pct = document.createElement('span');
    pct.className = 'pct';
    pct.textContent = formatPct(counts[e.id]);
    btn.append(sw, name, pct);
    btn.addEventListener('click', () => {
      state.highlight = state.highlight === e.id ? -1 : e.id;
      draw();
      renderLegend();
    });
    li.append(btn);
    return li;
  });
  $('legend').replaceChildren(...items);
}

function renderMeta() {
  const biomeKinds = state.counts.biomes.filter((c) => c > 0).length;
  const blockKinds = state.counts.blocks.filter((c) => c > 0).length;
  $('meta').textContent = `시드 ${state.world.seed} · ${Math.round(state.ms)}ms · 바이옴 ${biomeKinds}종 · 블록 ${blockKinds}종`;
}

// ---------- 주소(공유 링크) ----------
function updateHash() {
  const params = new URLSearchParams({ seed: state.seedText, view: state.mode });
  history.replaceState(null, '', `#${params}`);
}

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  return { seed: params.get('seed') ?? '', view: params.get('view') === 'biomes' ? 'biomes' : 'blocks' };
}

// ---------- 이벤트 연결 ----------
$('controls').addEventListener('submit', (e) => {
  e.preventDefault();
  generate($('seed').value);
});
$('random').addEventListener('click', () => generate(randomSeed()));
for (const b of document.querySelectorAll('.segmented button')) {
  b.addEventListener('click', () => setMode(b.dataset.mode));
}
$('zoom-in').addEventListener('click', () => stepZoom(1));
$('zoom-out').addEventListener('click', () => stepZoom(-1));
$('zoom-fit').addEventListener('click', fitZoom);
$('clear-highlight').addEventListener('click', () => {
  state.highlight = -1;
  draw();
  renderLegend();
});
$('download').addEventListener('click', () => {
  if (!state.world) return;
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `world-${state.seedText}-${state.mode}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
});

const initial = readHash();
setMode(initial.view);
generate(initial.seed);
