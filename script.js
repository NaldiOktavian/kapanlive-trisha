const { Engine, Render, Runner, Bodies, Composite, Events, Body } = Matter;

/* ============================================================
   DOM REFERENCES
============================================================ */

const canvas          = document.getElementById("game");
const scoreEl         = document.getElementById("score");
const bestEl          = document.getElementById("bestScore");
const scoreCard       = document.getElementById("scoreCard");
const aimLine         = document.getElementById("aimLine");
const startScreen     = document.getElementById("startScreen");
const gameOverScreen  = document.getElementById("gameOver");
const finalScoreEl    = document.getElementById("finalScore");
const collectionCount = document.getElementById("collectionCount");
const gameWrap        = document.getElementById("gameWrap");

const startBtn      = document.getElementById("startBtn");
const restartBtn    = document.getElementById("restartBtn");
const playAgainBtn  = document.getElementById("playAgainBtn");
const previewBtn    = document.getElementById("previewBtn");
const previewModal  = document.getElementById("previewModal");
const closePreview  = document.getElementById("closePreview");

const sideCurrentImg  = document.getElementById("sideCurrentImg");
const sideCurrentName = document.getElementById("sideCurrentName");
const sideResetBtn    = document.getElementById("sideResetBtn");
const pauseBtn        = document.getElementById("pauseBtn");
const musicBtn        = document.getElementById("musicBtn");
const mergeLog        = document.getElementById("mergeLog");

const mobileCurrentImg  = document.getElementById("mobileCurrentImg");
const mobileCurrentName = document.getElementById("mobileCurrentName");
const mobilePauseBtn    = document.getElementById("mobilePauseBtn");
const mobileMusicBtn    = document.getElementById("mobileMusicBtn");
const mobileMergeLog    = document.getElementById("mobileMergeLog");

/* ============================================================
   CONSTANTS
============================================================ */

const assets = [
  "assets/img/tr1.png",
  "assets/img/tr2.png",
  "assets/img/tr3.png",
  "assets/img/tr4.png",
  "assets/img/tr5.png",
  "assets/img/tr6.png",
  "assets/img/tr7.png"
];

const levels = [
  { radius: 34,  visualHeight: 70,  score: 10  },
  { radius: 42,  visualHeight: 86,  score: 25  },
  { radius: 52,  visualHeight: 104, score: 50  },
  { radius: 64,  visualHeight: 128, score: 100 },
  { radius: 78,  visualHeight: 156, score: 180 },
  { radius: 94,  visualHeight: 188, score: 300 },
  { radius: 116, visualHeight: 220, score: 500 }
];

const MERGE_COLORS = [
  "#ff7db8", "#ffcc44", "#75c95a",
  "#5aa7ff", "#a374ff", "#b7865b", "#54b7aa"
];

const levelNames = [
  "Trisha V1", "Trisha V2", "Trisha V3", "Trisha V4",
  "Trisha V5", "Trisha V6", "Trisha V7"
];

/* ============================================================
   STATE
============================================================ */

const loadedImages = [];
const particles    = [];
const effects      = [];
const scorePopups  = [];
const mergeQueue   = [];

let engine, render, runner, world;
let gameWidth = 0, gameHeight = 0;

let score     = 0;
let bestScore = Number(localStorage.getItem("trishaBestScore") || 0);

let isPlaying     = false;
let isGameOver    = false;
let isPaused      = false;
let canDrop       = true;
let dropX         = 0;
let currentLevel  = 0;
let celebrationText = null;
let dangerStartTime = null;
let imagesReady   = false;
let shakeIntensity = 0;
let sizeScale      = 1;
let highestReached = 0;

let unlockedLevels = loadUnlockedLevels();

bestEl.textContent = bestScore;

/* ============================================================
   AUDIO SYSTEM
============================================================ */

let audioCtx   = null;
let sfxGain    = null;
let bgmPlaying = false;

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 0.30;
    sfxGain.connect(audioCtx.destination);
  } catch (e) {
    console.warn("AudioContext tidak tersedia:", e);
  }
}

