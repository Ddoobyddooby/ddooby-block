// 자동 생성: npm run server:shared (src/replay/server.ts). 직접 고치지 않는다
// @ts-self-types="./replay.d.ts"
// src/config.ts
const RULES_VERSION = 2;
const BOARD = { size: 8 };
const TRAY = { size: 3 };
const GENERATOR = { maxRerolls: 10 };
/** 조각별 추첨 가중치 (PLAN 4.2 표). 키는 core/pieces.ts의 PIECES ID와 같아야 하고 순서도 표 순서다 */
const PIECE_WEIGHTS = {
	dot: 4,
	i2h: 6,
	i2v: 6,
	i3h: 6,
	i3v: 6,
	i4h: 4,
	i4v: 4,
	i5h: 2,
	i5v: 2,
	o2: 6,
	r2x3: 3,
	r3x2: 3,
	o3: 1,
	l3a: 5,
	l3b: 5,
	l3c: 5,
	l3d: 5,
	l5a: 2,
	l5b: 2,
	l5c: 2,
	l5d: 2,
	tu: 4,
	td: 4,
	tl: 4,
	tr: 4,
	sh: 3,
	sv: 3,
	zh: 3,
	zv: 3,
	l4a: 3,
	l4b: 3,
	l4c: 3,
	l4d: 3,
	j4a: 3,
	j4b: 3,
	j4c: 3,
	j4d: 3
};
const SCORE = {
	perCell: 1,
	lines: [
		0,
		100,
		300,
		600
	],
	line4: 1e3,
	lineExtra: 500,
	boardClear: 3e3
};
const COMBO = {
	graceMisses: 2,
	step: .5
};
const REPLAY = { minIntervalMs: 200 };
/**
* 저장 (PLAN 6.2). 키는 block 전용이다 (ddooby-pang 키를 읽지 않는다).
* maxRunPlacements: 저장하는 배치 로그 길이 한도. 넘으면 parseRun이 null이고, 플레이 중 닿으면 그 판은 계속하되 저장을 멈춘다.
* maxRunJsonChars: run JSON 문자열 길이 한도. JSON.parse 전에 거른다 (배치 하나 약 40~60자 × 한도 + snapshot).
* bootTimeoutMs: 저장소 읽기가 이만큼 늦으면 기다리지 않고 메뉴로 간다.
*/
const SAVE = {
	key: "ddooby-block-save",
	runKey: "ddooby-block-run",
	maxRunPlacements: 2e4,
	maxRunJsonChars: 2e6,
	bootTimeoutMs: 3e3
};
// src/core/board.ts
/**
* 보드 안의 정수 좌표인지 본다. 정수가 아닌 좌표(소수, NaN, ±Infinity)도 보드 밖으로 본다:
* `Pos`는 number라 타입으로 막지 못하고, 소수는 `r * size + c`가 다른 정수 칸이 될 수 있다 (0.125 * 8 = 1).
*/
function inBounds(board, pos) {
	return Number.isInteger(pos.r) && Number.isInteger(pos.c) && pos.r >= 0 && pos.r < board.size && pos.c >= 0 && pos.c < board.size;
}
/** 빈 보드 */
function createBoard(size) {
	return {
		size,
		cells: new Array(size * size).fill(null)
	};
}
/** 조각 칸을 기준점만큼 옮긴 좌표 */
function cellsAt(piece, anchor) {
	return piece.cells.map((cell) => ({
		r: anchor.r + cell.r,
		c: anchor.c + cell.c
	}));
}
/** 모든 칸이 보드 안의 정수 좌표이고 빈 칸이면 true */
function canPlace(board, piece, anchor) {
	return cellsAt(piece, anchor).every((pos) => inBounds(board, pos) && board.cells[pos.r * board.size + pos.c] === null);
}
/** 모든 기준점 전수 검사 (SPEC 9.1). 보드가 작아서 최적화하지 않는다 */
function canPlaceAnywhere(board, piece) {
	for (let r = 0; r < board.size; r++) for (let c = 0; c < board.size; c++) if (canPlace(board, piece, {
		r,
		c
	})) return true;
	return false;
}
/** 지정한 칸에 색을 넣은 새 보드. 보드 밖 좌표와 정수가 아닌 좌표는 무시한다 (cells 길이를 지킨다) */
function fillCells(board, cells, color) {
	const next = board.cells.slice();
	for (const pos of cells) if (inBounds(board, pos)) next[pos.r * board.size + pos.c] = color;
	return {
		size: board.size,
		cells: next
	};
}
/** 꽉 찬 가로·세로 줄 번호 (오름차순) */
function fullLines(board) {
	const { size, cells } = board;
	const rows = [];
	const cols = [];
	for (let i = 0; i < size; i++) {
		let rowFull = true;
		let colFull = true;
		for (let j = 0; j < size; j++) {
			if (cells[i * size + j] === null) rowFull = false;
			if (cells[j * size + i] === null) colFull = false;
		}
		if (rowFull) rows.push(i);
		if (colFull) cols.push(i);
	}
	return {
		rows,
		cols
	};
}
/**
* 줄을 지운 새 보드와 지운 칸 목록. 교차 칸은 한 번만 들어간다.
* `cleared` 순서 = 가로 줄 먼저(위→아래, 왼→오), 그다음 세로 줄에서 아직 안 나온 칸(왼→오, 위→아래).
* `rows`, `cols`는 `fullLines`의 결과(오름차순)를 그대로 넘긴다.
*/
function clearLines(board, rows, cols) {
	const { size } = board;
	const next = board.cells.slice();
	const seen = /* @__PURE__ */ new Set();
	const cleared = [];
	const clearCell = (r, c) => {
		const index = r * size + c;
		if (seen.has(index)) return;
		seen.add(index);
		next[index] = null;
		cleared.push({
			r,
			c
		});
	};
	for (const r of rows) for (let c = 0; c < size; c++) clearCell(r, c);
	for (const c of cols) for (let r = 0; r < size; r++) clearCell(r, c);
	return {
		board: {
			size,
			cells: next
		},
		cleared
	};
}
// src/core/pieces.ts
/** 모양 문자열(`#` = 칸, `.` = 빈칸, 줄은 `/`)을 칸 좌표로 바꾼다. 순서는 위→아래, 왼→오 */
function parseShape(shape) {
	const cells = [];
	shape.split("/").forEach((line, r) => {
		[...line].forEach((ch, c) => {
			if (ch === "#") cells.push(Object.freeze({
				r,
				c
			}));
		});
	});
	return Object.freeze(cells);
}
function def(id, color, shape) {
	return Object.freeze({
		id,
		cells: parseShape(shape),
		color
	});
}
/**
* 37종. 모든 모양은 bounding box가 (0,0)에서 시작하고, 색 그룹은 그룹마다 고정이다 (SPEC 3.1).
* 배열 순서는 PLAN 4.2 표 순서로 고정한다. 순서는 가중치 추첨 결과에 영향을 주므로
* 순서를 바꾸거나 조각을 넣고 빼면 RULES_VERSION을 올린다.
* 실행 중에 바뀌지 않도록 배열·조각·cells·칸을 모두 얼린다.
*/
const PIECES = Object.freeze([
	def("dot", 0, "#"),
	def("i2h", 1, "##"),
	def("i2v", 1, "#/#"),
	def("i3h", 1, "###"),
	def("i3v", 1, "#/#/#"),
	def("i4h", 1, "####"),
	def("i4v", 1, "#/#/#/#"),
	def("i5h", 1, "#####"),
	def("i5v", 1, "#/#/#/#/#"),
	def("o2", 2, "##/##"),
	def("r2x3", 2, "###/###"),
	def("r3x2", 2, "##/##/##"),
	def("o3", 2, "###/###/###"),
	def("l3a", 3, "#./##"),
	def("l3b", 3, ".#/##"),
	def("l3c", 3, "##/#."),
	def("l3d", 3, "##/.#"),
	def("l5a", 4, "#../#../###"),
	def("l5b", 4, "..#/..#/###"),
	def("l5c", 4, "###/#../#.."),
	def("l5d", 4, "###/..#/..#"),
	def("tu", 5, ".#./###"),
	def("td", 5, "###/.#."),
	def("tl", 5, ".#/##/.#"),
	def("tr", 5, "#./##/#."),
	def("sh", 6, ".##/##."),
	def("sv", 6, "#./##/.#"),
	def("zh", 6, "##./.##"),
	def("zv", 6, ".#/##/#."),
	def("l4a", 3, "#./#./##"),
	def("l4b", 3, "###/#.."),
	def("l4c", 3, "##/.#/.#"),
	def("l4d", 3, "..#/###"),
	def("j4a", 3, ".#/.#/##"),
	def("j4b", 3, "#../###"),
	def("j4c", 3, "##/#./#."),
	def("j4d", 3, "###/..#")
]);
const BY_ID = new Map(PIECES.map((piece) => [piece.id, piece]));
/** ID로 조각을 찾는다. 없는 ID면 예외 없이 undefined (저장 데이터·로그가 깨졌을 수 있다) */
function getPiece(id) {
	return BY_ID.get(id);
}
// src/core/rng.ts
/** seed(정수)로 초기 상태를 만든다 */
function createRng(seed) {
	return seed | 0;
}
/** [0, 1) 실수 */
function next(state) {
	const s = state + 1831565813 | 0;
	let t = Math.imul(s ^ s >>> 15, 1 | s);
	t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
	return [((t ^ t >>> 14) >>> 0) / 4294967296, s];
}
/** [0, n) 정수 */
function nextInt(state, n) {
	const [v, s] = next(state);
	return [Math.floor(v * n), s];
}
// src/core/generator.ts
/**
* 추첨 표. 순서 = PIECES 순서 (PLAN 4.2 표).
* PIECES에 있는데 가중치가 없으면 설정 버그이므로 모듈을 읽을 때 바로 던진다 (게임 도중에 터지지 않게).
*/
const ENTRIES = PIECES.map((piece) => {
	const weight = PIECE_WEIGHTS[piece.id];
	if (weight === void 0) throw new Error(`generator: PIECE_WEIGHTS에 '${piece.id}'의 가중치가 없다`);
	return {
		piece,
		weight
	};
});
const ALL_WEIGHTS = ENTRIES.map((entry) => entry.weight);
/**
* 가중치 합계의 상한. RNG(`next`)는 32비트 값을 2^32로 나눈 실수를 내므로 `nextInt(rng, n)`이
* 낼 수 있는 서로 다른 값은 많아야 2^32개다. 합계가 이보다 크면 나오지 않는 정수가 생겨
* 가중치 비율대로 뽑지 못한다 (합계가 Infinity가 되는 경우도 여기서 걸린다).
*/
const MAX_TOTAL_WEIGHT = 2 ** 32;
/**
* 가중치 추첨. `nextInt(rng, 합계)`를 정확히 한 번 부르고, 나온 정수가 들어가는 누적합 구간의 index를 돌려준다.
* 구간은 `[앞 누적합, 누적합)`이라 가중치 0인 항목은 뽑히지 않는다.
* 계약: 가중치는 0 이상의 정수, 합계는 1 이상 2^32 이하. 어기면 호출한 쪽의 버그이므로
* 추첨 전에(RNG를 쓰기 전에) 던진다.
*/
function weightedPick(weights, rng) {
	let total = 0;
	for (const weight of weights) {
		if (!Number.isInteger(weight) || weight < 0) throw new Error(`weightedPick: 가중치는 0 이상의 정수여야 한다 (${weight})`);
		total += weight;
	}
	if (total < 1) throw new Error("weightedPick: 가중치 합계가 1 이상이어야 한다");
	if (total > MAX_TOTAL_WEIGHT) throw new Error(`weightedPick: 가중치 합계가 2^32 이하여야 한다 (${total})`);
	const [roll, nextRng] = nextInt(rng, total);
	let acc = 0;
	for (const [index, weight] of weights.entries()) {
		acc += weight;
		if (roll < acc) return [index, nextRng];
	}
	throw new Error(`weightedPick: 구간을 찾지 못했다 (roll ${roll}, 합계 ${total})`);
}
/** `entries` 안에서 가중치 추첨으로 조각 하나를 뽑는다 */
function pickPiece(entries, rng) {
	const [index, nextRng] = weightedPick(entries === ENTRIES ? ALL_WEIGHTS : entries.map((entry) => entry.weight), rng);
	const entry = entries[index];
	if (entry === void 0) throw new Error(`generator: 추첨 index ${index}가 범위 밖이다`);
	return [entry.piece, nextRng];
}
/**
* 트레이 조각을 뽑는다 (PLAN 4.4). 최소 1개는 지금 보드에 놓을 수 있다.
* 한 시도 = 가중치 추첨 `TRAY.size`번(중복 허용). 다 뽑은 뒤에 놓을 수 있는지 본다
* (놓이는 조각이 먼저 나와도 나머지 추첨을 건너뛰지 않는다 → 시도마다 RNG 호출 수가 같다).
* `GENERATOR.maxRerolls`번 모두 실패하면 마지막 시도의 슬롯 하나를 놓을 수 있는 조각으로 바꾼다.
*/
function generateTray(board, rng) {
	let state = rng;
	let tray = [];
	for (let attempt = 0; attempt < GENERATOR.maxRerolls; attempt++) {
		const drawn = [];
		for (let i = 0; i < TRAY.size; i++) {
			const [piece, nextRng] = pickPiece(ENTRIES, state);
			state = nextRng;
			drawn.push(piece);
		}
		tray = drawn.map((piece) => piece.id);
		if (drawn.some((piece) => canPlaceAnywhere(board, piece))) return [tray, state];
	}
	const placeable = ENTRIES.filter((entry) => canPlaceAnywhere(board, entry.piece));
	if (placeable.length === 0) throw new Error("generateTray: 놓을 수 있는 조각이 없다 (보드가 꽉 찼다)");
	const [slot, afterSlot] = nextInt(state, TRAY.size);
	const [piece, afterPiece] = pickPiece(placeable, afterSlot);
	tray[slot] = piece.id;
	return [tray, afterPiece];
}
// src/core/scoring.ts
/** 지운 줄 수(가로 + 세로)에 대한 기본 점수. 4줄 이상은 line4에서 한 줄마다 lineExtra를 더한다 */
function lineScore(lines) {
	if (lines <= 0) return 0;
	if (lines < SCORE.lines.length) return SCORE.lines[lines] ?? 0;
	return SCORE.line4 + (lines - SCORE.lines.length) * SCORE.lineExtra;
}
/** 콤보 배율. combo ≥ 1일 때 쓴다 (1 → 1, 2 → 1.5, …) */
function comboMultiplier(combo) {
	return 1 + COMBO.step * (combo - 1);
}
/**
* 배치 뒤의 콤보. 줄을 지우면 combo + 1, missStreak 0.
* 못 지우면 missStreak + 1이고, 그 값이 graceMisses를 넘으면 combo 0, missStreak 0 (그래서 missStreak는 늘 graceMisses 이하다)
*/
function nextCombo(prev, cleared) {
	if (cleared) return {
		combo: prev.combo + 1,
		missStreak: 0
	};
	const missStreak = prev.missStreak + 1;
	if (missStreak > COMBO.graceMisses) return {
		combo: 0,
		missStreak: 0
	};
	return {
		combo: prev.combo,
		missStreak
	};
}
/** 배치 하나의 점수 (정수). 보드 전체 비움 보너스에는 배율이 없다 */
function placementScore({ cells, lines, combo, boardCleared }) {
	const lineBonus = lines > 0 ? Math.floor(lineScore(lines) * comboMultiplier(combo)) : 0;
	return cells * SCORE.perCell + lineBonus + (boardCleared ? SCORE.boardClear : 0);
}
// src/core/engine.ts
/**
* 배치 검사. 순서: over → 슬롯 → 위치 (PLAN 4.5의 1단계).
* 범위 밖·정수가 아닌 trayIndex, 빈 슬롯, 모르는 조각 ID(깨진 저장 데이터)는 모두 `emptySlot`이다.
* 정수가 아닌 좌표(소수, NaN, 숫자가 아닌 값)는 `blocked`이다.
*/
function check(state, action) {
	if (state.over) return {
		ok: false,
		reason: "over"
	};
	const { trayIndex } = action;
	if (!Number.isInteger(trayIndex) || trayIndex < 0 || trayIndex >= state.tray.length) return {
		ok: false,
		reason: "emptySlot"
	};
	const id = state.tray[trayIndex];
	const piece = id === null || id === void 0 ? void 0 : getPiece(id);
	if (piece === void 0) return {
		ok: false,
		reason: "emptySlot"
	};
	if (!Number.isInteger(action.row) || !Number.isInteger(action.col)) return {
		ok: false,
		reason: "blocked"
	};
	const anchor = {
		r: action.row,
		c: action.col
	};
	if (!canPlace(state.board, piece, anchor)) return {
		ok: false,
		reason: "blocked"
	};
	return {
		ok: true,
		piece,
		cells: cellsAt(piece, anchor)
	};
}
/** 새 판. 첫 트레이도 generateTray로 만든다 (빈 보드라 보정이 일어나지 않는다) */
function createGame(seed) {
	const board = createBoard(BOARD.size);
	const [tray, rngState] = generateTray(board, createRng(seed));
	return {
		board,
		tray,
		rngState,
		score: 0,
		combo: 0,
		missStreak: 0,
		over: false
	};
}
/** 남은 조각 중 어떤 것도 놓을 수 없으면 true (SPEC 3.6). 모르는 ID는 놓을 수 없는 조각으로 본다 */
function isGameOver(board, tray) {
	return !tray.some((id) => {
		if (id === null) return false;
		const piece = getPiece(id);
		return piece !== void 0 && canPlaceAnywhere(board, piece);
	});
}
/** 조각 하나를 놓는다. 실패하면 상태를 바꾸지 않고 이유만 돌려준다 */
function place(state, action) {
	const checked = check(state, action);
	if (!checked.ok) return checked;
	const { piece, cells } = checked;
	const events = [];
	let board = fillCells(state.board, cells, piece.color);
	events.push({
		type: "place",
		trayIndex: action.trayIndex,
		pieceId: piece.id,
		cells,
		color: piece.color
	});
	const { rows, cols } = fullLines(board);
	const clearedAny = rows.length + cols.length > 0;
	if (clearedAny) {
		const result = clearLines(board, rows, cols);
		board = result.board;
		events.push({
			type: "clear",
			rows,
			cols,
			cells: result.cleared
		});
	}
	const lines = rows.length + cols.length;
	const boardCleared = clearedAny && board.cells.every((cell) => cell === null);
	const { combo, missStreak } = nextCombo(state, clearedAny);
	const delta = placementScore({
		cells: cells.length,
		lines,
		combo,
		boardCleared
	});
	const score = state.score + delta;
	events.push({
		type: "score",
		delta,
		lines,
		combo
	});
	if (combo !== state.combo) events.push({
		type: "combo",
		combo
	});
	if (boardCleared) events.push({ type: "boardClear" });
	let tray = state.tray.map((id, i) => i === action.trayIndex ? null : id);
	let rngState = state.rngState;
	if (tray.every((id) => id === null)) {
		const [nextTray, nextRng] = generateTray(board, rngState);
		tray = [...nextTray];
		rngState = nextRng;
		events.push({
			type: "tray",
			tray: [...nextTray]
		});
	}
	const over = isGameOver(board, tray);
	if (over) events.push({
		type: "gameOver",
		score
	});
	return {
		ok: true,
		state: {
			board,
			tray,
			rngState,
			score,
			combo,
			missStreak,
			over
		},
		events
	};
}
// src/core/replay.ts
/** 배열이 아닌 객체 (null, 숫자, 문자열, 배열, 배열의 빈 구멍 undefined는 아니다) */
function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* `createGame(seed)`에서 시작해 배치를 차례로 적용한다.
* 실패하면 그 배치의 index(0부터)와 이유를 돌려주고 멈춘다. `placements`가 배열이 아니면 index 0 `invalid`.
* 항목이 객체가 아니면(`null`, 숫자, 문자열, 배열, 빈 구멍) 엔진을 부르기 전에 그 index에서 `invalid`.
* 객체이지만 필드가 잘못된 항목(`row: null` 등)은 엔진이 `emptySlot`·`blocked`로 판정한다.
* `Placement`의 `t`는 보지 않는다 (간격 검사는 `checkIntervals`).
*/
function replay(seed, placements) {
	if (!Array.isArray(placements)) return {
		ok: false,
		index: 0,
		reason: "invalid"
	};
	let state = createGame(seed);
	for (const [index, action] of placements.entries()) {
		if (!isPlainObject(action)) return {
			ok: false,
			index,
			reason: "invalid"
		};
		const result = place(state, action);
		if (!result.ok) return {
			ok: false,
			index,
			reason: result.reason
		};
		state = result.state;
	}
	return {
		ok: true,
		state
	};
}
/**
* `t`가 늘어나고(같으면 안 됨) 이웃한 배치의 간격이 `minMs` 이상이면 true.
* 깨진 입력은 예외 대신 false: `placements`가 배열이 아님, 항목이 객체가 아님,
* `t`가 유한한 수가 아니거나 음수, `minMs`가 유한한 수가 아니거나 음수 (0개·1개 로그여도).
* 첫 배치의 `t`에는 하한을 두지 않는다. 0개·1개는 간격이 없어 true (1개일 때도 `t` 값은 검사한다).
*/
function checkIntervals(placements, minMs) {
	if (!Array.isArray(placements)) return false;
	if (typeof minMs !== "number" || !Number.isFinite(minMs) || minMs < 0) return false;
	let prev = null;
	for (const item of placements) {
		if (!isPlainObject(item)) return false;
		const { t } = item;
		if (typeof t !== "number" || !Number.isFinite(t) || t < 0) return false;
		if (prev !== null && !(t > prev && t - prev >= minMs)) return false;
		prev = t;
	}
	return true;
}
// src/replay/judge.ts
const JUDGE = {
	/** 한 판의 배치 수 상한. 클라이언트 저장 한도(SAVE.maxRunPlacements)와 같다: 넘는 판은 클라이언트가 제출하지 않는다 */
	maxPlacements: SAVE.maxRunPlacements,
	/** DB `weekly_scores.best_score`가 int(부호 있는 32비트)라서 이 점수를 넘는 판은 등록하지 않는다 (자르거나 되감지 않는다) */
	maxScore: 2147483647,
	/** DB `runs.rules_version`·요청 `version`의 상한 (Postgres int) */
	maxRulesVersion: 2147483647,
	/** seed는 부호 없는 32비트 */
	maxSeed: 4294967295,
	/**
	* 요청 본문 상한(바이트). 정상 로그는 배치 하나가 `{"trayIndex":2,"row":7,"col":7,"t":9007199254740991}` 53바이트(쉼표 포함) 이하라
	* 20,000배치가 약 1.06MB이고 거기에 seed·version·clientScore·runId가 150바이트쯤 더해진다. 공백 여유를 두고 1.5MB로 정한다
	*/
	maxBodyBytes: 15e5
};
const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
/** 안전한 정수 (NaN·Infinity·소수·2^53 이상은 아니다) */
const isSafeInt = (v) => typeof v === "number" && Number.isSafeInteger(v);
/** `version` 필드로 쓸 수 있는 값: 1 이상 Postgres int 이하의 정수 */
function isRulesVersion(v) {
	return isSafeInt(v) && v >= 1 && v <= JUDGE.maxRulesVersion;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** run ID 모양. 이 모양이 아니면 DB에 묻지 않는다 (형식 오류가 DB 변환 오류·500이 되지 않게) */
function isUuid(v) {
	return typeof v === "string" && UUID.test(v);
}
/**
* 요청 본문(JSON)을 제출로 바꾼다. 타입을 믿지 않고 하나씩 본다. 값은 새 객체로 복사해 돌려주므로
* 이후 원본이 바뀌어도 해시·리플레이 입력은 그대로다.
* 좌표 범위·슬롯이 합법인지는 여기서 보지 않는다 (엔진이 replay에서 판정한다). 모르는 필드는 버린다.
*/
function parseSubmission(body) {
	if (!isRecord(body)) return {
		ok: false,
		code: "payload-invalid"
	};
	const { seed, version, clientScore, placements } = body;
	if (!isRulesVersion(version)) return {
		ok: false,
		code: "version-invalid"
	};
	if (!isSafeInt(seed) || seed < 0 || seed > JUDGE.maxSeed) return {
		ok: false,
		code: "payload-invalid"
	};
	if (!isSafeInt(clientScore) || clientScore < 0) return {
		ok: false,
		code: "client-score-invalid"
	};
	if (!Array.isArray(placements)) return {
		ok: false,
		code: "placements-invalid"
	};
	if (placements.length > JUDGE.maxPlacements) return {
		ok: false,
		code: "too-large"
	};
	const log = [];
	for (const item of placements) {
		if (!isRecord(item)) return {
			ok: false,
			code: "placements-invalid"
		};
		if (!isSafeInt(item.t) || item.t < 0) return {
			ok: false,
			code: "t-invalid"
		};
		if (!isSafeInt(item.trayIndex) || !isSafeInt(item.row) || !isSafeInt(item.col)) return {
			ok: false,
			code: "placements-invalid"
		};
		log.push({
			trayIndex: item.trayIndex + 0,
			row: item.row + 0,
			col: item.col + 0,
			t: item.t + 0
		});
	}
	return {
		ok: true,
		submission: {
			seed,
			version,
			clientScore,
			placements: log
		}
	};
}
/**
* 제출 내용의 해시(sha256 hex): seed·version·clientScore와 순서를 지킨 배치 로그를 키 순서를 고정한 JSON으로 만든다.
* parseSubmission을 통과한 값만 넣는다. 문자열은 동기로 만들고 나서 기다리므로(await) 그 사이 입력이 바뀌어도 상관없다.
* 해시는 비밀·서명이 아니다: 같은 내용 재제출(멱등)과 다른 내용 재사용(충돌)을 가르는 데만 쓴다
*/
async function submissionHash(submission) {
	const canonical = JSON.stringify({
		seed: submission.seed,
		version: submission.version,
		clientScore: submission.clientScore,
		placements: submission.placements.map((p) => ({
			trayIndex: p.trayIndex,
			row: p.row,
			col: p.col,
			t: p.t
		}))
	});
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
/** run에 저장된 해시와 비교: 처음이면 new, 같은 내용이면 same(저장된 결과를 그대로), 다른 내용이면 conflict */
function resubmitDecision(storedHash, newHash) {
	if (storedHash === null) return "new";
	return storedHash === newHash ? "same" : "conflict";
}
/**
* 내용 판정: seed(발급한 값) → 간격 → 리플레이 → 게임 오버인지 → 점수.
* seed는 요청이 아니라 runs 기록의 값으로 리플레이한다 (SPEC 8.1). 빈 로그·끝나지 않은 판은 `not-over`
* (게임 오버 판만 등록한다: 점수가 맞다는 이유만으로 등록하지 않는다)
*/
function verifyContent(submission, run) {
	if (submission.seed !== run.seed) return {
		ok: false,
		code: "seed-mismatch"
	};
	if (!checkIntervals(submission.placements, REPLAY.minIntervalMs)) return {
		ok: false,
		code: "gap-too-short"
	};
	const result = replay(run.seed, submission.placements);
	if (!result.ok) return {
		ok: false,
		code: "replay-invalid",
		index: result.index,
		reason: result.reason
	};
	if (!result.state.over) return {
		ok: false,
		code: "not-over"
	};
	const score = result.state.score;
	if (score > JUDGE.maxScore) return {
		ok: false,
		code: "score-overflow"
	};
	if (score !== submission.clientScore) return {
		ok: false,
		code: "score-mismatch"
	};
	return {
		ok: true,
		score
	};
}
/**
* 시간 판정 (저장하지 않는 거부): 마지막 `t`(누적 플레이 시간)가 발급부터 제출까지의 서버 경과보다 크면 `too-fast`.
* 플레이 시간은 실제 경과를 넘을 수 없다 (일시정지·숨김 시간은 빠지므로 더 작다). 그 밖의 시간 제한(만료·하한)은 없다.
* 제출 시각이 발급 시각보다 앞서면(서버 시계 이상) 클라이언트 탓이 아니므로 `clock`이고 서버 오류로 처리한다
*/
function checkElapsed(lastT, issuedAtMs, submittedAtMs) {
	const elapsed = submittedAtMs - issuedAtMs;
	if (!Number.isFinite(elapsed) || elapsed < 0) return "clock";
	return lastT > elapsed ? "too-fast" : "ok";
}
const REJECT_CODES = [
	"seed-mismatch",
	"gap-too-short",
	"replay-invalid",
	"not-over",
	"score-overflow",
	"score-mismatch"
];
const REPLAY_REASONS = [
	"over",
	"emptySlot",
	"blocked",
	"invalid"
];
/** DB에서 읽은 `runs.result`를 믿지 않고 모양을 확인한다. 이상하면 null (서버 오류로 처리한다) */
function readStoredResult(raw) {
	if (!isRecord(raw)) return null;
	if (raw.ok === true) {
		const { score, best, isNewBest } = raw;
		if (!isSafeInt(score) || score < 0 || !isSafeInt(best) || best < 0) return null;
		if (typeof isNewBest !== "boolean") return null;
		return {
			ok: true,
			score,
			best,
			isNewBest
		};
	}
	if (raw.ok !== false || typeof raw.code !== "string" || !REJECT_CODES.includes(raw.code)) return null;
	if (raw.code === "replay-invalid") {
		if (!isSafeInt(raw.index) || raw.index < 0) return null;
		if (typeof raw.reason !== "string" || !REPLAY_REASONS.includes(raw.reason)) return null;
		return {
			ok: false,
			code: "replay-invalid",
			index: raw.index,
			reason: raw.reason
		};
	}
	return {
		ok: false,
		code: raw.code
	};
}
// src/replay/weekKey.ts
const KST_OFFSET_MS = 324e5;
const DAY_MS = 864e5;
/** ms(Unix 시각) → '2026-W46'. ISO 주차는 그 주 목요일이 속한 해를 쓴다 (연말·연초에 해가 바뀔 수 있다) */
function weekKey(ms) {
	const kst = new Date(ms + KST_OFFSET_MS);
	const day = kst.getUTCDay() || 7;
	const thursday = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 4 - day);
	const year = new Date(thursday).getUTCFullYear();
	const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
	return `${year}-W${String(week).padStart(2, "0")}`;
}
export { JUDGE, REPLAY, RULES_VERSION, canPlace, checkElapsed, checkIntervals, createGame, createRng, generateTray, getPiece, isRulesVersion, isUuid, nextInt, parseSubmission, place, readStoredResult, replay, resubmitDecision, submissionHash, verifyContent, weekKey };
