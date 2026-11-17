// 자동 생성: npm run server:shared (src/replay/server.ts). 직접 고치지 않는다
interface Pos {
    readonly r: number;
    readonly c: number;
}
/** 1차원, index = r * size + c. null = 빈 칸, 숫자 = 색 그룹(0~6, 표시용) */
interface Board {
    readonly size: number;
    readonly cells: readonly (number | null)[];
}
type PieceId = string;
/** 조각 정의 (PLAN 4.2). cells는 bounding box가 (0,0)에서 시작하는 상대 좌표, color는 색 그룹(0~6) */
interface PieceDef {
    readonly id: PieceId;
    readonly cells: readonly Pos[];
    readonly color: number;
}
interface GameState {
    readonly board: Board;
    /** 길이 3. 놓은 칸은 null. 셋 다 null이 되면 바로 새 트레이로 바뀐다 */
    readonly tray: readonly (PieceId | null)[];
    readonly rngState: number;
    readonly score: number;
    /** 0 = 콤보 없음 */
    readonly combo: number;
    /** 줄을 못 지운 배치 연속 횟수 */
    readonly missStreak: number;
    readonly over: boolean;
}
interface PlaceAction {
    readonly trayIndex: number;
    readonly row: number;
    readonly col: number;
}
/** 배치 로그 한 줄 (SPEC 8.1). t = 누적 플레이 시간 ms */
interface Placement extends PlaceAction {
    readonly t: number;
}
/**
 * `place`가 돌려주는 이벤트 (PLAN 4.7). 배열 순서가 곧 연출 순서다.
 * 좌표는 모두 보드 절대 좌표다.
 */
type GameEvent = {
    type: 'place';
    trayIndex: number;
    pieceId: PieceId;
    cells: Pos[];
    color: number;
} | {
    type: 'clear';
    rows: number[];
    cols: number[];
    cells: Pos[];
} | {
    type: 'score';
    delta: number;
    lines: number;
    combo: number;
}
/** combo 0 = 끊김 */
 | {
    type: 'combo';
    combo: number;
} | {
    type: 'boardClear';
} | {
    type: 'tray';
    tray: PieceId[];
} | {
    type: 'gameOver';
    score: number;
};
/** `place`의 결과 (PLAN 4.5). 실패는 상태를 바꾸지 않으므로 이유만 준다 */
type PlaceResult = {
    ok: true;
    state: GameState;
    events: GameEvent[];
} | {
    ok: false;
    reason: 'over' | 'emptySlot' | 'blocked';
};
export declare const RULES_VERSION = 1;
declare const GAME: {
    readonly width: 720;
    readonly height: 1280;
};
declare const BOARD: {
    readonly size: 8;
};
declare const TRAY: {
    readonly size: 3;
};
declare const GENERATOR: {
    readonly maxRerolls: 10;
};
/** 조각별 추첨 가중치 (PLAN 4.2 표). 키는 core/pieces.ts의 PIECES ID와 같아야 하고 순서도 표 순서다 */
declare const PIECE_WEIGHTS: Record<PieceId, number>;
declare const SCORE: {
    readonly perCell: 1;
    readonly lines: readonly [0, 100, 300, 600];
    readonly line4: 1000;
    readonly lineExtra: 500;
    readonly boardClear: 3000;
};
declare const COMBO: {
    readonly graceMisses: 2;
    readonly step: 0.5;
};
export declare const REPLAY: {
    readonly minIntervalMs: 200;
};
/**
 * 화면 수치 (PLAN 6.1). 규칙이 아니라서 바꿔도 RULES_VERSION과 무관하다.
 * screen은 논리 좌표(폭 GAME.width, 기준 높이 GAME.height)에서의 구역이고 view/layout.ts의 screenLayout이 읽는다.
 */
