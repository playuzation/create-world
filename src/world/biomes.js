// 바이옴 레지스트리와 기후 → 바이옴 분류.
// 모든 기후값(c,t,h,e,w,region)은 지도 전체 기준으로 균등화된 [0,1] 값이다.
import { clamp, smoothstep } from '../noise/curves.js';

// [key, 이름, 바이옴 보기 색, 종류]
const DEFS = [
  ['frozen_ocean', '얼어붙은 바다', '#9fb8d8', 'ocean'],
  ['cold_ocean', '차가운 바다', '#2d4f8a', 'ocean'],
  ['ocean', '바다', '#1f4c9a', 'ocean'],
  ['lukewarm_ocean', '미지근한 바다', '#1e66a8', 'ocean'],
  ['warm_ocean', '따뜻한 바다', '#1f8fb5', 'ocean'],
  ['river', '강', '#3f7de0', 'river'],
  ['frozen_river', '얼어붙은 강', '#a5c4ee', 'river'],
  ['beach', '해변', '#f0e2a0', 'shore'],
  ['snowy_beach', '눈 덮인 해변', '#f4f1e1', 'shore'],
  ['stony_shore', '돌 해안', '#8e8e8e', 'shore'],
  ['plains', '평원', '#8dc26a', 'land'],
  ['sunflower_plains', '해바라기 평원', '#b5cf5c', 'land'],
  ['meadow', '목초지', '#9fd38a', 'land'],
  ['forest', '숲', '#3f8f3a', 'land'],
  ['flower_forest', '꽃 숲', '#6aa64a', 'land'],
  ['birch_forest', '자작나무 숲', '#7fb35a', 'land'],
  ['dark_forest', '어두운 숲', '#2b5a26', 'land'],
  ['cherry_grove', '벚나무 숲', '#efa7c8', 'land'],
  ['taiga', '타이가', '#3c6e5a', 'land'],
  ['old_growth_taiga', '원시 타이가', '#4d5e3a', 'land'],
  ['snowy_taiga', '눈 덮인 타이가', '#5f8a87', 'land'],
  ['snowy_plains', '눈 덮인 평원', '#e8eef2', 'land'],
  ['ice_spikes', '역고드름', '#b8d4f4', 'land'],
  ['swamp', '늪', '#4c6b4a', 'land'],
  ['mangrove_swamp', '맹그로브 늪', '#3e7a50', 'land'],
  ['savanna', '사바나', '#bfb35a', 'land'],
  ['desert', '사막', '#e8d48c', 'land'],
  ['badlands', '악지', '#c26a35', 'land'],
  ['wooded_badlands', '나무가 우거진 악지', '#9a6a3a', 'land'],
  ['jungle', '정글', '#2a9a2c', 'land'],
  ['sparse_jungle', '듬성듬성한 정글', '#5aa83a', 'land'],
  ['bamboo_jungle', '대나무 정글', '#86b83a', 'land'],
  ['windswept_hills', '바람이 세찬 언덕', '#7d8f78', 'mountain'],
  ['stony_peaks', '돌 봉우리', '#9a9590', 'mountain'],
  ['snowy_slopes', '눈 덮인 비탈', '#d4dde6', 'mountain'],
  ['jagged_peaks', '뾰족한 봉우리', '#c2cbd6', 'mountain'],
];

export const BIOMES = DEFS.map(([key, name, color, kind], id) => ({ id, key, name, color, kind }));
export const BIOME = Object.freeze(Object.fromEntries(BIOMES.map((b) => [b.key.toUpperCase(), b.id])));

// 해수면/수심 기준 (대륙성 c의 분위수)
export const SEA = 0.32;
export const DEEP = 0.1;
export const SHALLOW = 0.27;

// 기온 구간 경계
export const T_FROZEN = 0.18;
export const T_COLD = 0.38;
export const T_TEMPERATE = 0.62;
export const T_WARM = 0.8;

// 내륙 산악도: 침식이 낮고 해안에서 멀수록 1
export function mountainness(c, e) {
  return smoothstep(0.27, 0.07, e) * smoothstep(SEA + 0.02, SEA + 0.14, c);
}

// 강의 반폭(블록). 하구로 갈수록 넓어지고 산에서는 좁아진다.
export function riverHalfWidth(s) {
  const estuary = smoothstep(SEA + 0.2, SEA + 0.005, s.c);
  const wet = smoothstep(0.35, 0.85, s.h);
  return clamp(1.1 + 2.6 * estuary + 0.9 * wet - 1.0 * s.mount, 0.6, 5);
}

