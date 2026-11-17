# 글꼴 원본 (저장소에는 넣지 않음)

테마 글꼴의 서브셋(`public/fonts/*-subset.ttf`)을 **다시 만들 때만** 원본이 필요하다. 원본 TTF(약 9.3MB)는 저장소에 없고 `.gitignore`로 다시 커밋되지 않는다.
서브셋만 확인할 때(`npm run fonts:check`, `npm test`, 빌드)는 원본이 필요 없다.

## 받을 곳

받은 파일을 아래 **저장 이름**으로 이 폴더(`assets/fonts-src/`)에 둔다. 모두 SIL OFL 1.1 (원문은 `public/fonts/`). 주소는 각 저장소 `main` 브랜치의 파일이고, 2026-11-17에 받은 파일의 SHA-256이 아래와 같다 (다르면 글꼴이 갱신된 것: 서브셋이 달라질 수 있다).

| 저장 이름 | 받는 주소 | SHA-256 |
|---|---|---|
| `Fredoka.ttf` | https://raw.githubusercontent.com/google/fonts/main/ofl/fredoka/Fredoka%5Bwdth,wght%5D.ttf | `2ba02e68b152868aef9ba28e24b3648c7d457fe6f25c761f2c2c53fb61a73fc8` |
| `SpaceGrotesk.ttf` | https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf | `acad6de1fc93436f5c0f1f4137751ef04f1aea3063e7036535970ffcfbd79f72` |
| `Baloo2.ttf` | https://raw.githubusercontent.com/google/fonts/main/ofl/baloo2/Baloo2%5Bwght%5D.ttf | `d47a6852548059b1db49a1319d06d499d546c3fa2237cf9eee9c43c8abb025c2` |
| `GowunDodum.ttf` | https://raw.githubusercontent.com/google/fonts/main/ofl/gowundodum/GowunDodum-Regular.ttf | `a6e457933227483a11758fd0947bc74422a106d46f0bf057fdaa5af94a30067d` |
| `SUIT.ttf` | https://raw.githubusercontent.com/sun-typeface/SUIT/main/fonts/variable/ttf/SUIT-Variable.ttf | `12e1fea375d27869a686d7432c1e6a38154d394994f5d82ace24f36a7db68333` |

예 (저장소 루트에서):

```bash
cd assets/fonts-src
curl -L -o Fredoka.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/fredoka/Fredoka%5Bwdth,wght%5D.ttf'
curl -L -o SpaceGrotesk.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf'
curl -L -o Baloo2.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/baloo2/Baloo2%5Bwght%5D.ttf'
curl -L -o GowunDodum.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/gowundodum/GowunDodum-Regular.ttf'
curl -L -o SUIT.ttf 'https://raw.githubusercontent.com/sun-typeface/SUIT/main/fonts/variable/ttf/SUIT-Variable.ttf'
shasum -a 256 *.ttf   # 위 표와 비교
```

## 서브셋 다시 만들기

1. 위처럼 원본 5개를 둔다.
2. HarfBuzz의 `hb-subset`을 설치한다 (macOS: `brew install harfbuzz`).
3. `npm run fonts:subset` → `public/fonts/*-subset.ttf`와 `subset-chars.txt`가 갱신된다 (SUIT는 내부 이름이 `Ddooby Sans`로 바뀐다).
4. `npm run fonts:check`로 확인하고 바뀐 `public/fonts/`를 커밋한다.

앱 문구에 새 한글이 생기면(`fonts:check`가 실패하면) 이 순서를 다시 한다.