declare const VIEW: {
    /** 드래그 중인 조각의 중심을 손가락보다 몇 칸 위에 둘지 (SPEC 3.4) */
    readonly dragLiftCells: 1.5;
    /** 트레이에 놓인 조각의 크기 (보드 칸 대비) */
    readonly trayScale: 0.55;
    readonly screen: {
        /** HUD 높이 (화면 맨 위부터) */
        readonly hudH: 180;
        /** 보드 (정사각형). boardY는 기준 높이에서의 값이다 */
        readonly boardX: 40;
        readonly boardY: 200;
        readonly boardSize: 640;
        /** 트레이 높이와 화면 아래 여백. 트레이는 화면 아래에 붙는다 */
        readonly trayH: 260;
        readonly trayBottom: 40;
        /** 기준 높이보다 늘어난 만큼 중 보드를 아래로 내리는 비율 */
        readonly boardShare: 0.6;
    };
    /** Phaser가 따로 추적하는 터치 수. 드래그는 그중 처음 누른 하나만 쓴다 (PLAN 6.1) */
    readonly touchPointers: 3;
    /**
     * 색·글꼴·블록 모양 수치는 테마가 정한다 (view/theme/themes.ts). 여기에는 테마 공통 수치만 둔다.
     * 블록 텍스처 (view/blockTexture.ts). 비율은 텍스처 한 변 대비
     */
    readonly block: {
        /** 텍스처 한 변 (px). 보드 칸(80)보다 커서 줄여 그린다 */
        readonly textureSize: 96;
        /** 칸 사이 틈 (한쪽) */
        readonly gap: 0.04;
        /** 고스트 테두리 두께 */
        readonly ghostStroke: 0.07;
    };
    /** 보드 판이 칸 바깥으로 나오는 폭 (px) */
    readonly boardPad: 14;
    readonly boardRadius: 22;
    /** 연출의 시작·끝 크기 (원래 크기 대비) */
    readonly placeFromScale: 0.72;
    readonly clearToScale: 0.2;
    readonly trayInFromScale: 0.3;
    /** 그리는 순서 */
    readonly depth: {
        readonly panel: 0;
        readonly cell: 1;
        readonly block: 2;
        readonly lineHighlight: 3;
        readonly ghost: 4;
        readonly tray: 5;
        readonly drag: 10;
        readonly overlay: 20;
        /** 배경 장식은 모든 것의 아래 */
        readonly backdrop: -10;
    };
    readonly menu: {
        /** 화면 높이 대비 세로 위치: 로고 첫 줄 가운데, 버튼 가운데 */
        readonly titleY: 0.31;
        readonly buttonY: 0.56;
        readonly buttonW: 500;
        readonly buttonH: 114;
        readonly buttonTextSize: 40;
        /** 로고 위의 장식(블록 세 개 등)이 로고 첫 줄 가운데보다 얼마나 위인지 (px) */
        readonly motifDy: -190;
        /** [이어하기]는 [새 게임] 위로 이만큼 (px) 떨어진다. [새 게임]은 이어하기 유무와 상관없이 제자리다 */
        readonly buttonStep: 148;
    };
    /** HUD (view/Hud.ts). 위치는 화면 구역의 hud 안, y는 hud 위쪽 기준 (px) */
    readonly hud: {
        readonly padX: 40;
        readonly labelSize: 24;
        readonly labelY: 26;
        readonly scoreSize: 80;
        readonly scoreY: 82;
        readonly comboSize: 40;
        readonly comboY: 146;
        readonly bestSize: 30;
        readonly bestY: 146;
        /** 일시정지 버튼 반지름과 가운데 y */
        readonly buttonRadius: 40;
        readonly buttonY: 64;
    };
    /** 버튼을 눌렀을 때 말랑하게 줄었다 돌아오는 정도 */
    readonly button: {
        readonly pressScale: 0.92;
        readonly pressMs: 70;
    };
    /** 일시정지 창 (scenes/PauseScene.ts) */
    readonly pause: {
        readonly dimAlpha: 0.72;
        readonly panelW: 520;
        readonly panelRadius: 32;
        readonly panelPad: 48;
        readonly titleSize: 64;
        /** 제목 아래 간격 */
        readonly titleGap: 56;
        readonly buttonW: 400;
        readonly buttonH: 104;
        readonly buttonStep: 128;
        readonly buttonTextSize: 44;
        /** 음소거 버튼: 판 오른쪽 위, 제목과 같은 높이. 판 오른쪽 끝에서 안쪽으로 inset */
        readonly muteRadius: 36;
        readonly muteInset: 72;
    };
    /** 게임 오버 화면 (scenes/GameOverScene.ts). 일시정지 창과 같은 판 + 버튼 */
    readonly gameOver: {
        readonly dimAlpha: 0.72;
        readonly panelW: 560;
        readonly panelRadius: 32;
        readonly panelPad: 52;
        readonly titleSize: 72;
        /** 제목 아래 간격 */
        readonly titleGap: 44;
        readonly scoreLabelSize: 30;
        readonly scoreSize: 104;
        /** 점수 아래 간격 */
        readonly scoreGap: 20;
        readonly bestSize: 38;
        readonly newBestSize: 44;
        /** 랭킹 등록 결과 줄 ("랭킹에 올리는 중…", "이번 주 최고 N점" 등) */
        readonly rankingSize: 30;
        /** 최고 점수 아래(또는 최고 기록 문구 아래) 버튼까지 간격 */
        readonly textGap: 22;
        readonly buttonsGap: 40;
        readonly buttonW: 440;
        readonly buttonH: 104;
        readonly buttonStep: 128;
        readonly buttonTextSize: 44;
        /** 마지막 연출·게임 오버 소리를 보여 준 뒤 이 시간(ms) 지나서 화면이 뜬다 */
        readonly showDelayMs: 700;
        /** 화면이 뜬 뒤 이 시간(ms) 동안은 버튼이 눌리지 않는다 (마지막 배치를 놓던 손가락이 바로 누르지 않게) */
        readonly inputDelayMs: 600;
    };
    /** 새 판을 시작하기 전 서버 run을 기다리는 동안의 "준비 중…" 문구 (W3-03). 기다림이 이 시간(ms)을 넘으면 보인다 */
    readonly preparing: {
        readonly size: 40;
        readonly y: 0.86;
        readonly showAfterMs: 200;
    };
};
/**
 * 주간 랭킹 화면 (W3-04, scenes/RankingScene.ts). 좌표는 폭 720 기준 px, x는 목록 왼쪽 끝 기준. 390×844에서 게임 좌표 약 82px = 44 CSS px
 * 10자 닉네임(30px) + #0000(22px) + 6~7자리 점수가 한 줄에 들어가게 잡았고, 넘치면 닉네임·태그를 줄여 맞춘다 (RankingScene.drawRow)
 */
