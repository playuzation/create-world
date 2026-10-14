// 지도 전체의 연속 필드(기후 + 지형 디테일)를 계산한다.
// 대규모 필드는 2단 도메인 워핑으로 경계를 유기적으로 만들고,
// 분위수 균등화로 시드와 무관하게 바이옴 비율이 안정되게 한다.
import { createFbm, createRidged, createWarp } from '../noise/fractal.js';
import { createSimplex2D } from '../noise/simplex.js';
import { deriveSeed } from '../noise/rng.js';
import { mountainness } from './biomes.js';

const QUANTILES = 2048;

// 값의 순위를 [0,1]로 매핑한다. 표본 분위수 표 + 선형 보간을 쓰는 단조 변환이라
// 필드의 매끄러움은 그대로 유지된다.
function equalize(arr) {
  const step = 7;
  const sample = new Float32Array(Math.ceil(arr.length / step));
  for (let i = 0, k = 0; i < arr.length; i += step) sample[k++] = arr[i];
  sample.sort();
  const q = new Float32Array(QUANTILES + 1);
  for (let k = 0; k <= QUANTILES; k++) q[k] = sample[Math.round((k / QUANTILES) * (sample.length - 1))];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v <= q[0]) {
      arr[i] = 0;
      continue;
    }
    if (v >= q[QUANTILES]) {
      arr[i] = 1;
      continue;
    }
    let lo = 0;
    let hi = QUANTILES;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (q[mid] <= v) lo = mid;
      else hi = mid;
    }
    const span = q[hi] - q[lo];
    arr[i] = (lo + (span > 0 ? (v - q[lo]) / span : 0)) / QUANTILES;
  }
  return arr;
}

