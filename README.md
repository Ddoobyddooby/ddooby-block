# ddooby-block

8×8 보드에 블록 조각을 놓아 가로·세로 줄을 지우고 점수를 쌓는 블록 퍼즐 게임입니다.

> **현재 상태: 1주차 진행 중.** 게임 규칙(core)과 화면 구역·드래그 계산까지 구현했고, 게임 화면은 W1-07에서 구현합니다. 지금 실행하면 빈 화면만 보입니다. 진행 상황은 [TASKS](docs/TASKS.md)에서 확인합니다.

## 실행

```bash
npm install
npm run dev     # http://localhost:5180
npm test
npm run build
```

명령별 설명과 확인 방법은 [개발 가이드](docs/DEVELOPMENT.md)에 있습니다.

## v0.1에서 만들 것

- 드래그 앤 드롭으로 조각 3개를 배치하는 클래식 모드
- 줄 제거, 다줄 보너스, 콤보, 게임 오버
- 로컬 최고 점수와 진행 중인 판 이어하기
- ddooby-block 전용 Supabase를 사용하는 주간 랭킹
- 웹(GitHub Pages)과 Android APK

## 문서

- [제품 명세: `docs/SPEC.md`](docs/SPEC.md) — 무엇을 왜 만드는지, 규칙과 수용 기준
- [구현 계획: `docs/PLAN.md`](docs/PLAN.md) — core 설계, ddooby-pang에서 가져올 코드, 저장·온라인 구조
- [작업 목록: `docs/TASKS.md`](docs/TASKS.md) — 주차별 태스크와 완료 기준
- [개발 가이드: `docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — VSCode에서 실행·확인하는 방법, 태스크별 확인 절차와 공부할 개념
- [작업 방식: `docs/WORKFLOW.md`](docs/WORKFLOW.md) — Orca 탭 구성, 분석 → 승인 → 구현 → 리뷰 → 반영 흐름, Codex 리뷰·이미지
- [Codex 지침: `AGENTS.md`](AGENTS.md) · [Claude 지침: `CLAUDE.md`](CLAUDE.md) — 역할별 작업 규칙과 아키텍처 제약

## 개발 방향

Phaser 3, TypeScript, Vite, Vitest를 사용하고, Supabase(3주차)와 Capacitor(4주차)는 해당 주차에 추가합니다. 게임 규칙은 Phaser에 의존하지 않는 순수 TypeScript(`src/core`)로 작성하고, 화면·입력·연출은 Phaser로 구현합니다. 서버가 같은 규칙 코드로 점수를 다시 계산해 검증하기 위해서입니다.

이 프로젝트는 ddooby-pang과 독립적으로 운영합니다. 검증된 코드와 설계 패턴만 복사해 활용하며, Supabase 프로젝트와 계정, 데이터는 공유하지 않습니다. 구현은 ddooby-pang v0.2의 3주차 작업(Supabase와 랭킹)이 끝난 뒤 시작했습니다.