declare const RANKING: {
    readonly titleY: 84;
    readonly titleSize: 60;
    /** 주 기간 줄 */
    readonly weekY: 164;
    readonly weekSize: 30;
    /** 요청이 이 시간(ms)을 넘길 때만 "불러오는 중…"을 보인다 */
    readonly loadingMs: 300;
    /** 목록: top = 목록 칸 맨 위 y, bottomReserve = 목록 칸 맨 아래에서 화면 아래까지 남기는 거리(하단 줄과 버튼 자리) */
    readonly list: {
        readonly top: 210;
        readonly bottomReserve: 270;
        readonly width: 648;
        readonly rowH: 84;
        readonly rowGap: 8;
        readonly gapH: 52;
        readonly pad: 8;
    };
    readonly row: {
        readonly radius: 22;
        /** 순위는 오른쪽 정렬(이 x), 닉네임은 왼쪽 정렬(이 x), 점수는 오른쪽 정렬(이 x) */
        readonly rankRight: 80;
        readonly nameLeft: 96;
        readonly scoreRight: 632;
        readonly fontSize: 30;
        readonly tagFontSize: 22;
        readonly tagGap: 8;
        /** 닉네임·태그와 점수 사이 최소 간격 */
        readonly minGap: 14;
        readonly meStroke: 4;
    };
    /** 줄 바탕 투명도. 1~3위 순위 숫자 색과 내 줄 바탕은 테마가 정한다 */
    readonly rowAlpha: 0.9;
    readonly gapDot: {
        readonly r: 5;
        readonly spacing: 22;
    };
    /** 안내 문구 (연결 불가·오류·빈 주·불러오는 중) */
    readonly message: {
        readonly size: 36;
        readonly wrapWidth: 560;
    };
    /** 하단 고정 줄: height, bottomY = 줄 가운데에서 화면 아래까지 */
    readonly footer: {
        readonly height: 96;
        readonly bottomY: 204;
        readonly fontSize: 32;
        readonly subFontSize: 26;
        readonly textWrap: 330;
        readonly button: {
            readonly width: 230;
            readonly height: 76;
            readonly fontSize: 30;
        };
    };
    /** 아래 버튼 두 개 (터치 영역 44 CSS px 이상 = 게임 좌표 약 82) */
    readonly button: {
        readonly bottomY: 100;
        readonly width: 300;
        readonly height: 96;
        readonly fontSize: 40;
        readonly dx: 170;
    };
    /** 손가락이 이만큼(px) 넘게 움직이면 끌기(스크롤), 아니면 누르기 */
    readonly dragThreshold: 12;
};
declare const ANIM: {
    readonly place: 90;
    readonly clearPerCell: 25;
    readonly clearFade: 180;
    readonly trayIn: 200;
    readonly returnToTray: 160;
    /** 놓을 수 없는 조각이 흐려지는 시간 */
    readonly trayDim: 150;
    /** 보드 전체 비우기 빛이 켜졌다 꺼지는 시간 (이 시간만큼 입력이 잠긴다) */
    readonly boardClearGlow: 500;
};
/**
 * 연출 수치 (PLAN 6.4). 시간 ms, 색 0xRRGGBB. 규칙이 아니라서 바꿔도 RULES_VERSION과 무관하다.
 * 흔들림 단계는 `view/fx/shake.ts`의 shakeFor가 읽는다.
 */
