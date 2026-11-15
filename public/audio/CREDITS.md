# 효과음 출처

모두 Kenney(www.kenney.nl)의 무료 에셋이고 라이선스는 **CC0 1.0** (Creative Commons Zero, http://creativecommons.org/publicdomain/zero/1.0/)다. 출처 표시 의무는 없지만 기록해 둔다.
`ddooby-pang`의 `public/audio/`에서 필요한 것만 복사했고, 파일 이름만 block의 쓰임에 맞게 바꿨다.

| 파일 | 원본 팩 | 원본 파일 (pang에서의 이름) | 쓰는 곳 |
|---|---|---|---|
| `place.ogg` | Interface Sounds 1.0 | `Audio/drop_002.ogg` (`swap.ogg`) | 조각을 보드에 놓음 |
| `return.ogg` | Interface Sounds 1.0 | `Audio/back_002.ogg` (`bad.ogg`) | 놓기 실패 (조각이 트레이로 돌아감) |
| `clear.ogg` | Interface Sounds 1.0 | `Audio/glass_002.ogg` (`match.ogg`) | 줄 제거 (콤보가 오를수록 재생 속도를 올려 음이 높아짐, 상한 있음) |
| `boardClear.ogg` | Interface Sounds 1.0 | `Audio/confirmation_004.ogg` (`clear.ogg`) | 보드 전체 비우기 |
| `gameOver.ogg` | Interface Sounds 1.0 | `Audio/minimize_006.ogg` (`fail.ogg`) | 게임 오버 |
| `button.ogg` | UI Audio (UI SFX Set) | `Audio/click1.ogg` (`button.ogg`) | 버튼 |

`.ogg`는 이름만 바꾸고 내용은 손대지 않았다. 볼륨과 음 높이는 `src/config.ts`의 `SOUND`에서 맞춘다.

## m4a (아이폰 Safari용)

iOS Safari는 Ogg Vorbis를 못 읽을 수 있어 같은 이름의 `.m4a`(AAC)를 같이 둔다. 게임은 `[ogg, m4a]`를 넘기고 브라우저가 재생할 수 있는 첫 번째를 쓴다 (`src/config.ts` `SOUND.formats`).
pang에서 만든 `.m4a`를 이름만 바꿔 복사했다. pang에서 처음 만든 방법 (macOS 내장 `afconvert`로 `.ogg`에서 바로 변환, 무손실 원본은 없다):

```sh
cd public/audio
for f in *.ogg; do afconvert -f m4af -d aac "$f" "${f%.ogg}.m4a"; done
```

`.ogg`를 바꾸면 이 명령으로 `.m4a`도 다시 만든다.

배경 음악은 W4-01에서 넣는다.
