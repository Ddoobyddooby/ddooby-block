# 앱 아이콘 원본

"버터 타일" 시안(파랑·노랑·산호색 도자기 타일 세 개, `#FFF5D8` 크림 배경, -7° 기울임)을 투명 전경과 크림 배경으로 나눈 것이다 (W4-03, 2026-11-18에 오비트에서 교체). 원본은 `.codex-out/icon-src-v2/butter-tiles/`. 모두 1024×1024 PNG.

| 파일 | 쓰임 |
|---|---|
| `icon-only.png` | 옛 기기용 통짜 아이콘 (전경 1.5배 확대 + 배경 합성) |
| `icon-foreground.png` | 적응형 아이콘 앞면 (투명) |
| `icon-background.png` | 적응형 아이콘 뒷면 (크림색 단색 계열) |

웹 favicon은 `public/favicon.png` (64×64, `icon-only.png`를 줄인 것).

## 다시 만들기

1. 위 PNG를 덮어쓴다
2. `npm run icons` → `android/app/src/main/res/mipmap-*`가 다시 만들어진다 (`@capacitor/assets`)
3. `npm run android:sync` 후 `cd android && ./gradlew assembleDebug`