function resumeAudio() {
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

function playDropSfx() {
  if (!audioCtx) return;
  resumeAudio();
  const now = audioCtx.currentTime;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
  osc.connect(gain).connect(sfxGain);
  osc.start(now);
  osc.stop(now + 0.14);
}

function playMergeSfx(level) {
  if (!audioCtx) return;
  resumeAudio();
  const now  = audioCtx.currentTime;
  const base = 440 + level * 90;
  [0, 0.065, 0.13].forEach((delay, i) => {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = i === 0 ? "triangle" : "sine";
    osc.frequency.value = base * [1, 1.25, 1.5][i];
    gain.gain.setValueAtTime(0.18, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.17);
    osc.connect(gain).connect(sfxGain);
    osc.start(now + delay);
    osc.stop(now + delay + 0.18);
  });
}

function playGameOverSfx() {
  if (!audioCtx) return;
  resumeAudio();
  const now = audioCtx.currentTime;
  [0, 0.18, 0.36].forEach((delay, i) => {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = [330, 277, 220][i];
    gain.gain.setValueAtTime(0.22, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.35);
    osc.connect(gain).connect(sfxGain);
    osc.start(now + delay);
    osc.stop(now + delay + 0.36);
  });
}

/* ——— BGM (custom MP3, loop) ——— */

const bgmAudio    = new Audio();
bgmAudio.src      = "assets/audio/fsj_piano.mp3";
bgmAudio.loop     = true;
bgmAudio.volume   = 0.15;
bgmAudio.preload  = "auto";

function startBGM() {
  if (bgmPlaying) return;
  bgmPlaying = true;
  bgmAudio.play().catch(() => {});
}

function stopBGM() {
  bgmPlaying = false;
  bgmAudio.pause();
}

/* ——— TRISHA VOICE SFX (MP3) ——— */

const sfxFiles = [
  "assets/audio/trisha1.mp3",
  "assets/audio/trisha2.mp3",
  "assets/audio/trisha3.mp3",
  "assets/audio/trisha4.mp3",
  "assets/audio/trisha5.mp3",
  "assets/audio/trisha6.mp3",
  "assets/audio/trisha7.mp3"
];

const sfxAudios = [];
let sfxReady = false;

function preloadSfx() {
  let loaded = 0;
  const total = sfxFiles.length;
  sfxFiles.forEach((src, index) => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.volume  = 0.7;
    audio.addEventListener("canplaythrough", () => {
      sfxAudios[index] = audio;
      loaded++;
      if (loaded >= total) sfxReady = true;
    }, { once: true });
    audio.addEventListener("error", () => {
      console.warn("SFX gagal dimuat:", src);
      loaded++;
      if (loaded >= total) sfxReady = true;
    }, { once: true });
    audio.src = src;
  });
}

let lastSfxTime = 0;

function playTrishaSfx(level) {
  if (!sfxReady || !sfxAudios[level]) return;
  const now = Date.now();
  if (now - lastSfxTime < 300) return;   // ← UBAH: dulu 600, sekarang 300
  lastSfxTime = now;
  const clone = sfxAudios[level].cloneNode();
  clone.volume = 0.7 + level * 0.04;
  clone.currentTime = 0;
  clone.play().catch(() => {});
}

preloadSfx();

/* ============================================================
   PERSISTENCE
============================================================ */

function loadUnlockedLevels() {
  const fallback = [true, false, false, false, false, false, false];
  try {
    const saved = JSON.parse(localStorage.getItem("trishaUnlocked"));
    if (!Array.isArray(saved)) return fallback;
    if (saved.length === 7 && typeof saved[0] === "boolean") {
      saved[0] = true;
      return saved;
    }
    const migrated = [...fallback];
    saved.forEach((lv) => {
      if (Number.isInteger(lv) && lv >= 0 && lv < 7) migrated[lv] = true;
    });
    return migrated;
  } catch {
    return fallback;
  }
}

