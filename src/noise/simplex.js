// 2D 심플렉스 노이즈. 256방향 단위 그래디언트로 축 정렬 아티팩트를 줄인다.
import { mulberry32 } from './rng.js';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const SCALE = 99.2; // 출력이 대략 [-1, 1] 범위가 되도록 맞춘 값

export function createSimplex2D(seed) {
  const rng = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const rot = rng() * Math.PI * 2;
  const gx = new Float64Array(256);
  const gy = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const a = rot + (i / 256) * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }

  return function simplex(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;

    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = perm[ii + perm[jj]];
      t0 *= t0;
      n += t0 * t0 * (gx[g] * x0 + gy[g] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = perm[ii + i1 + perm[jj + j1]];
      t1 *= t1;
      n += t1 * t1 * (gx[g] * x1 + gy[g] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = perm[ii + 1 + perm[jj + 1]];
      t2 *= t2;
      n += t2 * t2 * (gx[g] * x2 + gy[g] * y2);
    }
    return n * SCALE;
  };
}
