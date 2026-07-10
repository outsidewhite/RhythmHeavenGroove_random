const elements = {
  streakCount: document.querySelector("#streakCount"),
  streak: document.querySelector(".streak"),
  poolLabel: document.querySelector("#poolLabel"),
  poolCount: document.querySelector("#poolCount"),
  gameStage: document.querySelector("#gameStage"),
  imageFrame: document.querySelector(".image-frame"),
  gameImage: document.querySelector("#gameImage"),
  placeholder: document.querySelector("#placeholder"),
  stageCode: document.querySelector("#stageCode"),
  gameName: document.querySelector("#gameName"),
  mainButton: document.querySelector("#mainButton"),
  stopButton: document.querySelector("#stopButton"),
  resetButton: document.querySelector("#resetButton"),
  historyList: document.querySelector("#historyList"),
  emptyHistory: document.querySelector("#emptyHistory"),
};

const STORAGE_KEY = "rhythmHeavenGrooveRenshanState";

const state = {
  games: [],
  remaining: [],
  currentGame: null,
  currentDraw: null,
  history: [],
  streak: 0,
  isSpinning: false,
  spinnerId: null,
  rouletteGame: null,
  side: "front",
  seenStages: new Set(),
  needsRunReset: false,
  gamesLoaded: false,
  assetPrefix: "./",
  mode: "ready",
};

init();

async function init() {
  bindEvents();
  showReady();

  try {
    await loadGames();
    if (!restoreSavedState()) {
      resetBag();
      updateStats();
      saveState();
    }
  } catch (error) {
    showLoadError(error);
  }
}

async function loadGames() {
  const candidates = ["./games.json", "../games.json"];

  // GitHub Pagesの公開位置がルートでもサブディレクトリでも読めるように候補を順に試す
  for (const path of candidates) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) continue;

      state.games = await response.json();
      state.assetPrefix = path.replace("games.json", "");
      state.gamesLoaded = true;
      return;
    } catch {
      // 次の候補を試すため、ここでは握りつぶす
    }
  }

  throw new Error("games.json could not be loaded");
}

function bindEvents() {
  elements.mainButton.addEventListener("click", () => {
    if (state.isSpinning) return;

    if (state.needsRunReset) {
      resetRunState();
      startRoulette();
      return;
    }

    if (state.mode === "perfect") {
      recordPerfect();
      startRoulette();
      return;
    }

    startRoulette();
  });

  elements.stopButton.addEventListener("click", stopRoulette);
  elements.resetButton.addEventListener("click", resetRun);
  elements.gameImage.addEventListener("click", toggleSide);
}

function resetRun() {
  const failedDraw = getFailedDraw();

  if (state.isSpinning) {
    stopSpinner();
  }

  if (!failedDraw) {
    resetRunState();
    showReady();
    return;
  }

  state.history.push({ ...failedDraw, status: "ng" });
  state.currentGame = null;
  state.currentDraw = null;
  state.rouletteGame = null;
  state.needsRunReset = true;
  state.mode = "ready";
  renderHistory();
  updateStats();
  elements.streak.classList.add("failed");
  showReady();
  saveState();
}

function resetRunState() {
  // 次の抽選開始時に、前回のNG表示・履歴・連数をまとめて初期化する
  state.currentGame = null;
  state.currentDraw = null;
  state.rouletteGame = null;
  state.history = [];
  state.streak = 0;
  state.seenStages = new Set();
  state.needsRunReset = false;
  state.mode = "ready";
  resetBag();
  renderHistory();
  updateStats();
  elements.streak.classList.remove("failed");
  saveState();
}

function resetBag() {
  // 一巡するまで同じゲームが出ないよう、未抽選リストをシャッフルして使い切る
  state.remaining = shuffle([...state.games]);
}

function startRoulette() {
  if (!state.gamesLoaded || state.games.length === 0) {
    showLoadError(new Error("games.json is not ready"));
    return;
  }

  if (state.side === "front" && state.remaining.length === 0) {
    resetBag();
  }

  state.isSpinning = true;
  state.mode = "spinning";
  elements.mainButton.disabled = true;
  elements.stopButton.disabled = false;
  elements.resetButton.disabled = false;
  elements.mainButton.textContent = "抽選中...";
  elements.mainButton.classList.remove("perfect");
  elements.gameStage.classList.add("spinning");
  elements.placeholder.classList.add("hidden");

  // ストップを押すまで、未抽選リスト内のゲームだけを高速に切り替える
  spinOnce();
  state.spinnerId = window.setInterval(spinOnce, 58);
}