function saveUnlockedLevels() {
  localStorage.setItem("trishaUnlocked", JSON.stringify(unlockedLevels));
}

/* ============================================================
   SAVE / RESTORE GAME STATE
============================================================ */

function saveGameState() {
  if (!isPlaying || isGameOver) {
    localStorage.removeItem("trishaGameState");
    return;
  }
  const bodies = Composite.allBodies(world).filter((b) => b.label === "trisha");
  const bodyData = bodies.map((b) => ({
    x: Math.round(b.position.x),
    y: Math.round(b.position.y),
    vx: Math.round(b.velocity.x * 100) / 100,
    vy: Math.round(b.velocity.y * 100) / 100,
    level: b.level
  }));
  const state = { score, currentLevel, highestReached, bodies: bodyData, timestamp: Date.now() };
  try { localStorage.setItem("trishaGameState", JSON.stringify(state)); } catch (e) { /* ignore */ }
}

function loadGameState() {
  try {
    const raw = localStorage.getItem("trishaGameState");
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (Date.now() - state.timestamp > 86400000) {
      localStorage.removeItem("trishaGameState");
      return null;
    }
    return state;
  } catch { return null; }
}

function restoreGame(state) {
  initAudio();
  startScreen.style.display    = "none";
  gameOverScreen.style.display = "none";

  setupGame();

  score = state.score;
  scoreEl.textContent = score;
  currentLevel   = state.currentLevel;
  highestReached = state.highestReached;

  state.bodies.forEach((bd) => {
    const body = createTrisha(bd.x, bd.y, bd.level);
    Body.setVelocity(body, { x: bd.vx, y: bd.vy });
    Composite.add(world, body);
  });

  /* ======== FIX #1: Mulai dalam keadaan paused ======== */
  Runner.stop(runner);
  isPaused   = true;
  isPlaying  = false;   // sebelumnya: true  → bikin dropTrisha nyangkut
  isGameOver = false;
  canDrop    = true;
  dangerStartTime = null;

  if (pauseBtn) pauseBtn.textContent = "Resume";
  if (mobilePauseBtn) mobilePauseBtn.textContent = "Resume";

  updateSideCurrent();
  updateMobileEvoBar();
  updateCollectionUI();
  renderPreviewGrid();
  syncDesktopPreview();
  aimLine.style.display = "block";

  localStorage.removeItem("trishaGameState");
}

/* ============================================================
   COLLECTION & UI SYNC
============================================================ */

function unlockLevel(level) {
  if (level < 0 || level >= unlockedLevels.length) return;
  if (!unlockedLevels[level]) {
    unlockedLevels[level] = true;
    saveUnlockedLevels();
  }
  if (level > highestReached) highestReached = level;
  updateCollectionUI();
  renderPreviewGrid();
  unlockDesktopPreview(level);
  updateMobileEvoBar();
}

function updateCollectionUI() {
  if (!collectionCount) return;
  collectionCount.textContent = `${unlockedLevels.filter(Boolean).length}/7`;
}

function unlockDesktopPreview(level) {
  const item = document.querySelector(`.preview-item[data-level="${level}"]`);
  if (!item) return;
  if (unlockedLevels[level]) {
    item.classList.remove("locked");
    item.classList.add("unlocked");
  }
}

function syncDesktopPreview() {
  unlockedLevels.forEach((u, i) => { if (u) unlockDesktopPreview(i); });
}

function renderPreviewGrid() {
  const grid = document.getElementById("previewGrid");
  if (!grid) return;
  grid.innerHTML = "";
  assets.forEach((src, index) => {
    const unlocked = unlockedLevels[index];
    const card = document.createElement("div");
    card.className = unlocked ? "preview-card" : "preview-card locked";
    card.innerHTML = `
      <img src="${src}" alt="Trisha V${index + 1}">
      <span>${unlocked ? "Trisha V" + (index + 1) : "???"}</span>
    `;
    grid.appendChild(card);
  });
  updateCollectionUI();
}