declare const FX: {
    /** 줄 제거 파티클: 지워지는 칸마다 터진다 */
    readonly particles: {
        readonly perCell: 4;
        /** 흩어지는 거리 (px) */
        readonly distMin: 50;
        readonly distMax: 130;
        /** 아래로 처지는 정도 (px) */
        readonly gravity: 50;
        readonly lifeMin: 380;
        readonly lifeMax: 620;
        /** 조각 크기 (텍스처 한 변 대비 배율) */
        readonly scaleMin: 0.12;
        readonly scaleMax: 0.26;
        readonly texture: 24;
    };
    readonly popup: {
        /** 글자 크기 (px) */
        readonly lineSize: 88;
        readonly comboSize: 64;
        readonly boardClearSize: 104;
        readonly strokeWidth: 10;
        /** 보드 높이 대비 팝업 중심 위치 (위가 0) */
        readonly lineY: 0.42;
        readonly boardClearY: 0.2;
        /** 글자 여러 줄이 쌓일 때 줄 사이 간격 (px)과 나타나는 시차 */
        readonly stackGap: 96;
        readonly stagger: 110;
        readonly popInMs: 160;
        readonly holdMs: 520;
        readonly fadeMs: 260;
        /** 사라지면서 올라가는 거리 (px) */
        readonly riseY: 56;
        /** 처음 크기 (원래 크기 대비) */
        readonly fromScale: 0.4;
    };
    /** 흔들림 단계. 단계 = (줄 수 - 1) + (콤보 - 1). 0이면 흔들지 않고, 표보다 크면 마지막 값 (view/fx/shake.ts) */
    readonly shake: {
        readonly levels: readonly [{
            readonly duration: 120;
            readonly intensity: 0.003;
        }, {
            readonly duration: 160;
            readonly intensity: 0.005;
        }, {
            readonly duration: 200;
            readonly intensity: 0.008;
        }, {
            readonly duration: 240;
            readonly intensity: 0.011;
        }];
        readonly boardClear: {
            readonly duration: 420;
            readonly intensity: 0.014;
        };
    };
    readonly boardClear: {
        /** 보드 전체를 덮는 빛 */
        readonly glowColor: 16777215;
        readonly glowAlpha: 0.55;
    };
    /** 놓을 수 없는 트레이 조각의 투명도 */
    readonly dimAlpha: 0.35;
    /** 그리는 순서 (VIEW.depth.overlay 아래·위) */
    readonly depth: {
        readonly particle: 12;
        readonly glow: 13;
        readonly popup: 14;
    };
};
/**
 * 효과음 (PLAN 6.4). 파일은 public/audio/<file>.<형식>, 출처는 public/audio/CREDITS.md.
 * volume 0~1. 형식은 ogg 먼저, iOS Safari용 m4a 다음 (브라우저가 읽을 수 있는 첫 번째를 쓴다)
 */