export function computeFields(seed, size) {
  const n = size * size;
  const make = () => new Float32Array(n);
  const f = {
    size,
    c: make(), // 대륙성 (바다 ↔ 내륙)
    t: make(), // 기온
    h: make(), // 습도
    e: make(), // 침식 (낮을수록 산악)
    w: make(), // 변이 (변종 바이옴 선택)
    region: make(), // 바이옴 내부 중규모 지형 구분
    peaks: make(), // 산맥 능선 (리지드)
    mount: make(), // 산악도
    elev: make(), // 산악 고도 근사
    slope: make(), // 고도 경사 (0 평지 ~ 1 급경사)
    north: make(), // 북향 사면 정도 (-1 남향 ~ 1 북향)
    riverDist: make(), // 강 중심선까지의 거리(블록)
    lake: make(), // 호수 분포
    patch: make(), // 중간 크기 군락
    fine: make(), // 작은 군락
    grain: make(), // 아주 작은 얼룩
    relief: make(), // 국지 기복 (암반 노출 등)
  };

  const sd = (salt) => deriveSeed(seed, salt);
  const warpBig = createWarp(sd(100), { frequency: 1 / 280, octaves: 2, amplitude: 42 });
  const warpEdge = createWarp(sd(101), { frequency: 1 / 42, octaves: 2, amplitude: 8 });
  const riverWarp = createWarp(sd(102), { frequency: 1 / 95, octaves: 2, amplitude: 30 });

  const contN = createFbm(sd(1), { frequency: 1 / 330, octaves: 6, gain: 0.5 });
  const tempN = createFbm(sd(2), { frequency: 1 / 430, octaves: 4 });
  const humidN = createFbm(sd(3), { frequency: 1 / 370, octaves: 4 });
  const eroN = createFbm(sd(4), { frequency: 1 / 260, octaves: 4 });
  const weirdN = createFbm(sd(5), { frequency: 1 / 170, octaves: 3 });
  const regionN = createFbm(sd(6), { frequency: 1 / 120, octaves: 3 });
  const peaksN = createRidged(sd(7), { frequency: 1 / 115, octaves: 5 });
  const riverN = createFbm(sd(8), { frequency: 1 / 250, octaves: 2 });
  const lakeN = createFbm(sd(9), { frequency: 1 / 70, octaves: 3 });
  const patchN = createFbm(sd(10), { frequency: 1 / 46, octaves: 3 });
  const fineN = createFbm(sd(11), { frequency: 1 / 13, octaves: 2 });
  const grainN = createSimplex2D(sd(12));
  const reliefN = createRidged(sd(13), { frequency: 1 / 60, octaves: 3 });

  const a = [0, 0];
  const b = [0, 0];
  const d = [0, 0];
  const r = [0, 0];
  const riverV = make();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      warpBig(x, y, a);
      warpEdge(a[0], a[1], b);
      f.c[i] = contN(b[0], b[1]);
      // 기온·습도는 큰 워핑만 적용해 급격한 기후 변화(눈 옆 정글)를 막는다
      f.t[i] = tempN(a[0], a[1]);
      f.h[i] = humidN(a[0], a[1]);
      f.e[i] = eroN(b[0], b[1]);
      f.w[i] = weirdN(b[0], b[1]);
      f.peaks[i] = peaksN(a[0], a[1]);
      f.lake[i] = lakeN(a[0], a[1]);
      f.relief[i] = reliefN(a[0], a[1]);
      // 바이옴 내부 디테일은 약한 워핑만 적용해 길게 늘어진 줄무늬를 막는다
      warpEdge(x, y, d);
      f.region[i] = regionN(d[0], d[1]);
      f.patch[i] = patchN(d[0], d[1]);
      f.fine[i] = fineN(x, y);
      f.grain[i] = grainN(x / 3.2, y / 3.2);
      riverWarp(x, y, r);
      riverV[i] = riverN(r[0], r[1]);
    }
  }

  for (const key of ['c', 't', 'h', 'e', 'w', 'region', 'peaks', 'lake', 'patch', 'fine', 'grain', 'relief']) {
    equalize(f[key]);
  }

  for (let i = 0; i < n; i++) {
    // 값 자체를 살짝 흔들어 기후 경계선에 자연스러운 굴곡을 준다
    f.t[i] = Math.min(1, Math.max(0, f.t[i] + 0.035 * (f.patch[i] - 0.5)));
    f.h[i] = Math.min(1, Math.max(0, f.h[i] + 0.04 * (f.region[i] - 0.5) + 0.02 * (f.patch[i] - 0.5)));
    const m = mountainness(f.c[i], f.e[i]);
    f.mount[i] = m;
    f.elev[i] = m * (0.45 + 0.55 * f.peaks[i]);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const xl = x > 0 ? i - 1 : i;
      const xr = x < size - 1 ? i + 1 : i;
      const yu = y > 0 ? i - size : i;
      const yd = y < size - 1 ? i + size : i;
      const dxs = xr - xl || 1;
      const dys = (yd - yu) / size || 1;

      // 강: 노이즈 0 등고선까지의 거리 ≈ |v| / |∇v|
      const gx = (riverV[xr] - riverV[xl]) / dxs;
      const gy = (riverV[yd] - riverV[yu]) / dys;
      f.riverDist[i] = Math.abs(riverV[i]) / Math.max(Math.hypot(gx, gy), 1e-4);

      // 산악 고도의 경사와 사면 방향
      const ex = (f.elev[xr] - f.elev[xl]) / dxs;
      const ey = (f.elev[yd] - f.elev[yu]) / dys;
      const g = Math.hypot(ex, ey);
      f.slope[i] = Math.min(1, Math.sqrt(g * 6));
      f.north[i] = g > 1e-5 ? ey / g : 0;
    }
  }
  return f;
}

const SAMPLE_KEYS = [
  'c', 't', 'h', 'e', 'w', 'region', 'peaks', 'mount', 'elev', 'slope', 'north',
  'riverDist', 'lake', 'patch', 'fine', 'grain', 'relief',
];

// 픽셀 (x, y)의 모든 필드 값을 샘플 객체 s에 채운다 (할당 없이 재사용)
export function readSample(f, x, y, s) {
  const i = y * f.size + x;
  s.x = x;
  s.y = y;
  s.i = i;
  for (const key of SAMPLE_KEYS) s[key] = f[key][i];
  return s;
}