function updateSideCurrent() {
  if (sideCurrentImg && sideCurrentName) {
    sideCurrentImg.src = assets[currentLevel];
    sideCurrentName.textContent = levelNames[currentLevel];
  }
  if (mobileCurrentImg && mobileCurrentName) {
    mobileCurrentImg.src = assets[currentLevel];
    mobileCurrentName.textContent = `V${currentLevel + 1}`;
  }
}

function updateMergeLog(level) {
  const text = level === 6
    ? "🌻 TRISHA MATAHARIKU berhasil dibuat!"
    : `✨ Trisha V${level + 1} berhasil ditemukan`;
  if (mergeLog) mergeLog.textContent = text;
  if (mobileMergeLog) mobileMergeLog.textContent = text;
}

function animateScoreCard() {
  if (!scoreCard) return;
  scoreCard.classList.remove("score-pop");
  void scoreCard.offsetWidth;
  scoreCard.classList.add("score-pop");
}

function updateMobileEvoBar() {
  const dots = document.querySelectorAll(".evo-dot");
  dots.forEach((dot) => {
    const lv = parseInt(dot.dataset.mlevel, 10);
    dot.classList.remove("active", "reached");
    if (lv === currentLevel) dot.classList.add("active");
    if (lv <= highestReached) dot.classList.add("reached");
  });
}

/* ============================================================
   IMAGE PRELOAD
============================================================ */

function preloadImages(callback) {
  if (imagesReady) { callback(); return; }
  let loaded = 0;
  assets.forEach((src, index) => {
    const img = new Image();
    img.onload = () => {
      loadedImages[index] = img;
      loaded++;
      if (loaded === assets.length) { imagesReady = true; callback(); }
    };
    img.onerror = () => console.error("Gambar gagal dimuat:", src);
    img.src = src;
  });
}

/* ============================================================
   CANVAS SIZING
============================================================ */

function resizeCanvas() {
  const wrap = document.querySelector(".game-wrap");
  gameWidth  = wrap.clientWidth;
  gameHeight = wrap.clientHeight;

  /* ======== FIX #2: Fallback kalau dimensi 0 ======== */
  if (gameWidth < 50 || gameHeight < 50) {
    gameWidth  = 400;
    gameHeight = 600;
  }

  canvas.width  = gameWidth;
  canvas.height = gameHeight;
  sizeScale = Math.min(1, gameWidth / 570);
}

/* ============================================================
   VISUAL EFFECTS
============================================================ */

function createMergeEffect(x, y, level) {
  effects.push({ x, y, size: 20, alpha: 1, color: MERGE_COLORS[level], lineWidth: 5, delay: 0 });
  effects.push({ x, y, size: 10, alpha: 0.8, color: "#fff", lineWidth: 3, delay: 6 });
}

function drawEffects() {
  const ctx = render.context;
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    if (e.delay > 0) { e.delay--; continue; }
    e.size += 2.5;
    e.alpha -= 0.025;
    ctx.save();
    ctx.globalAlpha = Math.max(0, e.alpha);
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
    ctx.strokeStyle = e.color;
    ctx.lineWidth   = e.lineWidth;
    ctx.stroke();
    ctx.restore();
    if (e.alpha <= 0) effects.splice(i, 1);
  }
}

function createHeartBurst(x, y) {
  const emojis = ["💖", "🌻", "✨", "💛", "🌸"];
  for (let i = 0; i < 10; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 8,
      vy: -Math.random() * 6 - 1,
      alpha: 1,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      size: 18 + Math.random() * 10,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.2
    });
  }
}