declare const SOUND: {
    readonly effects: {
        readonly place: {
            readonly file: "place";
            readonly volume: 0.45;
        };
        /** 놓기 실패 (트레이로 돌아감) */
        readonly return: {
            readonly file: "return";
            readonly volume: 0.35;
        };
        readonly clear: {
            readonly file: "clear";
            readonly volume: 0.5;
        };
        readonly boardClear: {
            readonly file: "boardClear";
            readonly volume: 0.5;
        };
        readonly gameOver: {
            readonly file: "gameOver";
            readonly volume: 0.4;
        };
        readonly button: {
            readonly file: "button";
            readonly volume: 0.5;
        };
    };
    readonly formats: readonly ["ogg", "m4a"];
    /** 줄 제거 소리의 콤보별 재생 속도(음 높이). index = 콤보 - 1, 마지막 값이 상한 */
    readonly clearRateByCombo: readonly [1, 1.12, 1.26, 1.33, 1.5];
    /** 같은 소리를 이 시간(ms) 안에 다시 부르면 건너뛴다 */
    readonly minGapMs: 60;
};
/**
 * 저장 (PLAN 6.2). 키는 block 전용이다 (ddooby-pang 키를 읽지 않는다).
 * maxRunPlacements: 저장하는 배치 로그 길이 한도. 넘으면 parseRun이 null이고, 플레이 중 닿으면 그 판은 계속하되 저장을 멈춘다.
 * maxRunJsonChars: run JSON 문자열 길이 한도. JSON.parse 전에 거른다 (배치 하나 약 40~60자 × 한도 + snapshot).
 * bootTimeoutMs: 저장소 읽기가 이만큼 늦으면 기다리지 않고 메뉴로 간다.
 */
declare const SAVE: {
    readonly key: "ddooby-block-save";
    readonly runKey: "ddooby-block-run";
    readonly maxRunPlacements: 20000;
    readonly maxRunJsonChars: 2000000;
    readonly bootTimeoutMs: 3000;
};
/** 빈 보드 */
declare function createBoard(size: number): Board;
/** 조각 칸을 기준점만큼 옮긴 좌표 */
declare function cellsAt(piece: PieceDef, anchor: Pos): Pos[];
/** 모든 칸이 보드 안의 정수 좌표이고 빈 칸이면 true */
export declare function canPlace(board: Board, piece: PieceDef, anchor: Pos): boolean;
/** 모든 기준점 전수 검사 (SPEC 9.1). 보드가 작아서 최적화하지 않는다 */
declare function canPlaceAnywhere(board: Board, piece: PieceDef): boolean;
/** 지정한 칸에 색을 넣은 새 보드. 보드 밖 좌표와 정수가 아닌 좌표는 무시한다 (cells 길이를 지킨다) */
declare function fillCells(board: Board, cells: readonly Pos[], color: number): Board;
/** 꽉 찬 가로·세로 줄 번호 (오름차순) */
declare function fullLines(board: Board): {
    rows: number[];
    cols: number[];
};
/**
 * 줄을 지운 새 보드와 지운 칸 목록. 교차 칸은 한 번만 들어간다.
 * `cleared` 순서 = 가로 줄 먼저(위→아래, 왼→오), 그다음 세로 줄에서 아직 안 나온 칸(왼→오, 위→아래).
 * `rows`, `cols`는 `fullLines`의 결과(오름차순)를 그대로 넘긴다.
 */
