// 노이즈 값을 다듬는 보간/정형 함수. 의존성 없는 최하위 모듈.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// e0 > e1 이면 감소 곡선으로 동작한다
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