function drawParticles() {
  const ctx = render.context;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12;
    p.alpha -= 0.018;
    p.rotation += p.rotSpeed;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.font = `${p.size}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.emoji, 0, 0);
    ctx.restore();
    if (p.alpha <= 0) particles.splice(i, 1);
  }
}

function createScorePopup(x, y, points) {
  scorePopups.push({ x, y, text: `+${points}`, alpha: 1, vy: -1.8, scale: 1.6 });
}

function drawScorePopups() {
  const ctx = render.context;
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    const p = scorePopups[i];
    p.y += p.vy;
    p.alpha -= 0.016;
    p.scale = Math.max(1, p.scale - 0.025);
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.font = `bold ${Math.round(22 * p.scale)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "#ef3d8c";
    ctx.lineWidth = 4;
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = "#fff";
    ctx.fillText(p.text, p.x, p.y);
    ctx.restore();
    if (p.alpha <= 0) scorePopups.splice(i, 1);
  }
}

function drawCelebration() {
  if (!celebrationText) return;
  const ctx = render.context;
  celebrationText.timer++;
  ctx.save();
  ctx.globalAlpha = celebrationText.alpha;
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "center";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#ef3d8c";
  ctx.strokeText(celebrationText.text, gameWidth / 2, gameHeight / 2);
  ctx.fillStyle = "#fff";
  ctx.fillText(celebrationText.text, gameWidth / 2, gameHeight / 2);
  ctx.restore();
  if (celebrationText.timer > celebrationText.hold) celebrationText.alpha -= 0.01;
  if (celebrationText.alpha <= 0) celebrationText = null;
}

function drawDropGhost() {
  if (!isPlaying || isGameOver || !canDrop) return;
  const ctx  = render.context;
  const data = levels[currentLevel];
  const scaledRadius = data.radius * sizeScale;
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.arc(dropX, 50, scaledRadius, 0, Math.PI * 2);
  ctx.fillStyle = MERGE_COLORS[currentLevel];
  ctx.fill();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawDangerZone() {
  if (!isPlaying || isGameOver) return;
  const ctx = render.context;
  const dangerLineY = 92;
  const bodies = Composite.allBodies(world);
  let hasDanger = false;
  for (const body of bodies) {
    if (body.label !== "trisha") continue;
    const top = body.position.y - (body.circleRadius || 0);
    if (top < dangerLineY) { hasDanger = true; break; }
  }
  if (hasDanger) {
    const pulse = Math.sin(Date.now() / 140) * 0.12 + 0.14;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "#ff2255";
    ctx.fillRect(0, 0, gameWidth, dangerLineY);
    ctx.restore();
  }
}

function addShake(intensity) {
  shakeIntensity = Math.min(shakeIntensity + intensity, 16);
}

function updateShake() {
  if (shakeIntensity > 0.5) {
    const x = (Math.random() - 0.5) * shakeIntensity;
    const y = (Math.random() - 0.5) * shakeIntensity;
    gameWrap.style.transform = `translate(${x}px, ${y}px)`;
    shakeIntensity *= 0.87;
  } else {
    shakeIntensity = 0;
    gameWrap.style.transform = "";
  }
}

/* ============================================================
   GAME OBJECTS
============================================================ */

function randomStartLevel() {
  return Math.floor(Math.random() * 3);
}

function createTrisha(x, y, level) {
  unlockLevel(level);
  const data  = levels[level];
  const scaledRadius = data.radius * sizeScale;
  const scaledHeight = data.visualHeight * sizeScale;
  const img   = loadedImages[level];
  const scale = scaledHeight / img.naturalHeight;

  const body = Bodies.circle(x, y, scaledRadius, {
    label: "trisha",
    restitution: 0.18,
    friction: 0.6,
    frictionAir: 0.012,
    density: 0.0015,
    render: {
      sprite: {
        texture: assets[level],
        xScale: scale,
        yScale: scale
      }
    }
  });
  body.level     = level;
  body.createdAt = Date.now();
  return body;
}

/* ======== FIX #3: dropTrisha sekarang cek isPaused ======== */
function dropTrisha() {
  if (!isPlaying || isGameOver || !canDrop || isPaused) return;
  canDrop = false;
  const maxRadius = levels[currentLevel].radius * sizeScale;
  const safeX = Math.max(maxRadius + 10, Math.min(gameWidth - maxRadius - 10, dropX));
  const body  = createTrisha(safeX, 50, currentLevel);
  Composite.add(world, body);
  playDropSfx();
  currentLevel = randomStartLevel();
  updateSideCurrent();
  updateMobileEvoBar();
  setTimeout(() => { canDrop = true; }, 500);
}

/* ============================================================
   COLLISION & MERGE
============================================================ */

function handleCollision(event) {
  for (const pair of event.pairs) {
    const a = pair.bodyA;
    const b = pair.bodyB;
    if (a.label !== "trisha" || b.label !== "trisha") continue;
    if (a.level !== b.level) continue;
    if (a.merged || b.merged) continue;
    const nextLevel = a.level + 1;
    if (nextLevel >= levels.length) continue;
    a.merged = true;
    b.merged = true;
    const x = (a.position.x + b.position.x) / 2;
    const y = (a.position.y + b.position.y) / 2;
    mergeQueue.push({ a, b, x, y, nextLevel });
  }
}

function processMerges() {
  while (mergeQueue.length > 0) {
    const { a, b, x, y, nextLevel } = mergeQueue.shift();
    Composite.remove(world, a);
    Composite.remove(world, b);
    const merged = createTrisha(x, y, nextLevel);
    Composite.add(world, merged);
    const points = levels[nextLevel].score;
    createMergeEffect(x, y, nextLevel);
    createHeartBurst(x, y);
    createScorePopup(x, y - 35, points);
    addShake(2 + nextLevel * 1.5);
    playMergeSfx(nextLevel);
    playTrishaSfx(nextLevel);       // ← UBAH: dulu nextLevel-1, sekarang nextLevel
    updateMergeLog(nextLevel);
    updateMobileEvoBar();

    score += points;
    scoreEl.textContent = score;
    animateScoreCard();

    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem("trishaBestScore", bestScore);
      bestEl.textContent = bestScore;
    }

    saveGameState();

    if (nextLevel === 6) {
      setTimeout(() => { playTrishaSfx(6); }, 800);  // ← UBAH: dulu 600, sekarang 800
      celebrationText = { text: "🌻 TRISHA MATAHARIKU 🌻", alpha: 1, timer: 0, hold: 180 };
      addShake(12);
    }

    if (navigator.vibrate) navigator.vibrate(35);
  }
}

