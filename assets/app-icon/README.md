# 앱 아이콘 원본

"밤의 오비트" 시안(`assets/theme-src/orbit/orbit-icon.svg`)의 세 블록·타원 궤도·노란 점·반짝임을 투명 전경과 짙은 보라 배경으로 나눈 것이다 (W4-03). 모두 1024×1024 PNG.

| 파일 | 쓰임 |
|---|---|
| `icon-only.png` | 옛 기기용 통짜 아이콘 (전경 + 배경 합성) |
| `icon-foreground.png` | 적응형 아이콘 앞면 (투명) |
| `icon-background.png` | 적응형 아이콘 뒷면 (짙은 보라 + 광원) |

웹 favicon은 `public/favicon.png` (64×64, `icon-only.png`를 줄인 것).

## 다시 만들기

1. 위 PNG를 덮어쓴다
2. `npm run icons` → `android/app/src/main/res/mipmap-*`가 다시 만들어진다 (`@capacitor/assets`)
3. `npm run android:sync` 후 `cd android && ./gradlew assembleDebug`
