# create-world

여러 노이즈와 벡터 노이즈(도메인 워핑·컬 노이즈)로 512 × 512 블록 지도를 만들고,
위에서 내려다본 격자에 바이옴을 픽셀 단위로 그리는 생성기입니다. 색 하나가 블록 하나를 뜻합니다.

**바로 사용하기:** https://playuzation.github.io/create-world/

- 시드를 입력하거나 🎲로 무작위 시드를 고른 뒤 **생성**
- **블록 / 바이옴** 보기 전환, 범례 항목을 누르면 해당 블록·바이옴 분포만 강조
- 마우스 휠·버튼으로 확대, 드래그로 이동, 지도 위 좌표의 블록·바이옴 확인
- 주소의 `#seed=...&view=...`로 같은 지도를 공유, **PNG**로 현재 보기 저장

## 생성 방식

1. **기후 필드**: 대륙성·기온·습도·침식·변이 fBm을 2단 도메인 워핑으로 비틀고, 분위수 균등화로 시드마다 바이옴 비율을 안정시킵니다.
2. **바이옴 분류**: 기후 구간표 + 산악도·고도(리지드 노이즈)로 36종을 고릅니다. 경계는 연속 필드의 등치선이라 매끄럽게 이어집니다.
3. **지면 규칙**: 바이옴마다 사구(컬 노이즈 바람장), 계단식 메사, 수목한계선·지층·노출 암반, 눈더미, 산호초·켈프·해빙 등 내부 지형을 다르게 표현하고, 눈·암반·건조 가장자리는 연속 기후값으로 이웃 바이옴에 스며들게 합니다.
4. **정리와 장식**: 다수결 필터로 외톨이 픽셀을 지운 뒤, 군락 마스크 안의 풀·꽃과 지터 격자 위의 나무 수관·바위를 찍습니다.

## 구조

의존성은 한 방향(트리)으로만 흐릅니다: `noise` → `world` → `render` → `main`/`worker`

```
index.html, styles.css
src/
  main.js, worker.js        UI, 생성 워커
  render/renderer.js        블록/바이옴 → RGBA
  world/                    blocks, biomes, climate, surface, cover, features, generator
  noise/                    rng, simplex, fractal, curves
```

빌드 없이 정적 파일로 동작합니다. 로컬 실행: `python3 -m http.server` 후 http://localhost:8000

## 브랜치 규칙

- `feat/*` 코드 변경, `docs/*` 텍스트 문서만 변경, `chore/*` 그 밖의 변경
- 작업 브랜치 → `dev`는 PR 후 rebase merge, `dev` → `main`은 일반 merge
- `main`에 반영되면 GitHub Actions가 GitHub Pages로 배포합니다.
