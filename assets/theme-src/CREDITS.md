# 테마 시안 원본 (W4-05)

세 테마(버터 스튜디오·밤의 오비트·소다 가든)의 앱 아이콘 원본(SVG·PNG 512×512)과 색 팔레트(`palette.json`)다. 앱 아이콘 선택·연결은 W4-03에서 한다. 이번에는 원본만 둔다.
화면 시안 PNG·SVG, 비교 이미지, 시안 생성 스크립트는 저장소에 넣지 않았다 (`.codex-out/design-src/`에만 있다).

## 제작 기록

> Codex(OpenAI) 제작, 2026-11-17. Ddooby Block의 밝은 도자기 타일·보라색 궤도·민트색 장난감 정원 세 방향. 8×8 블록 퍼즐의 코드 기반 블록, 한국어 메뉴·게임 화면·게임 오버, 글자 없는 앱 아이콘을 SVG로 독자 제작하고 Chromium으로 PNG 렌더링. 이미지 생성 모델 미사용. 글꼴: Fredoka, Space Grotesk, Baloo 2, Gowun Dodum, SUIT — 각 SIL OFL 1.1.

(`.codex-out/design-src/README.md`의 "CREDITS용 제작 기록"을 그대로 옮겼다.)

## 글꼴

원본은 `assets/fonts-src/`, 서브셋은 `public/fonts/` (라이선스 원문 함께). 서브셋 방법은 `npm run fonts:subset`(scripts/fonts/subset.mjs).

## 앱 아이콘 (W4-03)

`assets/app-icon/`(Android 아이콘 원본)과 `public/favicon.png`.

> Codex(OpenAI) 제작, 2026-11-17. 사용자가 선택한 "밤의 오비트" SVG 시안에서 청록·연보라·분홍 블록 세 개와 타원 궤도·노란 점·보라색 반짝임을 보존하고, Android adaptive icon용 투명 전경과 짙은 보라 광원 배경으로 분리·배치했다. 정사각형 합성 아이콘과 64px favicon을 파생 제작했다. SVG 도형 직접 가공 및 Sharp/librsvg PNG 렌더링. **이미지 생성 모델 미사용.** 아이콘에 글자·폰트·외부 게임 에셋 없음.

(`.codex-out/icon-src/README.md`의 "CREDITS용 기록"을 그대로 옮겼다.)