function stopRoulette() {
  if (!state.isSpinning) return;

  stopSpinner();
  const winner = state.rouletteGame ?? getRouletteCandidates()[0];
  const isNight = state.side === "flipside" && state.seenStages.has(winner.stage);

  if (state.side === "front") {
    state.remaining = state.remaining.filter((game) => game.stage !== winner.stage);
  }

  state.currentGame = winner;
  state.currentDraw = { game: winner, isNight };
  state.rouletteGame = null;
  state.mode = "perfect";
  state.seenStages.add(winner.stage);
  displayGame(winner, isNight);
  elements.gameStage.classList.remove("spinning");
  elements.mainButton.disabled = false;
  elements.stopButton.disabled = true;
  elements.mainButton.textContent = "パーフェクト!";
  elements.mainButton.classList.add("perfect");
  updateStats();
  saveState();
}

function spinOnce() {
  const candidates = getRouletteCandidates();
  state.rouletteGame = candidates[Math.floor(Math.random() * candidates.length)];
  displayGame(state.rouletteGame);
}

function getRouletteCandidates() {
  // 表は一巡するまで重複なし、裏は毎回全ゲームを抽選対象にする
  if (state.side === "flipside") {
    return state.games;
  }

  if (state.remaining.length === 0) {
    resetBag();
  }

  return state.remaining;
}

function stopSpinner() {
  // ルーレット用のタイマーだけ止め、表示中のゲームは保持する
  if (state.spinnerId !== null) {
    window.clearInterval(state.spinnerId);
  }
  state.spinnerId = null;
  state.isSpinning = false;
  elements.stopButton.disabled = true;
}

function recordPerfect() {
  if (!state.currentDraw) return;

  state.streak += 1;
  state.history.push({ ...state.currentDraw, status: "perfect" });
  state.currentGame = null;
  state.currentDraw = null;
  renderHistory();
  updateStats();
  saveState();
}

function displayGame(game, isNight = false) {
  elements.gameImage.src = getAssetUrl(game.image_path);
  elements.gameImage.alt = game.game_name_ja;
  elements.stageCode.textContent = game.stage;
  elements.gameName.textContent = getDisplayName(game, isNight);
  elements.imageFrame.classList.remove("mode-ready");
}

function showReady() {
  const modeImage = state.side === "front" ? "Frontside.png" : "Flipside.png";
  const modeName = state.side === "front" ? "表" : "裏";

  elements.gameImage.src = getAssetUrl(`images/${modeImage}`);
  elements.gameImage.alt = `${modeName}モード`;
  elements.placeholder.classList.add("hidden");
  elements.imageFrame.classList.add("mode-ready");
  elements.stageCode.textContent = "--";
  elements.gameName.textContent = "抽選開始でスタート";
  elements.mainButton.textContent = "抽選開始";
  elements.mainButton.disabled = false;
  elements.stopButton.disabled = true;
  elements.resetButton.disabled = false;
  elements.mainButton.classList.remove("perfect");
  elements.gameStage.classList.remove("spinning");
}

function renderHistory() {
  elements.historyList.replaceChildren();
  elements.emptyHistory.hidden = state.history.length > 0;

  state.history.forEach((draw, index) => {
    const { game, isNight, status } = draw;
    const item = document.createElement("li");
    const number = document.createElement("span");
    const body = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const icon = document.createElement("img");

    number.className = "history-index";
    if (status === "ng") {
      number.classList.add("ng");
      number.textContent = "NG";
    } else {
      number.textContent = index + 1;
    }
    body.className = "history-game";
    title.textContent = getDisplayName(game, isNight);
    meta.textContent = `${game.stage} / ${game.game_name_en}`;
    icon.className = "history-icon";
    icon.src = getAssetUrl(game.image_path);
    icon.alt = "";
    icon.loading = "lazy";

    body.append(title, meta);
    item.append(number, body, icon);
    elements.historyList.append(item);
  });
}

function updateStats() {
  elements.streakCount.textContent = state.streak;
  elements.poolLabel.textContent = state.side === "front" ? "未抽選" : "抽選対象";
  elements.poolCount.textContent = state.side === "front" ? state.remaining.length : state.games.length;
}

