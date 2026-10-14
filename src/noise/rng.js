// 시드/해시 유틸리티. 의존성 없는 최하위(leaf) 모듈.

// 문자열 시드를 32비트 정수로 변환 (FNV-1a)
export function hashString(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 정수 좌표 해시 → uint32 (murmur3 finalizer 기반)
export function hash2(x, y, seed) {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// 정수 좌표 해시 → [0, 1)
export function rand2(x, y, seed) {
  return hash2(x, y, seed) / 4294967296;
}

// 시드에서 채널별 독립 시드를 파생
export function deriveSeed(seed, salt) {
  return hash2(salt, 0x5bd1e995, seed);
}

// 시드 기반 순차 난수 생성기
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