/* ============================================================
   GAME OVER
============================================================ */

function checkGameOver() {
  if (!isPlaying || isGameOver) return;
  const dangerLineY = 92;
  const bodies = Composite.allBodies(world);
  const hasDangerBody = bodies.some((body) => {
    if (body.label !== "trisha") return false;
    const age = Date.now() - body.createdAt;
    if (age < 4500) return false;
    const isAlmostStill =
      Math.abs(body.velocity.x) < 0.25 &&
      Math.abs(body.velocity.y) < 0.25;
    const topSide = body.position.y - (body.circleRadius || 0);
    return isAlmostStill && topSide < dangerLineY - 55;
  });
  if (hasDangerBody) {
    if (!dangerStartTime) dangerStartTime = Date.now();
    if (Date.now() - dangerStartTime > 2500) endGame();
  } else {
    dangerStartTime = null;
  }
}

/* ============================================================
   GAME LIFECYCLE
============================================================ */

function endGame() {
  isGameOver = true;
  isPlaying  = false;
  stopBGM();
  playGameOverSfx();
  addShake(10);
  finalScoreEl.textContent = `Score: ${score}`;
  gameOverScreen.style.display = "flex";
}

function cleanupGame() {
  stopBGM();
  if (runner)  { Runner.stop(runner);  runner = null; }
  if (render)  { Render.stop(render);  render = null; }
  if (engine)  { Engine.clear(engine); engine = null; world = null; }
  particles.length    = 0;
  effects.length      = 0;
  scorePopups.length  = 0;
  mergeQueue.length   = 0;
  celebrationText     = null;
  shakeIntensity      = 0;
  dangerStartTime     = null;
  gameWrap.style.transform = "";
}