function saveState() {
  if (!state.gamesLoaded) return;

  const payload = {
    side: state.side,
    streak: state.streak,
    remainingStages: state.remaining.map((game) => game.stage),
    seenStages: [...state.seenStages],
    needsRunReset: state.needsRunReset,
    mode: state.currentDraw ? "perfect" : "ready",
    currentDraw: serializeDraw(state.currentDraw),
    history: state.history.map(serializeDraw).filter(Boolean),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("状態の保存に失敗しました", error);
  }
}

function restoreSavedState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;

  try {
    const saved = JSON.parse(raw);
    const gamesByStage = new Map(state.games.map((game) => [game.stage, game]));
    const restoredHistory = Array.isArray(saved.history)
      ? saved.history.map((draw) => restoreDraw(draw, gamesByStage)).filter(Boolean)
      : [];
    const restoredCurrentDraw = restoreDraw(saved.currentDraw, gamesByStage);

    state.side = saved.side === "flipside" ? "flipside" : "front";
    state.streak = Number.isFinite(saved.streak) ? saved.streak : 0;
    state.history = restoredHistory;
    state.currentDraw = restoredCurrentDraw;
    state.currentGame = restoredCurrentDraw?.game ?? null;
    state.rouletteGame = null;
    state.needsRunReset = Boolean(saved.needsRunReset);
    state.mode = restoredCurrentDraw ? "perfect" : "ready";
    state.seenStages = new Set(
      Array.isArray(saved.seenStages)
        ? saved.seenStages.filter((stage) => gamesByStage.has(stage))
        : [],
    );
    state.remaining = restoreRemaining(saved.remainingStages, gamesByStage);

    if (state.remaining.length === 0 && state.side === "front" && !restoredCurrentDraw) {
      resetBag();
    }

    renderHistory();
    updateStats();
    elements.streak.classList.toggle("failed", state.needsRunReset);

    if (restoredCurrentDraw && !state.needsRunReset) {
      restorePerfectDisplay(restoredCurrentDraw);
    } else {
      showReady();
    }

    return true;
  } catch (error) {
    console.warn("保存状態の復元に失敗しました", error);
    localStorage.removeItem(STORAGE_KEY);
    return false;
  }
}

function serializeDraw(draw) {
  if (!draw?.game) return null;

  return {
    stage: draw.game.stage,
    isNight: Boolean(draw.isNight),
    status: draw.status ?? "perfect",
  };
}

function restoreDraw(draw, gamesByStage) {
  if (!draw?.stage || !gamesByStage.has(draw.stage)) return null;

  return {
    game: gamesByStage.get(draw.stage),
    isNight: Boolean(draw.isNight),
    status: draw.status ?? "perfect",
  };
}

function restoreRemaining(stages, gamesByStage) {
  if (!Array.isArray(stages)) {
    return shuffle([...state.games]);
  }

  const restored = stages
    .map((stage) => gamesByStage.get(stage))
    .filter(Boolean);

  // 保存済みの未抽選リストが壊れていた場合は、新しい一巡を作る
  return restored.length > 0 ? restored : shuffle([...state.games]);
}

function restorePerfectDisplay(draw) {
  displayGame(draw.game, draw.isNight);
  elements.gameStage.classList.remove("spinning");
  elements.mainButton.disabled = false;
  elements.stopButton.disabled = true;
  elements.resetButton.disabled = false;
  elements.mainButton.textContent = "パーフェクト!";
  elements.mainButton.classList.add("perfect");
}

function showLoadError(error) {
  console.error(error);
  elements.gameName.textContent = "games.jsonを読み込めません";
  elements.stageCode.textContent = "配置を確認してください";
  elements.mainButton.disabled = true;
  elements.stopButton.disabled = true;
}

function getAssetUrl(path) {
  return `${state.assetPrefix}${path}`;
}

function toggleSide() {
  if (state.mode !== "ready" || state.isSpinning) return;

  // 開始前の画像タップで表/裏モードを切り替える
  state.side = state.side === "front" ? "flipside" : "front";
  resetBag();
  updateStats();
  showReady();
  saveState();
}

function getDisplayName(game, isNight) {
  return isNight ? `${game.game_name_ja}(Night)` : game.game_name_ja;
}

function getFailedDraw() {
  if (state.currentDraw) {
    return state.currentDraw;
  }

  if (!state.rouletteGame) {
    return null;
  }

  // 抽選中にやりなおした場合は、その瞬間に表示されていたゲームをNG対象にする
  return {
    game: state.rouletteGame,
    isNight: state.side === "flipside" && state.seenStages.has(state.rouletteGame.stage),
  };
}

function shuffle(items) {
  // Fisher-Yatesで偏りを抑えて抽選順を作る
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
