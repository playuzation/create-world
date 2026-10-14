// 프랙탈 노이즈 조합: fBm, 리지드, 도메인 워핑(벡터 노이즈), 컬 노이즈, 셀룰러(Worley).
import { createSimplex2D } from './simplex.js';
import { deriveSeed, hash2, mulberry32 } from './rng.js';

// 옥타브마다 회전/이동을 주어 격자 방향성과 원점 정렬을 없앤다
function octaveFrames(seed, octaves) {
  const rng = mulberry32(seed);
  const frames = [];
  for (let o = 0; o < octaves; o++) {
    const a = rng() * Math.PI * 2;
    frames.push({ c: Math.cos(a), s: Math.sin(a), ox: rng() * 4096, oy: rng() * 4096 });
  }
  return frames;
}

// 정규화된 fBm. 반환 범위는 대략 [-1, 1]이며 대부분 [-0.6, 0.6]에 분포한다.
export function createFbm(seed, { frequency, octaves = 4, lacunarity = 2, gain = 0.5 }) {
  const noise = createSimplex2D(seed);
  const frames = octaveFrames(deriveSeed(seed, 1), octaves);
  let norm = 0;
  for (let o = 0, a = 1; o < octaves; o++, a *= gain) norm += a;
  return (x, y) => {
    let sum = 0;
    let amp = 1;
    let f = frequency;
    for (let o = 0; o < octaves; o++) {
      const fr = frames[o];
      sum += amp * noise((x * fr.c - y * fr.s) * f + fr.ox, (x * fr.s + y * fr.c) * f + fr.oy);
      amp *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  };
}

// 리지드 멀티프랙탈. 반환 범위 [0, 1], 1에 가까울수록 능선.
export function createRidged(seed, { frequency, octaves = 4, lacunarity = 2, gain = 0.5 }) {
  const noise = createSimplex2D(seed);
  const frames = octaveFrames(deriveSeed(seed, 2), octaves);
  return (x, y) => {
    let sum = 0;
    let norm = 0;
    let amp = 1;
    let weight = 1;
    let f = frequency;
    for (let o = 0; o < octaves; o++) {
      const fr = frames[o];
      let v = 1 - Math.abs(noise((x * fr.c - y * fr.s) * f + fr.ox, (x * fr.s + y * fr.c) * f + fr.oy));
      v *= v * weight;
      weight = Math.min(1, v * 2);
      sum += v * amp;
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  };
}

// 도메인 워핑: 두 fBm으로 만든 벡터장만큼 좌표를 밀어 유기적인 형태를 만든다.
export function createWarp(seed, { frequency, octaves = 3, amplitude }) {
  const fx = createFbm(deriveSeed(seed, 11), { frequency, octaves });
  const fy = createFbm(deriveSeed(seed, 12), { frequency, octaves });
  return (x, y, out) => {
    out[0] = x + amplitude * fx(x, y);
    out[1] = y + amplitude * fy(x, y);
    return out;
  };
}

// 컬 노이즈: 스칼라 퍼텐셜의 회전 벡터장(발산 0). out = [vx, vy]
export function curl(field, x, y, out, eps = 1) {
  const dx = (field(x + eps, y) - field(x - eps, y)) / (2 * eps);
  const dy = (field(x, y + eps) - field(x, y - eps)) / (2 * eps);
  out[0] = dy;
  out[1] = -dx;
  return out;
}

// 셀룰러(Worley) 노이즈. out = [F1, F2, 셀 해시]
export function createCellular(seed, { frequency, jitter = 1 }) {
  return (x, y, out) => {
    const px = x * frequency;
    const py = y * frequency;
    const xi = Math.floor(px);
    const yi = Math.floor(py);
    let f1 = 9;
    let f2 = 9;
    let id = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const h = hash2(xi + dx, yi + dy, seed);
        const cx = xi + dx + 0.5 + jitter * (((h & 0xffff) / 65536) - 0.5);
        const cy = yi + dy + 0.5 + jitter * (((h >>> 16) / 65536) - 0.5);
        const d = Math.hypot(cx - px, cy - py);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = h;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    out[0] = f1;
    out[1] = f2;
    out[2] = id;
    return out;
  };
}
