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
  mode: "ready",
};

init();

async function init() {
  const response = await fetch("./games.json");
  state.games = await response.json();
  resetBag();
  updateStats();
  bindEvents();
  showReady();
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
}

function resetBag() {
  // 一巡するまで同じゲームが出ないよう、未抽選リストをシャッフルして使い切る
  state.remaining = shuffle([...state.games]);
}

function startRoulette() {
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
}

function displayGame(game, isNight = false) {
  elements.gameImage.src = `./${game.image_path}`;
  elements.gameImage.alt = game.game_name_ja;
  elements.stageCode.textContent = game.stage;
  elements.gameName.textContent = getDisplayName(game, isNight);
  elements.imageFrame.classList.remove("mode-ready");
}

function showReady() {
  const modeImage = state.side === "front" ? "Frontside.png" : "Flipside.png";
  const modeName = state.side === "front" ? "表" : "裏";

  elements.gameImage.src = `./images/${modeImage}`;
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
    icon.src = `./${game.image_path}`;
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

function toggleSide() {
  if (state.mode !== "ready" || state.isSpinning) return;

  // 開始前の画像タップで表/裏モードを切り替える
  state.side = state.side === "front" ? "flipside" : "front";
  resetBag();
  updateStats();
  showReady();
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