function setupGame() {
  cleanupGame();
  resizeCanvas();

  engine = Engine.create();
  world  = engine.world;
  engine.gravity.y = 1.12;

  render = Render.create({
    canvas, engine,
    options: { width: gameWidth, height: gameHeight, wireframes: false, background: "transparent" }
  });
  runner = Runner.create();

  const ground    = Bodies.rectangle(gameWidth / 2, gameHeight + 25, gameWidth, 50, { isStatic: true, render: { fillStyle: "#ff8fbd" } });
  const leftWall  = Bodies.rectangle(-25, gameHeight / 2, 50, gameHeight, { isStatic: true, render: { fillStyle: "transparent" } });
  const rightWall = Bodies.rectangle(gameWidth + 25, gameHeight / 2, 50, gameHeight, { isStatic: true, render: { fillStyle: "transparent" } });

  Composite.add(world, [ground, leftWall, rightWall]);
  Render.run(render);
  Runner.run(runner, engine);

  currentLevel = randomStartLevel();
  updateSideCurrent();
  updateMobileEvoBar();
  dropX = gameWidth / 2;
  aimLine.style.left = `${dropX}px`;

  Events.on(engine, "collisionStart", handleCollision);
  Events.on(engine, "afterUpdate", () => { processMerges(); checkGameOver(); });
  Events.on(render, "afterRender", () => {
    drawDropGhost(); drawEffects(); drawParticles();
    drawScorePopups(); drawCelebration(); drawDangerZone(); updateShake();
  });
}

function startGame() {
  const savedState = loadGameState();
  if (savedState && savedState.bodies && savedState.bodies.length > 0) {
    restoreGame(savedState);
    return;
  }

  initAudio();

  startScreen.style.display    = "none";
  gameOverScreen.style.display = "none";
  isPlaying  = true;
  isGameOver = false;
  isPaused   = false;   // ← dipastikan false
  canDrop    = true;
  dangerStartTime = null;
  highestReached  = 0;
  score      = 0;
  scoreEl.textContent = score;

  setupGame();
  startBGM();

  updateCollectionUI();
  renderPreviewGrid();
  syncDesktopPreview();
  aimLine.style.display = "block";
}

function restartGame() {
  cleanupGame();
  localStorage.removeItem("trishaGameState");
  score = 0;
  scoreEl.textContent = "0";
  bestEl.textContent  = bestScore;
  isPlaying  = false;
  isGameOver = false;
  isPaused   = false;
  canDrop    = true;
  highestReached = 0;
  startScreen.style.display    = "flex";
  gameOverScreen.style.display = "none";
  if (pauseBtn) pauseBtn.textContent = "Pause";
  if (mobilePauseBtn) mobilePauseBtn.textContent = "Pause";
  aimLine.style.display = "none";
  updateCollectionUI();
  renderPreviewGrid();
  syncDesktopPreview();
  updateMobileEvoBar();
  if (mobileMergeLog) mobileMergeLog.textContent = "🌻 Panggil Trisha sampai menjadi Matahariku";
}

/* ============================================================
   INPUT — POINTER
============================================================ */

function setDropX(clientX) {
  const rect = canvas.getBoundingClientRect();
  dropX = clientX - rect.left;
  dropX = Math.max(40, Math.min(gameWidth - 40, dropX));
  aimLine.style.left = `${dropX}px`;
}

canvas.addEventListener("pointermove", (e) => setDropX(e.clientX));
canvas.addEventListener("pointerdown", (e) => { setDropX(e.clientX); dropTrisha(); });

/* ============================================================
   INPUT — KEYBOARD
============================================================ */