declare function clearLines(board: Board, rows: readonly number[], cols: readonly number[]): {
    board: Board;
    cleared: Pos[];
};
/** 새 판. 첫 트레이도 generateTray로 만든다 (빈 보드라 보정이 일어나지 않는다) */
export declare function createGame(seed: number): GameState;
/** 남은 조각 중 어떤 것도 놓을 수 없으면 true (SPEC 3.6). 모르는 ID는 놓을 수 없는 조각으로 본다 */
declare function isGameOver(board: Board, tray: readonly (PieceId | null)[]): boolean;
/** 조각 하나를 놓는다. 실패하면 상태를 바꾸지 않고 이유만 돌려준다 */
export declare function place(state: GameState, action: PlaceAction): PlaceResult;
/** 고스트·줄 하이라이트용 미리보기. 상태를 바꾸지 않는다. `place`가 실패할 조건이면 null */
declare function previewPlacement(state: GameState, action: PlaceAction): {
    cells: Pos[];
    rows: number[];
    cols: number[];
} | null;
type RngState = number;
/** seed(정수)로 초기 상태를 만든다 */
export declare function createRng(seed: number): RngState;
/** [0, 1) 실수 */
declare function next(state: RngState): [value: number, state: RngState];
/** [0, n) 정수 */
export declare function nextInt(state: RngState, n: number): [value: number, state: RngState];
/**
 * 가중치 추첨. `nextInt(rng, 합계)`를 정확히 한 번 부르고, 나온 정수가 들어가는 누적합 구간의 index를 돌려준다.
 * 구간은 `[앞 누적합, 누적합)`이라 가중치 0인 항목은 뽑히지 않는다.
 * 계약: 가중치는 0 이상의 정수, 합계는 1 이상 2^32 이하. 어기면 호출한 쪽의 버그이므로
 * 추첨 전에(RNG를 쓰기 전에) 던진다.
 */
declare function weightedPick(weights: readonly number[], rng: RngState): [index: number, rng: RngState];
/**
 * 트레이 조각을 뽑는다 (PLAN 4.4). 최소 1개는 지금 보드에 놓을 수 있다.
 * 한 시도 = 가중치 추첨 `TRAY.size`번(중복 허용). 다 뽑은 뒤에 놓을 수 있는지 본다
 * (놓이는 조각이 먼저 나와도 나머지 추첨을 건너뛰지 않는다 → 시도마다 RNG 호출 수가 같다).
 * `GENERATOR.maxRerolls`번 모두 실패하면 마지막 시도의 슬롯 하나를 놓을 수 있는 조각으로 바꾼다.
 */
export declare function generateTray(board: Board, rng: RngState): [tray: PieceId[], rng: RngState];
/**
 * 29종. 모든 모양은 bounding box가 (0,0)에서 시작하고, 색 그룹은 그룹마다 고정이다 (SPEC 3.1).
 * 배열 순서는 PLAN 4.2 표 순서로 고정한다. 순서는 가중치 추첨 결과에 영향을 주므로
 * 순서를 바꾸거나 조각을 넣고 빼면 RULES_VERSION을 올린다.
 * 실행 중에 바뀌지 않도록 배열·조각·cells·칸을 모두 얼린다.
 */