// 해변 폭(c 단위). 구간에 따라 0이 되어 해안 절벽처럼 끊긴다.
export function beachWidth(s) {
  return 0.022 * smoothstep(0.3, 0.75, s.region);
}

function landBiome(s) {
  const { t, h, w } = s;
  const lowland = s.c < SEA + 0.1;

  if (t < T_FROZEN) {
    if (h < 0.55) return w > 0.8 ? BIOME.ICE_SPIKES : BIOME.SNOWY_PLAINS;
    return BIOME.SNOWY_TAIGA;
  }
  if (t < T_COLD) {
    if (h < 0.22) return BIOME.PLAINS;
    return w > 0.72 && h > 0.5 ? BIOME.OLD_GROWTH_TAIGA : BIOME.TAIGA;
  }
  if (t < T_TEMPERATE) {
    if (h < 0.28) return w > 0.78 ? BIOME.SUNFLOWER_PLAINS : BIOME.PLAINS;
    if (h < 0.5) {
      if (w > 0.86) return BIOME.CHERRY_GROVE;
      return w > 0.68 ? BIOME.FLOWER_FOREST : BIOME.FOREST;
    }
    if (h < 0.74) return w > 0.52 ? BIOME.BIRCH_FOREST : BIOME.FOREST;
    return lowland ? BIOME.SWAMP : BIOME.DARK_FOREST;
  }
  if (t < T_WARM) {
    if (h < 0.3) return BIOME.SAVANNA;
    if (h < 0.5) return BIOME.PLAINS;
    if (h < 0.76) return BIOME.FOREST;
    return lowland ? BIOME.SWAMP : BIOME.SPARSE_JUNGLE;
  }
  if (h < 0.36) {
    if (w > 0.62) return w > 0.86 ? BIOME.WOODED_BADLANDS : BIOME.BADLANDS;
    return BIOME.DESERT;
  }
  if (h < 0.55) return BIOME.SAVANNA;
  if (h < 0.72) return BIOME.SPARSE_JUNGLE;
  if (lowland) return BIOME.MANGROVE_SWAMP;
  return w > 0.7 ? BIOME.BAMBOO_JUNGLE : BIOME.JUNGLE;
}

// 고도가 높을수록 기온이 내려간 것으로 본 '체감 기온'
export function alpineTemperature(s) {
  return s.t - 0.6 * (s.elev - 0.45);
}

function mountainBiome(s) {
  const at = alpineTemperature(s);
  if (s.mount < 0.62) {
    if (at > T_COLD && at < T_WARM && s.h > 0.32) return s.w > 0.8 ? BIOME.CHERRY_GROVE : BIOME.MEADOW;
    return at < T_FROZEN ? BIOME.SNOWY_SLOPES : BIOME.WINDSWEPT_HILLS;
  }
  if (at < 0.24) return s.peaks > 0.5 ? BIOME.JAGGED_PEAKS : BIOME.SNOWY_SLOPES;
  if (s.elev > 0.7) return BIOME.STONY_PEAKS;
  return BIOME.WINDSWEPT_HILLS;
}

function oceanBiome(t) {
  if (t < T_FROZEN) return BIOME.FROZEN_OCEAN;
  if (t < T_COLD) return BIOME.COLD_OCEAN;
  if (t < T_TEMPERATE) return BIOME.OCEAN;
  if (t < T_WARM) return BIOME.LUKEWARM_OCEAN;
  return BIOME.WARM_OCEAN;
}

// 픽셀 하나의 샘플 → 바이옴 id
export function classifyBiome(s) {
  if (s.c < SEA) return oceanBiome(s.t);
  if (s.riverDist < riverHalfWidth(s)) return s.t < 0.16 ? BIOME.FROZEN_RIVER : BIOME.RIVER;

  const land = s.mount > 0.4 ? mountainBiome(s) : landBiome(s);
  if (s.c < SEA + beachWidth(s)) {
    if (s.mount > 0.15) return BIOME.STONY_SHORE;
    if (land === BIOME.SWAMP || land === BIOME.MANGROVE_SWAMP) return land;
    return s.t < T_FROZEN ? BIOME.SNOWY_BEACH : BIOME.BEACH;
  }
  return land;
}