document.addEventListener("keydown", (e) => {
  if (!isPlaying && !isGameOver && startScreen.style.display !== "none") {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); preloadImages(startGame); return; }
  }
  if (isGameOver) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); gameOverScreen.style.display = "none"; startGame(); return; }
  }
  if (!isPlaying || isGameOver) return;
  const step = 30;
  switch (e.key) {
    case "ArrowLeft":  e.preventDefault(); dropX = Math.max(40, dropX - step); aimLine.style.left = `${dropX}px`; break;
    case "ArrowRight": e.preventDefault(); dropX = Math.min(gameWidth - 40, dropX + step); aimLine.style.left = `${dropX}px`; break;
    case " ": case "ArrowDown": e.preventDefault(); dropTrisha(); break;
    case "p": case "P": if (pauseBtn) pauseBtn.click(); break;
  }
});

/* ============================================================
   BUTTON HANDLERS
============================================================ */

startBtn.addEventListener("click", () => preloadImages(startGame));
restartBtn.addEventListener("click", restartGame);
playAgainBtn.addEventListener("click", () => { gameOverScreen.style.display = "none"; startGame(); });
if (sideResetBtn) sideResetBtn.addEventListener("click", restartGame);

function togglePause() {
  if (!runner || !engine || isGameOver) return;
  if (!isPaused) {
    Runner.stop(runner);
    isPaused  = true;
    isPlaying = false;
    if (pauseBtn) pauseBtn.textContent = "Resume";
    if (mobilePauseBtn) mobilePauseBtn.textContent = "Resume";
    saveGameState();
  } else {
    Runner.run(runner, engine);
    isPaused  = false;
    isPlaying = true;
    if (pauseBtn) pauseBtn.textContent = "Pause";
    if (mobilePauseBtn) mobilePauseBtn.textContent = "Pause";
  }
}

if (pauseBtn) pauseBtn.addEventListener("click", togglePause);
if (mobilePauseBtn) mobilePauseBtn.addEventListener("click", togglePause);

function toggleBGM() {
  initAudio();
  resumeAudio();
  if (!bgmPlaying) {
    startBGM();
    if (musicBtn) musicBtn.textContent = "BGM OFF";
    if (mobileMusicBtn) mobileMusicBtn.textContent = "🎵 OFF";
  } else {
    stopBGM();
    if (musicBtn) musicBtn.textContent = "BGM ON";
    if (mobileMusicBtn) mobileMusicBtn.textContent = "🎵 ON";
  }
}

if (musicBtn) musicBtn.addEventListener("click", toggleBGM);
if (mobileMusicBtn) mobileMusicBtn.addEventListener("click", toggleBGM);

if (previewBtn && previewModal) {
  previewBtn.addEventListener("click", () => { renderPreviewGrid(); previewModal.classList.add("show"); });
}
if (closePreview && previewModal) {
  closePreview.addEventListener("click", () => { previewModal.classList.remove("show"); });
}

/* ============================================================
   RESIZE
============================================================ */

let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (isPlaying && !isGameOver) { startGame(); }
    else if (!isPlaying) { resizeCanvas(); }
  }, 300);
});

/* ============================================================
   VISIBILITY — FIX #4: restore runner saat tab kembali
============================================================ */

let wasBgmPlaying  = false;
let wasGamePlaying = false;

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    wasBgmPlaying  = bgmPlaying;
    wasGamePlaying = isPlaying && !isGameOver && !isPaused;
    if (bgmPlaying) bgmAudio.pause();
    if (wasGamePlaying && runner && engine) Runner.stop(runner);
    saveGameState();
  } else {
    /* ======== FIX #4a: Resume game saat tab kembali ======== */
    if (wasGamePlaying && runner && engine && !isPaused) {
      Runner.run(runner, engine);
    }
    /* ======== FIX #4b: Resume BGM saat tab kembali ======== */
    if (wasBgmPlaying) {
      bgmAudio.play().catch(() => {});
    }
  }
});

window.addEventListener("pageshow", () => {
  if (document.hidden) {
    if (bgmPlaying) bgmAudio.pause();
    if (runner && isPlaying) Runner.stop(runner);
  }
});

/* ============================================================
   INIT
============================================================ */

updateCollectionUI();
renderPreviewGrid();
syncDesktopPreview();
updateMobileEvoBar();