declare const PIECES: readonly PieceDef[];
/** ID로 조각을 찾는다. 없는 ID면 예외 없이 undefined (저장 데이터·로그가 깨졌을 수 있다) */
export declare function getPiece(id: PieceId): PieceDef | undefined;
/** `invalid`는 리플레이 전용이다 (엔진의 PlaceResult에는 없다). 로그나 항목이 객체·배열 모양이 아닐 때 */
type ReplayResult = {
    ok: true;
    state: GameState;
} | {
    ok: false;
    index: number;
    reason: 'over' | 'emptySlot' | 'blocked' | 'invalid';
};
/**
 * `createGame(seed)`에서 시작해 배치를 차례로 적용한다.
 * 실패하면 그 배치의 index(0부터)와 이유를 돌려주고 멈춘다. `placements`가 배열이 아니면 index 0 `invalid`.
 * 항목이 객체가 아니면(`null`, 숫자, 문자열, 배열, 빈 구멍) 엔진을 부르기 전에 그 index에서 `invalid`.
 * 객체이지만 필드가 잘못된 항목(`row: null` 등)은 엔진이 `emptySlot`·`blocked`로 판정한다.
 * `Placement`의 `t`는 보지 않는다 (간격 검사는 `checkIntervals`).
 */
export declare function replay(seed: number, placements: readonly PlaceAction[]): ReplayResult;
/**
 * `t`가 늘어나고(같으면 안 됨) 이웃한 배치의 간격이 `minMs` 이상이면 true.
 * 깨진 입력은 예외 대신 false: `placements`가 배열이 아님, 항목이 객체가 아님,
 * `t`가 유한한 수가 아니거나 음수, `minMs`가 유한한 수가 아니거나 음수 (0개·1개 로그여도).
 * 첫 배치의 `t`에는 하한을 두지 않는다. 0개·1개는 간격이 없어 true (1개일 때도 `t` 값은 검사한다).
 */
export declare function checkIntervals(placements: readonly Placement[], minMs: number): boolean;
export declare const JUDGE: {
    /** 한 판의 배치 수 상한. 클라이언트 저장 한도(SAVE.maxRunPlacements)와 같다: 넘는 판은 클라이언트가 제출하지 않는다 */
    readonly maxPlacements: 20000;
    /** DB `weekly_scores.best_score`가 int(부호 있는 32비트)라서 이 점수를 넘는 판은 등록하지 않는다 (자르거나 되감지 않는다) */
    readonly maxScore: 2147483647;
    /** DB `runs.rules_version`·요청 `version`의 상한 (Postgres int) */
    readonly maxRulesVersion: 2147483647;
    /** seed는 부호 없는 32비트 */
    readonly maxSeed: 4294967295;
    /**
     * 요청 본문 상한(바이트). 정상 로그는 배치 하나가 `{"trayIndex":2,"row":7,"col":7,"t":9007199254740991}` 53바이트(쉼표 포함) 이하라
     * 20,000배치가 약 1.06MB이고 거기에 seed·version·clientScore·runId가 150바이트쯤 더해진다. 공백 여유를 두고 1.5MB로 정한다
     */
    readonly maxBodyBytes: 1500000;
};
/** 형식이 틀린 요청 (run에 아무것도 저장하지 않는다) */
export type FormatCode = 'payload-invalid' | 'version-invalid' | 'client-score-invalid' | 'placements-invalid' | 't-invalid' | 'too-large';
export interface Submission {
    readonly seed: number;
    readonly version: number;
    readonly clientScore: number;
    readonly placements: readonly Placement[];
}
export type ParseResult = {
    ok: true;
    submission: Submission;
} | {
    ok: false;
    code: FormatCode;
};
/** `version` 필드로 쓸 수 있는 값: 1 이상 Postgres int 이하의 정수 */
export declare function isRulesVersion(v: unknown): v is number;
/** run ID 모양. 이 모양이 아니면 DB에 묻지 않는다 (형식 오류가 DB 변환 오류·500이 되지 않게) */
export declare function isUuid(v: unknown): v is string;
/**
 * 요청 본문(JSON)을 제출로 바꾼다. 타입을 믿지 않고 하나씩 본다. 값은 새 객체로 복사해 돌려주므로
 * 이후 원본이 바뀌어도 해시·리플레이 입력은 그대로다.
 * 좌표 범위·슬롯이 합법인지는 여기서 보지 않는다 (엔진이 replay에서 판정한다). 모르는 필드는 버린다.
 */
export declare function parseSubmission(body: unknown): ParseResult;
/**
 * 제출 내용의 해시(sha256 hex): seed·version·clientScore와 순서를 지킨 배치 로그를 키 순서를 고정한 JSON으로 만든다.
 * parseSubmission을 통과한 값만 넣는다. 문자열은 동기로 만들고 나서 기다리므로(await) 그 사이 입력이 바뀌어도 상관없다.
 * 해시는 비밀·서명이 아니다: 같은 내용 재제출(멱등)과 다른 내용 재사용(충돌)을 가르는 데만 쓴다
 */
export declare function submissionHash(submission: Submission): Promise<string>;
/** run에 저장된 해시와 비교: 처음이면 new, 같은 내용이면 same(저장된 결과를 그대로), 다른 내용이면 conflict */
export declare function resubmitDecision(storedHash: string | null, newHash: string): 'new' | 'same' | 'conflict';
export type ReplayReason = 'over' | 'emptySlot' | 'blocked' | 'invalid';
/** 내용 거부: 시간과 무관하게 결정되고, run에 저장한다 */
export type ContentRejection = {
    ok: false;
    code: 'seed-mismatch';
} | {
    ok: false;
    code: 'gap-too-short';
} | {
    ok: false;
    code: 'replay-invalid';
    index: number;
    reason: ReplayReason;
} | {
    ok: false;
    code: 'not-over';
} | {
    ok: false;
    code: 'score-overflow';
} | {
    ok: false;
    code: 'score-mismatch';
};
export type ContentVerdict = {
    ok: true;
    score: number;
} | ContentRejection;
/**
 * 내용 판정: seed(발급한 값) → 간격 → 리플레이 → 게임 오버인지 → 점수.
 * seed는 요청이 아니라 runs 기록의 값으로 리플레이한다 (SPEC 8.1). 빈 로그·끝나지 않은 판은 `not-over`
 * (게임 오버 판만 등록한다: 점수가 맞다는 이유만으로 등록하지 않는다)
 */
export declare function verifyContent(submission: Submission, run: {
    seed: number;
}): ContentVerdict;
/**
 * 시간 판정 (저장하지 않는 거부): 마지막 `t`(누적 플레이 시간)가 발급부터 제출까지의 서버 경과보다 크면 `too-fast`.
 * 플레이 시간은 실제 경과를 넘을 수 없다 (일시정지·숨김 시간은 빠지므로 더 작다). 그 밖의 시간 제한(만료·하한)은 없다.
 * 제출 시각이 발급 시각보다 앞서면(서버 시계 이상) 클라이언트 탓이 아니므로 `clock`이고 서버 오류로 처리한다
 */
export declare function checkElapsed(lastT: number, issuedAtMs: number, submittedAtMs: number): 'ok' | 'too-fast' | 'clock';
/** run에 저장하는 확정 결과 (`runs.result`). 성공은 확정 시점의 그 주 최고 점수까지 */
export type StoredResult = {
    ok: true;
    score: number;
    best: number;
    isNewBest: boolean;
} | ContentRejection;
/** DB에서 읽은 `runs.result`를 믿지 않고 모양을 확인한다. 이상하면 null (서버 오류로 처리한다) */
export declare function readStoredResult(raw: unknown): StoredResult | null;
/** ms(Unix 시각) → '2026-W46'. ISO 주차는 그 주 목요일이 속한 해를 쓴다 (연말·연초에 해가 바뀔 수 있다) */
export declare function weekKey(ms: number): string;
