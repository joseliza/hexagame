'use strict';

// ─── Constantes globales ──────────────────────────────────────────────────────
const W = 900, H = 660;
const HEX = '0123456789ABCDEF';
const HUD_H    = 50;
const GROUND_Y = 465;
const CANNON_CY = 510;
const PANEL_Y   = 555;

const ALIEN_COLORS = ['#00e650', '#00c8ff', '#ffd700', '#ff8c00', '#b43cff', '#ff64b4'];

let SHIP_CANVAS = null;

// ─── Estrellas animadas ───────────────────────────────────────────────────────
// [x, y, size, vy]
let STARS = Array.from({ length: 120 }, () => [
  Math.random() * W | 0,
  HUD_H + (Math.random() * (GROUND_Y - HUD_H - 20)) | 0,
  Math.random() < 0.25 ? 2 : 1,
  18 + Math.random() * 42,
]);

// ─── Motor de audio (Web Audio API) ──────────────────────────────────────────
class AudioEngine {
  constructor() {
    this._ctx = null;
    this.enabled = true;
  }

  _getCtx() {
    if (!this._ctx) {
      try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    }
    return this._ctx;
  }

  _tone(freq, dur, type = 'square', vol = 0.25, freqEnd = null) {
    if (!this.enabled) return;
    try {
      const ctx = this._getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (freqEnd !== null)
        osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + dur);
    } catch {}
  }

  _noise(dur, vol = 0.3, filterFreq = 400) {
    if (!this.enabled) return;
    try {
      const ctx = this._getCtx();
      if (!ctx) return;
      const size = ctx.sampleRate * dur;
      const buf = ctx.createBuffer(1, size, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < size; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = filterFreq;
      const gain = ctx.createGain();
      src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      src.start(); src.stop(ctx.currentTime + dur);
    } catch {}
  }

  shoot()   { this._tone(880, 0.07, 'square', 0.18); }
  explode() { this._noise(0.18, 0.35, 350); this._tone(220, 0.18, 'sawtooth', 0.12, 60); }
  escape()  { this._tone(400, 0.25, 'sine', 0.2, 180); }
  levelUp() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this._tone(f, 0.12, 'square', 0.18), i * 80));
  }
  error()   { this._tone(180, 0.15, 'sawtooth', 0.2, 100); }
  gameOver() {
    const notes = [440, 349, 294, 220, 175];
    notes.forEach((f, i) => setTimeout(() => this._tone(f, 0.18, 'sawtooth', 0.22), i * 130));
  }
  join()    { this._tone(660, 0.08, 'square', 0.15); }
  podium()  {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.15, 'square', 0.2), i * 90));
  }
}

// ─── Nivel Config ─────────────────────────────────────────────────────────────
const LEVEL_CONFIGS = [
  { name: 'Nivel 0', desc: '1 marciano  ·  velocidad muy baja  ·  práctica libre',
    chars: HEX, baseSpeed: 10, speedVar: 2, spawnDelay: 6.0, cap: 1, color: '#a0a0ff' },
  { name: 'Nivel 1', desc: '1 marciano  ·  velocidad baja',
    chars: HEX, baseSpeed: 14, speedVar: 4, spawnDelay: 5.5, cap: 1, color: '#00e650' },
  { name: 'Nivel 2', desc: '2 marcianos simultáneos  ·  velocidad media-baja',
    chars: HEX, baseSpeed: 22, speedVar: 6, spawnDelay: 4.5, cap: 2, color: '#00c8ff' },
  { name: 'Nivel 3', desc: '2 marcianos simultáneos  ·  velocidad media',
    chars: HEX, baseSpeed: 32, speedVar: 8, spawnDelay: 3.8, cap: 2, color: '#ffd700' },
  { name: 'Nivel 4', desc: '3 marcianos simultáneos  ·  velocidad alta',
    chars: HEX, baseSpeed: 45, speedVar: 10, spawnDelay: 3.0, cap: 3, color: '#ff8c00' },
  { name: 'Nivel 5', desc: '3 marcianos simultáneos  ·  velocidad muy alta',
    chars: HEX, baseSpeed: 60, speedVar: 14, spawnDelay: 2.2, cap: 3, color: '#ff3c3c' },
];

// ─── Dibuja un marciano ───────────────────────────────────────────────────────
function drawAlien(ctx, cx, cy, color) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, 19, 13, 0, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();

  for (const ex of [-7, 7]) {
    ctx.beginPath(); ctx.arc(cx + ex, cy - 3, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#f0f0fa'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx + ex, cy - 3, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#08091c'; ctx.fill();
  }

  ctx.strokeStyle = color; ctx.lineWidth = 2;
  for (const px of [-12, -4, 4, 12]) {
    ctx.beginPath(); ctx.moveTo(cx + px, cy + 13); ctx.lineTo(cx + px, cy + 26); ctx.stroke();
  }

  for (const ax of [-10, 10]) {
    ctx.beginPath(); ctx.moveTo(cx + ax, cy - 13); ctx.lineTo(cx + ax * 1.7, cy - 30); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + ax * 1.7, cy - 30, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#f0f0fa'; ctx.fill();
  }
}

// ─── Clase Alien ──────────────────────────────────────────────────────────────
class Alien {
  constructor(cfg) {
    const c = cfg.chars;
    this.h1 = c[Math.random() * c.length | 0];
    this.h2 = c[Math.random() * c.length | 0];
    this.hexStr = this.h1 + this.h2;
    this.nl = parseInt(this.h1, 16);
    this.nr = parseInt(this.h2, 16);
    this.x = 75 + Math.random() * (W - 150);
    this.y = -55;
    this.speed = cfg.baseSpeed + (Math.random() - 0.5) * cfg.speedVar;
    this.color = ALIEN_COLORS[Math.random() * ALIEN_COLORS.length | 0];
    this.alive = true;
    this.explFrames = 0;
    this.bob = Math.random() * Math.PI * 2;
  }

  update(dt) {
    if (this.alive) {
      this.y += this.speed * dt;
      this.bob += 1.8 * dt;
    } else if (this.explFrames > 0) {
      this.explFrames--;
    }
  }

  draw(ctx, isTarget, leftFlash = false, rightFlash = false, flashColor = '#ff3c3c') {
    const cx = this.x | 0;
    const cy = (this.y + Math.sin(this.bob) * 4) | 0;

    if (this.alive) {
      drawAlien(ctx, cx, cy, this.color);
      ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = leftFlash  ? flashColor : '#f0f0fa'; ctx.fillText(this.h1, cx - 9, cy + 46);
      ctx.fillStyle = rightFlash ? flashColor : '#f0f0fa'; ctx.fillText(this.h2, cx + 9, cy + 46);

      if (isTarget) {
        ctx.fillStyle = '#ff3c3c';
        ctx.beginPath();
        ctx.moveTo(cx, cy + 58); ctx.lineTo(cx - 9, cy + 70); ctx.lineTo(cx + 9, cy + 70);
        ctx.closePath(); ctx.fill();
      }
    } else if (this.explFrames > 0) {
      const prog = (12 - this.explFrames) / 12;
      const r = prog * 65, alpha = 1 - prog;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,200,0,${alpha})`; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,90,0,${alpha})`; ctx.fill();
    }
  }

  get done() { return !this.alive && this.explFrames <= 0; }
}

// ─── Panel de 4 bits ──────────────────────────────────────────────────────────
class Panel {
  constructor(x, y, keys, keyNames) {
    this.x = x; this.y = y;
    this.keys = keys; this.keyNames = keyNames;
    this.bits = [0, 0, 0, 0];
    this.SZ = 56; this.GAP = 6;
    this.flash = null; this.flashTimer = 0;
  }

  toggle(key) { const i = this.keys.indexOf(key); if (i >= 0) this.bits[i] ^= 1; }
  get value() { return (this.bits[0] << 3) | (this.bits[1] << 2) | (this.bits[2] << 1) | this.bits[3]; }
  reset() { this.bits = [0, 0, 0, 0]; }

  hitTest(mx, my) {
    const { SZ, GAP } = this;
    if (my < this.y || my > this.y + SZ) return -1;
    for (let i = 0; i < 4; i++) {
      const bx = this.x + i * (SZ + GAP);
      if (mx >= bx && mx <= bx + SZ) return i;
    }
    return -1;
  }

  setFlash(type) { this.flash = type; this.flashTimer = 45; }

  update() { if (this.flashTimer > 0 && --this.flashTimer === 0) this.flash = null; }

  draw(ctx) {
    const { SZ, GAP } = this;
    for (let i = 0; i < 4; i++) {
      const bx = this.x + i * (SZ + GAP), by = this.y, bit = this.bits[i];
      let bg, border;
      if      (this.flash === 'ok')  { bg = '#005a28'; border = '#00e650'; }
      else if (this.flash === 'err') { bg = '#5a0010'; border = '#ff3c3c'; }
      else if (bit)                  { bg = '#00421c'; border = '#009640'; }
      else                           { bg = '#0c0c24'; border = '#28283c'; }

      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.roundRect(bx, by, SZ, SZ, 10); ctx.fill();
      ctx.strokeStyle = border; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(bx, by, SZ, SZ, 10); ctx.stroke();

      ctx.font = 'bold 32px monospace'; ctx.fillStyle = '#f0f0fa'; ctx.textAlign = 'center';
      ctx.fillText(String(bit), bx + SZ / 2, by + SZ / 2 + 12);

      ctx.font = 'bold 14px monospace'; ctx.fillStyle = '#8888aa';
      ctx.fillText(String(1 << (3 - i)), bx + SZ / 2, by + SZ + 15);
    }
  }
}

// ─── Cañón ────────────────────────────────────────────────────────────────────
class Cannon {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.targetX = x;
    this.beam = null; this.beamTimer = 0; this.flash = 0;
  }

  fireAt(alien) { this.beam = { x: alien.x | 0, y: alien.y | 0 }; this.beamTimer = 14; this.flash = 10; }

  update(dt) {
    this.x += (this.targetX - this.x) * Math.min(1, 10 * dt);
    if (this.beamTimer > 0 && --this.beamTimer === 0) this.beam = null;
    if (this.flash > 0) this.flash--;
  }

  draw(ctx) {
    const { x: cx, y: cy } = this;
    const shipH = 64, shipW = 64, shipTop = cy - 44;
    if (SHIP_CANVAS) ctx.drawImage(SHIP_CANVAS, cx - shipW / 2, shipTop, shipW, shipH);

    if (this.flash > 0) {
      ctx.save();
      ctx.shadowColor = '#ff4040'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(cx, shipTop, this.flash * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,80,80,${this.flash / 10})`; ctx.fill();
      ctx.restore();
    }

    if (this.beam && this.beamTimer > 0) {
      ctx.save();
      ctx.shadowColor = '#ff4040'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(cx, shipTop); ctx.lineTo(this.beam.x, this.beam.y);
      ctx.strokeStyle = '#ff2020'; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    }
  }
}

// ─── RoomManager ─────────────────────────────────────────────────────────────
class RoomManager {
  constructor(game) {
    this.game = game;
    this.socket = null;
    this.connected = false;
  }

  connect() {
    if (this.socket) return;
    this.socket = io();

    this.socket.on('room_created', d => {
      const g = this.game;
      g.roomCode = d.code;
      g.roomNick = d.nick;
      g.roomCreator = d.creator;
      g.roomPlayers = d.players;
      g.state = 'room_lobby';
      g.audio.join();
      g._updateRoomPanel();
    });

    this.socket.on('room_joined', d => {
      const g = this.game;
      g.roomCode = d.code;
      g.roomNick = d.nick;
      g.roomCreator = d.creator;
      g.roomPlayers = d.players;
      g.state = 'room_lobby';
      g.audio.join();
      g._updateRoomPanel();
    });

    this.socket.on('room_error', d => {
      const el = document.getElementById('modal-error');
      el.textContent = d.msg;
      el.classList.remove('hidden');
    });

    this.socket.on('player_joined', d => {
      const g = this.game;
      g.roomPlayers = d.players;
      if (g.state === 'room_lobby') g._updateRoomPanel();
    });

    this.socket.on('player_left', d => {
      const g = this.game;
      g.roomPlayers = d.players;
      if (g.state === 'room_lobby') g._updateRoomPanel();
      else g._updateRoomPanel();
    });

    this.socket.on('game_starting', () => {
      const g = this.game;
      g.roomCountdown = 3;
      g._countdownTick();
    });

    this.socket.on('scores_update', d => {
      this.game.roomPlayers = d.players;
      this.game._updateRoomPanel();
    });

    this.socket.on('podium_show', d => {
      const g = this.game;
      g.podiumData = d;
      g.state = 'podium';
      g.audio.podium();
      document.getElementById('room-panel').classList.add('hidden');
    });
  }

  createRoom(nick) { this.connect(); this.socket.emit('create_room', { nick }); }
  joinRoom(nick, code) { this.connect(); this.socket.emit('join_room_req', { nick, code }); }

  updateScore(score, lives) {
    if (!this.socket || !this.game.roomCode) return;
    this.socket.emit('score_update', { code: this.game.roomCode, nick: this.game.roomNick, score, lives });
  }

  notifyGameOver(score) {
    if (!this.socket || !this.game.roomCode) return;
    this.socket.emit('player_gameover', { code: this.game.roomCode, nick: this.game.roomNick, score });
  }

  startGame() {
    if (!this.socket || !this.game.roomCode) return;
    this.socket.emit('start_game', { code: this.game.roomCode });
  }

  showPodium() {
    if (!this.socket || !this.game.roomCode) return;
    this.socket.emit('show_podium', { code: this.game.roomCode });
  }

  leave() {
    if (!this.socket || !this.game.roomCode) return;
    this.socket.emit('leave_room_req', { code: this.game.roomCode, nick: this.game.roomNick });
    this.game.roomCode = null;
    this.game.roomNick = null;
    document.getElementById('room-panel').classList.add('hidden');
  }
}

// ─── Juego principal ──────────────────────────────────────────────────────────
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = new AudioEngine();
    this.room  = new RoomManager(this);

    this.menuMode    = 'libre';
    this.levelCursor = 0;
    this.gameMode    = 'libre';
    this.fixedConfig = null;
    this.state       = 'start';
    this.paused      = false;

    // Estado sala
    this.roomCode      = null;
    this.roomNick      = null;
    this.roomCreator   = null;
    this.roomPlayers   = [];
    this.roomCountdown = 0;

    // Podio
    this.podiumData = null;

    this._bindKeys();
    this._initGame();
    this._lastTime = null;
    requestAnimationFrame(ts => this._loop(ts));
  }

  // ─── Inicialización ─────────────────────────────────────────────────────────
  _initGame() {
    this.score  = 0;
    this.lives  = 3;
    this.level  = 1;
    this.aliens = [];
    this.cannon = new Cannon(W / 2, CANNON_CY);

    this.escapedCount     = 0;
    this.escapedThreshold = 3;

    if (this.gameMode === 'niveles') {
      const cfg = this.fixedConfig;
      this.spawnDelay = cfg.spawnDelay;
      this.alienCap   = cfg.cap;
    } else {
      this.spawnDelay = 3.5;
      this.alienCap   = 3;
    }

    this.spawnTimer    = 0;
    this.preFireFrames = 0;
    this.preFireTarget = null;
    this.fbMsg = ''; this.fbTimer = 0; this.fbColor = '#f0f0fa';
    this.hints = false;
    this._lastTime = null;

    this.panelL = new Panel(W / 2 - 300, PANEL_Y, ['q','w','e','r'], ['Q','W','E','R']);
    this.panelR = new Panel(W / 2 + 58,  PANEL_Y, ['u','i','o','p'], ['U','I','O','P']);
  }

  // ─── Arrancar partida en sala (cada jugador por su cuenta) ─────────────────
  _startRoomGame() {
    this._initGame();
    this.state = 'playing';
    document.getElementById('room-panel').classList.remove('hidden');
  }

  // ─── Panel HTML de puntuaciones ─────────────────────────────────────────────
  _updateRoomPanel() {
    if (!this.roomCode) return;
    document.getElementById('rp-code').textContent = this.roomCode;
    document.getElementById('rp-nick').textContent = `Jugando como: ${this.roomNick}`;

    const rankColors = ['rank-gold', 'rank-silver', 'rank-bronze'];
    const rankSymbols = ['①', '②', '③'];
    const list = document.getElementById('rp-scores');
    list.innerHTML = '';

    this.roomPlayers.forEach((p, i) => {
      const div = document.createElement('div');
      div.className = 'score-entry' + (p.nick === this.roomNick ? ' me' : '');

      const rankCls = i < 3 ? rankColors[i] : 'rank-other';
      const rankSym = i < 3 ? rankSymbols[i] : `${i + 1}.`;

      const lives = p.state === 'gameover' ? '' : '♥'.repeat(Math.max(0, p.lives));
      const stateTag = p.state === 'gameover' ? '<span class="score-state-go">GO</span>' : `<span class="score-hearts">${lives}</span>`;

      div.innerHTML =
        `<span class="score-rank ${rankCls}">${rankSym}</span>` +
        `<span class="score-nick">${p.nick}</span>` +
        `<span class="score-pts">${p.score}</span>` +
        stateTag;
      list.appendChild(div);
    });

    // Solo el anfitrión puede mostrar el podio para todos
    const btnPodium = document.getElementById('btn-podium');
    if (this.roomNick === this.roomCreator) {
      btnPodium.classList.remove('hidden');
    } else {
      btnPodium.classList.add('hidden');
    }
  }

  // ─── Teclado ─────────────────────────────────────────────────────────────────
  _bindKeys() {
    window.addEventListener('keydown', e => {
      const k = e.key === ' ' ? ' ' : e.key.toLowerCase();

      // Pausa (disponible durante la partida)
      if (k === ' ' && this.state === 'playing') {
        this._togglePause(); return;
      }
      if (this.paused) return;

      if (this.state === 'about') {
        if (k === 'escape' || k === 'enter') this.state = 'start';
        return;
      }

      if (this.state === 'start') {
        if (k === 'arrowleft' || k === 'arrowright')
          this.menuMode = this.menuMode === 'libre' ? 'niveles' : 'libre';
        if (k === 'enter') {
          if (this.menuMode === 'libre') {
            this.gameMode = 'libre'; this._initGame(); this.state = 'playing';
          } else if (this.menuMode === 'niveles') {
            this.state = 'select';
          } else {
            this._openNickModal();
          }
        }
        return;
      }

      if (this.state === 'select') {
        if (k === 'arrowup')   this.levelCursor = Math.max(0, this.levelCursor - 1);
        if (k === 'arrowdown') this.levelCursor = Math.min(LEVEL_CONFIGS.length - 1, this.levelCursor + 1);
        if (k === 'escape')    this.state = 'start';
        if (k === 'enter') {
          this.gameMode = 'niveles'; this.fixedConfig = LEVEL_CONFIGS[this.levelCursor];
          this._initGame(); this.state = 'playing';
        }
        return;
      }

      if (this.state === 'room_lobby') {
        if (k === 'escape') { this.room.leave(); this.state = 'start'; }
        if (k === 'enter') this._startRoomGame();
        return;
      }

      if (this.state === 'gameover') {
        if (k === 'enter') {
          this._initGame();
          if (this.roomCode) { this.state = 'playing'; document.getElementById('room-panel').classList.remove('hidden'); }
          else this.state = 'playing';
        }
        if (k === 'escape') {
          if (this.roomCode) { this.room.leave(); }
          this.state = 'start';
        }
        return;
      }

      if (this.state === 'podium') {
        if (k === 'escape' || k === 'enter') {
          this.room.leave();
          this.podiumData = null;
          this.state = 'start';
        }
        return;
      }

      if (this.state === 'playing') {
        if (k === 'h') { this.hints = !this.hints; return; }
        if (k === 'escape') {
          if (this.roomCode) { document.getElementById('room-panel').classList.add('hidden'); }
          this.state = 'start'; return;
        }
        this.panelL.toggle(k);
        this.panelR.toggle(k);
      }
    });

    // Clic canvas
    this.canvas.addEventListener('click', e => {
      const { mx, my } = this._canvasCoords(e);
      if (this.state === 'about') {
        if (mx >= 280 && mx <= 620 && my >= 510 && my <= 534)
          window.open('/docs', '_blank');
        else
          this.state = 'start';
        return;
      }
    if (this.state === 'start')       { this._clickStart(mx, my);   return; }
      if (this.state === 'select')      { this._clickSelect(mx, my);  return; }
      if (this.state === 'room_lobby')  { this._clickLobby(mx, my);   return; }
      if (this.state === 'podium')      { this._clickPodium(mx, my);  return; }
      if (this.state !== 'playing' || this.paused) return;
      let i = this.panelL.hitTest(mx, my);
      if (i >= 0) { this.panelL.bits[i] ^= 1; return; }
      i = this.panelR.hitTest(mx, my);
      if (i >= 0) { this.panelR.bits[i] ^= 1; }
    });

    // Hover
    this.canvas.addEventListener('mousemove', e => {
      const { mx, my } = this._canvasCoords(e);
      if (this.state === 'about') {
        this.canvas.style.cursor = (mx >= 280 && mx <= 620 && my >= 510 && my <= 534) ? 'pointer' : 'default';
        return;
      }
      if (this.state === 'start') {
        const bw = 240, bh = 72, gap = 20;
        const totalW = 3 * bw + 2 * gap;
        const bx0 = (W - totalW) / 2, by = 380;
        if (my >= by && my <= by + bh) {
          const modes = ['libre', 'niveles', 'sala'];
          for (let i = 0; i < 3; i++) {
            if (mx >= bx0 + i * (bw + gap) && mx <= bx0 + i * (bw + gap) + bw) {
              this.menuMode = modes[i]; this.canvas.style.cursor = 'pointer'; return;
            }
          }
        }
        this.canvas.style.cursor = 'default'; return;
      }
      if (this.state === 'select') {
        const cardW = 720, cardH = 72, gap = 12;
        const cardX = (W - cardW) / 2;
        const totalH = LEVEL_CONFIGS.length * (cardH + gap) - gap;
        const startY = (H - totalH) / 2 - 10;
        if (mx >= cardX && mx <= cardX + cardW) {
          for (let i = 0; i < LEVEL_CONFIGS.length; i++) {
            const by = startY + i * (cardH + gap);
            if (my >= by && my <= by + cardH) {
              this.levelCursor = i; this.canvas.style.cursor = 'pointer'; return;
            }
          }
        }
        this.canvas.style.cursor = 'default'; return;
      }
      if (this.state !== 'playing' || this.paused) { this.canvas.style.cursor = 'default'; return; }
      const over = this.panelL.hitTest(mx, my) >= 0 || this.panelR.hitTest(mx, my) >= 0;
      this.canvas.style.cursor = over ? 'pointer' : 'default';
    });

    // Botón podio en panel lateral
    document.getElementById('btn-podium').addEventListener('click', () => {
      if (confirm('⚠️ Mostrar el podio interrumpirá la partida de todos los jugadores de la sala. ¿Continuar?'))
        this.room.showPodium();
    });
  }

  // ─── Modal nick / código ─────────────────────────────────────────────────────
  _openNickModal() {
    const modal = document.getElementById('nick-modal');
    const nickIn = document.getElementById('nick-input');
    const codeIn = document.getElementById('code-input');
    const errEl  = document.getElementById('modal-error');
    const okBtn  = document.getElementById('modal-ok');
    const cancelBtn = document.getElementById('modal-cancel');

    errEl.classList.add('hidden');
    nickIn.value = ''; codeIn.value = '';
    modal.classList.remove('hidden');
    nickIn.focus();

    const submit = () => {
      const nick = nickIn.value.trim();
      const code = codeIn.value.trim().toUpperCase();
      if (!nick) { errEl.textContent = 'Escribe tu nick.'; errEl.classList.remove('hidden'); return; }
      modal.classList.add('hidden');
      if (code) this.room.joinRoom(nick, code);
      else      this.room.createRoom(nick);
    };

    okBtn.onclick = submit;
    cancelBtn.onclick = () => modal.classList.add('hidden');
    nickIn.onkeydown = codeIn.onkeydown = e => { if (e.key === 'Enter') submit(); };
  }

  _togglePause() {
    this.paused = !this.paused;
    if (this.paused) this.audio._tone(440, 0.06, 'square', 0.1);
    else             this.audio._tone(880, 0.06, 'square', 0.1);
  }

  // ─── Clicks en pantallas ─────────────────────────────────────────────────────
  _clickStart(mx, my) {
    if (my >= H - 14) { this.state = 'about'; return; }
    const bw = 240, bh = 72, gap = 20;
    const totalW = 3 * bw + 2 * gap;
    const bx0 = (W - totalW) / 2, by = 380;
    if (my < by || my > by + bh) return;
    const modes = ['libre', 'niveles', 'sala'];
    for (let i = 0; i < 3; i++) {
      const bx = bx0 + i * (bw + gap);
      if (mx >= bx && mx <= bx + bw) {
        if (modes[i] === 'libre')  { this.menuMode = 'libre'; this.gameMode = 'libre'; this._initGame(); this.state = 'playing'; }
        else if (modes[i] === 'niveles') { this.menuMode = 'niveles'; this.state = 'select'; }
        else { this.menuMode = 'sala'; this._openNickModal(); }
        return;
      }
    }
  }

  _clickSelect(mx, my) {
    const cardW = 720, cardH = 72, gap = 12;
    const cardX = (W - cardW) / 2;
    const totalH = LEVEL_CONFIGS.length * (cardH + gap) - gap;
    const startY = (H - totalH) / 2 - 10;
    if (mx < cardX || mx > cardX + cardW) return;
    for (let i = 0; i < LEVEL_CONFIGS.length; i++) {
      const by = startY + i * (cardH + gap);
      if (my >= by && my <= by + cardH) {
        this.levelCursor = i; this.gameMode = 'niveles'; this.fixedConfig = LEVEL_CONFIGS[i];
        this._initGame(); this.state = 'playing'; return;
      }
    }
  }

  _clickLobby(mx, my) {
    if (mx >= (W - 200) / 2 && mx <= (W + 200) / 2 && my >= H - 90 && my <= H - 42) {
      this._startRoomGame(); return;
    }
    if (mx >= (W - 140) / 2 && mx <= (W + 140) / 2 && my >= H - 36 && my <= H) {
      this.room.leave(); this.state = 'start';
    }
  }

  _clickPodium(mx, my) {
    if (my >= H - 36) {
      this.room.leave(); this.podiumData = null; this.state = 'start';
    }
  }

  _canvasCoords(e) {
    const r = this.canvas.getBoundingClientRect();
    return { mx: (e.clientX - r.left) * (W / r.width), my: (e.clientY - r.top) * (H / r.height) };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  get _target() {
    const alive = this.aliens.filter(a => a.alive);
    return alive.length ? alive.reduce((a, b) => a.y > b.y ? a : b) : null;
  }

  _alienConfig() {
    if (this.gameMode === 'niveles') return this.fixedConfig;
    return { chars: HEX, baseSpeed: 22 + this.level * 9, speedVar: 14 };
  }

  _fire() {
    const t = this._target;
    if (!t) return;
    const lv = this.panelL.value, rv = this.panelR.value;

    if (lv === t.nl && rv === t.nr) {
      t.alive = false; t.explFrames = 12;
      this.cannon.fireAt(t);
      this.audio.shoot();
      setTimeout(() => this.audio.explode(), 50);
      const pts = 10 * this.level;
      this.score += pts;
      this._fb(`¡BOOM!  +${pts} puntos`, '#00e650');
      this.panelL.setFlash('ok'); this.panelR.setFlash('ok');
      if (this.roomCode) this.room.updateScore(this.score, this.lives);

      if (this.gameMode === 'libre' && this.score >= this.level * 120) {
        this.level++;
        this.spawnDelay = Math.max(0.8, this.spawnDelay - 0.45);
        this.alienCap   = Math.min(6, this.alienCap + 1);
        this._fb(`¡NIVEL ${this.level}!  Los marcianos aceleran…`, '#ffd700');
        this.audio.levelUp();
      }
    } else {
      const lb = t.nl.toString(2).padStart(4, '0');
      const rb = t.nr.toString(2).padStart(4, '0');
      this._fb(`Fallo — ${t.h1} = ${lb}   ${t.h2} = ${rb}`, '#ff5050');
      this.panelL.setFlash('err'); this.panelR.setFlash('err');
      this.audio.error();
      this.lives = Math.max(0, this.lives - 1);
      if (this.roomCode) this.room.updateScore(this.score, this.lives);
      if (this.lives === 0) { this._triggerGameOver(); }
    }

    this.panelL.reset(); this.panelR.reset();
    this.aliens = this.aliens.filter(a => !a.done);
  }

  _triggerGameOver() {
    this.audio.gameOver();
    if (this.roomCode) this.room.notifyGameOver(this.score);
    this.state = 'gameover';
  }

  _fb(msg, color = '#f0f0fa') { this.fbMsg = msg; this.fbTimer = 160; this.fbColor = color; }

  // ─── Loop ────────────────────────────────────────────────────────────────────
  _loop(ts) {
    requestAnimationFrame(ts2 => this._loop(ts2));
    if (!this._lastTime) { this._lastTime = ts; return; }
    const dt = Math.min((ts - this._lastTime) / 1000, 0.05);
    this._lastTime = ts;

    // Actualizar estrellas (siempre, incluso en menús)
    for (const s of STARS) {
      s[1] += s[3] * dt;
      if (s[1] > GROUND_Y - 8) { s[0] = Math.random() * W | 0; s[1] = HUD_H - 5; }
    }

    if (this.state === 'playing' && !this.paused) this._update(dt);
    this._draw();
  }

  _update(dt) {
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnDelay) {
      if (this.aliens.filter(a => a.alive).length < this.alienCap)
        this.aliens.push(new Alien(this._alienConfig()));
      this.spawnTimer = 0;
    }

    for (const a of this.aliens) a.update(dt);
    this.cannon.update(dt);
    this.panelL.update(); this.panelR.update();
    if (this.fbTimer > 0) this.fbTimer--;

    const tgt = this._target;
    if (tgt) this.cannon.targetX = tgt.x;

    if (tgt && this.panelL.value === tgt.nl && this.panelR.value === tgt.nr) {
      if (this.preFireTarget !== tgt) { this.preFireTarget = tgt; this.preFireFrames = 36; }
      else if (--this.preFireFrames <= 0) { this.preFireTarget = null; this._fire(); }
    } else { this.preFireTarget = null; this.preFireFrames = 0; }

    // Marcianos que alcanzan el suelo
    for (const a of this.aliens) {
      if (a.alive && a.y > GROUND_Y - 10) {
        a.alive = false;
        this.panelL.reset(); this.panelR.reset();
        this.audio.escape();
        const lb = a.nl.toString(2).padStart(4, '0');
        const rb = a.nr.toString(2).padStart(4, '0');
        this.escapedCount++;
        this._fb(`¡Escapó!  ${a.hexStr} = ${lb} ${rb}  [💀 ${this.escapedCount}/${this.escapedThreshold}]`, '#ff8c00');
        if (this.escapedCount >= this.escapedThreshold) {
          this.escapedCount = 0;
          this.lives = Math.max(0, this.lives - 1);
          if (this.roomCode) this.room.updateScore(this.score, this.lives);
          if (this.lives === 0) { this._triggerGameOver(); }
        }
      }
    }
    this.aliens = this.aliens.filter(a => !a.done);
  }

  // ─── Dibujo ──────────────────────────────────────────────────────────────────
  _draw() {
    const ctx = this.ctx;
    ctx.fillStyle = '#080a1c';
    ctx.fillRect(0, 0, W, H);

    for (const [sx, sy, sz] of STARS) {
      ctx.fillStyle = sz === 2 ? '#505080' : '#202038';
      ctx.fillRect(sx, sy, sz, sz);
    }

    if (this.state === 'about')      { this._drawAbout();    return; }
    if (this.state === 'start')      { this._drawStart();    return; }
    if (this.state === 'select')     { this._drawSelect();   return; }
    if (this.state === 'room_lobby') { this._drawLobby();    return; }
    if (this.state === 'gameover')   { this._drawGameOver(); return; }
    if (this.state === 'podium')     { this._drawPodium();   return; }

    // ── Campo de juego ────────────────────────────────────────────────────────
    const tgt = this._target;
    const blink = Math.floor(Date.now() / 150) % 2 === 0;
    for (const a of this.aliens) {
      const isTarget = a === tgt;
      let leftFlash = false, rightFlash = false, flashColor = '#ff3c3c';
      if (isTarget) {
        if (this.preFireFrames > 0) {
          const lit = (36 - this.preFireFrames) % 12 < 6;
          leftFlash = rightFlash = lit;
        } else {
          leftFlash  = blink && this.panelL.value === tgt.nl;
          rightFlash = blink && this.panelR.value === tgt.nr;
        }
      }
      a.draw(ctx, isTarget, leftFlash, rightFlash, flashColor);
    }
    this.cannon.draw(ctx);

    const ccx = this.cannon.x | 0, ccy = this.cannon.y;
    ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#f0f0fa';
    ctx.fillText(HEX[this.panelL.value], ccx - 12, ccy + 34);
    ctx.fillText(HEX[this.panelR.value], ccx + 12, ccy + 34);

    ctx.strokeStyle = '#181830'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();

    this.panelL.draw(ctx); this.panelR.draw(ctx);
    ctx.font = '22px monospace'; ctx.fillStyle = '#202038'; ctx.textAlign = 'center';
    ctx.fillText('│', W / 2, PANEL_Y + 28);

    // HUD
    ctx.fillStyle = '#06071a'; ctx.fillRect(0, 0, W, HUD_H);
    ctx.strokeStyle = '#1e2040'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, HUD_H); ctx.lineTo(W, HUD_H); ctx.stroke();

    ctx.textAlign = 'left'; ctx.font = 'bold 18px monospace'; ctx.fillStyle = '#00c8ff';
    ctx.fillText(`PUNTOS: ${this.score}`, 14, 22);

    ctx.textAlign = 'center'; ctx.fillStyle = '#ffd700';
    ctx.fillText(
      this.gameMode === 'niveles' ? this.fixedConfig.name.toUpperCase() : `NIVEL ${this.level}`,
      W / 2, 22);

    ctx.textAlign = 'right'; ctx.fillStyle = '#ff3c3c';
    ctx.fillText('♥ '.repeat(this.lives).trim(), W - 14, 22);

    if (tgt) {
      ctx.font = '13px monospace'; ctx.fillStyle = '#ff6060'; ctx.textAlign = 'center';
      ctx.fillText(`▶ OBJETIVO: ${tgt.hexStr} ◀`, W / 2, 41);
    }

    // Contador de escapados
    if (this.escapedCount > 0) {
      ctx.font = '13px monospace'; ctx.fillStyle = '#ff8c00'; ctx.textAlign = 'left';
      ctx.fillText(`💀 ${this.escapedCount}/${this.escapedThreshold}`, 14, 41);
    }

    if (this.fbTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.fbTimer / 30);
      ctx.font = 'bold 20px monospace'; ctx.fillStyle = this.fbColor; ctx.textAlign = 'center';
      ctx.fillText(this.fbMsg, W / 2, HUD_H + (GROUND_Y - HUD_H) * 0.55);
      ctx.restore();
    }

    let helpText = 'QWER / clic — nibble izq  │  UIOP / clic — nibble der  │  H — tabla  │  ESPACIO — pausa  │  ESC — menú';
    if (this.roomCode) helpText += `  │  SALA: ${this.roomCode}`;
    ctx.font = '12px monospace'; ctx.fillStyle = '#00c8ff'; ctx.textAlign = 'center';
    ctx.fillText(helpText, W / 2, H - 8);

    if (this.hints) this._drawHints();

    if (this.paused) this._drawPause();
  }

  // ─── Pantalla de inicio ───────────────────────────────────────────────────────
  _drawStart() {
    const ctx = this.ctx;

    ctx.font = 'bold 56px monospace'; ctx.fillStyle = '#00e650'; ctx.textAlign = 'center';
    ctx.fillText('HexInvaders', W / 2, 100);

    ctx.font = '16px monospace'; ctx.fillStyle = '#7070a0'; ctx.textAlign = 'center';
    ctx.fillText('Los marcianos caen con su código hex. Compón los nibbles binarios y dispara.', W / 2, 145);

    drawAlien(ctx, W / 2, 230, '#00e650');
    ctx.font = 'bold 26px monospace'; ctx.fillStyle = '#f0f0fa'; ctx.textAlign = 'center';
    ctx.fillText('A3', W / 2, 278);

    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#ffd700'; ctx.fillText('A = 1010', W / 2 - 115, 308);
    ctx.fillStyle = '#00c8ff'; ctx.fillText('3 = 0011', W / 2 + 115, 308);
    ctx.font = '12px monospace'; ctx.fillStyle = '#404060';
    ctx.fillText('QWER', W / 2 - 115, 326);
    ctx.fillText('UIOP', W / 2 + 115, 326);

    ctx.strokeStyle = '#303048'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(W / 2 - 7, 280); ctx.lineTo(W / 2 - 115, 295);
    ctx.moveTo(W / 2 + 7, 280); ctx.lineTo(W / 2 + 115, 295);
    ctx.stroke(); ctx.setLineDash([]);

    // 3 botones de modo
    const modes = [
      { key: 'libre',   label: '★  MODO LIBRE',    sub: 'Niveles progresivos automáticos' },
      { key: 'niveles', label: '☰  NIVEL FIJO',     sub: 'Tú eliges dificultad y contenido' },
      { key: 'sala',    label: '👥  SALA',           sub: 'Multijugador en tiempo real' },
    ];
    const bw = 240, bh = 72, gap = 20;
    const totalW = modes.length * bw + (modes.length - 1) * gap;
    const bx0 = (W - totalW) / 2;

    modes.forEach((m, i) => {
      const bx = bx0 + i * (bw + gap), by = 380;
      const active = this.menuMode === m.key;
      ctx.fillStyle = active ? '#0a1a0a' : '#0a0a1a';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.fill();
      ctx.strokeStyle = active ? '#00e650' : '#2a2a48'; ctx.lineWidth = active ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.stroke();
      ctx.font = 'bold 16px monospace'; ctx.fillStyle = active ? '#00e650' : '#606080';
      ctx.textAlign = 'center';
      ctx.fillText(m.label, bx + bw / 2, by + 28);
      ctx.font = '11px monospace'; ctx.fillStyle = active ? '#9090b0' : '#404060';
      ctx.fillText(m.sub, bx + bw / 2, by + 50);
    });

    ctx.font = '14px monospace'; ctx.fillStyle = '#404060'; ctx.textAlign = 'center';
    ctx.fillText('◀ ▶ para cambiar modo  ·  ENTER para confirmar', W / 2, 478);

    ctx.font = '13px monospace'; ctx.fillStyle = '#7070a0';
    ctx.fillText('QWER — nibble izq  │  UIOP — nibble der  │  H — tabla  │  ESPACIO — pausa  │  ESC — volver', W / 2, H - 22);

    ctx.font = '12px monospace'; ctx.fillStyle = '#303050'; ctx.textAlign = 'center';
    ctx.fillText('ℹ  Acerca de  ·  /docs', W / 2, H - 6);
  }

  // ─── Selección de nivel ───────────────────────────────────────────────────────
  _drawSelect() {
    const ctx = this.ctx;
    ctx.font = 'bold 32px monospace'; ctx.fillStyle = '#ffd700'; ctx.textAlign = 'center';
    ctx.fillText('Selecciona un nivel', W / 2, 56);

    const cardW = 720, cardH = 72, gap = 12;
    const cx = (W - cardW) / 2;
    const totalH = LEVEL_CONFIGS.length * (cardH + gap) - gap;
    const startY = (H - totalH) / 2 - 10;

    LEVEL_CONFIGS.forEach((cfg, i) => {
      const by = startY + i * (cardH + gap);
      const active = i === this.levelCursor;
      ctx.fillStyle = active ? '#0c180c' : '#0a0a1a';
      ctx.beginPath(); ctx.roundRect(cx, by, cardW, cardH, 12); ctx.fill();
      ctx.strokeStyle = active ? cfg.color : '#202040'; ctx.lineWidth = active ? 2.5 : 1;
      ctx.beginPath(); ctx.roundRect(cx, by, cardW, cardH, 12); ctx.stroke();
      ctx.font = 'bold 20px monospace'; ctx.fillStyle = active ? cfg.color : '#505070';
      ctx.textAlign = 'left'; ctx.fillText(cfg.name, cx + 20, by + 28);
      ctx.font = '14px monospace'; ctx.fillStyle = active ? '#9090b0' : '#383858';
      ctx.fillText(cfg.desc, cx + 20, by + 52);
      if (active) {
        ctx.font = 'bold 20px monospace'; ctx.fillStyle = cfg.color; ctx.textAlign = 'right';
        ctx.fillText('▶', cx + cardW - 16, by + cardH / 2 + 8);
      }
    });

    ctx.font = '14px monospace'; ctx.fillStyle = '#404060'; ctx.textAlign = 'center';
    ctx.fillText('▲ ▼ para mover  ·  ENTER para jugar  ·  ESC para volver', W / 2, H - 18);
  }

  // ─── Lobby de sala ────────────────────────────────────────────────────────────
  _drawLobby() {
    const ctx = this.ctx;

    ctx.font = 'bold 28px monospace'; ctx.fillStyle = '#00c8ff'; ctx.textAlign = 'center';
    ctx.fillText('SALA MULTIJUGADOR', W / 2, 70);

    // Código de sala grande
    ctx.font = '18px monospace'; ctx.fillStyle = '#7070a0'; ctx.textAlign = 'center';
    ctx.fillText('Código para unirse:', W / 2, 115);
    ctx.font = 'bold 52px monospace'; ctx.fillStyle = '#ffd700';
    ctx.fillText(this.roomCode || '----', W / 2, 175);
    ctx.font = '13px monospace'; ctx.fillStyle = '#505070';
    ctx.fillText('(Comparte este código con tus compañeros)', W / 2, 200);

    // Lista de jugadores
    ctx.font = '15px monospace'; ctx.fillStyle = '#8888aa';
    ctx.fillText(`Jugadores en sala: ${this.roomPlayers.length}`, W / 2, 240);

    const cardW = 340, cardH = 36, gap = 6;
    const cx = (W - cardW) / 2;
    const maxShow = Math.min(this.roomPlayers.length, 10);
    const listStartY = 258;

    for (let i = 0; i < maxShow; i++) {
      const p = this.roomPlayers[i];
      const by = listStartY + i * (cardH + gap);
      const isMe = p.nick === this.roomNick;
      const isCreator = p.nick === this.roomCreator;

      ctx.fillStyle = isMe ? '#0a1020' : '#08091c';
      ctx.beginPath(); ctx.roundRect(cx, by, cardW, cardH, 6); ctx.fill();
      ctx.strokeStyle = isMe ? '#00c8ff' : '#1e2040'; ctx.lineWidth = isMe ? 1.5 : 1;
      ctx.beginPath(); ctx.roundRect(cx, by, cardW, cardH, 6); ctx.stroke();

      ctx.font = isMe ? 'bold 15px monospace' : '15px monospace';
      ctx.fillStyle = isMe ? '#00c8ff' : '#f0f0fa';
      ctx.textAlign = 'left';
      ctx.fillText(p.nick + (isCreator ? '  👑' : ''), cx + 14, by + 23);
    }

    const playBx = (W - 200) / 2, playBy = H - 90;
    ctx.fillStyle = '#005a28';
    ctx.beginPath(); ctx.roundRect(playBx, playBy, 200, 48, 10); ctx.fill();
    ctx.strokeStyle = '#00e650'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(playBx, playBy, 200, 48, 10); ctx.stroke();
    ctx.font = 'bold 18px monospace'; ctx.fillStyle = '#00e650'; ctx.textAlign = 'center';
    ctx.fillText('▶  JUGAR', W / 2, playBy + 31);

    // Botón salir
    const bw = 140, bh = 36, bx = (W - 140) / 2, by2 = H - 36;
    ctx.fillStyle = '#1a0a0a';
    ctx.beginPath(); ctx.roundRect(bx, by2, bw, bh, 8); ctx.fill();
    ctx.strokeStyle = '#602020'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by2, bw, bh, 8); ctx.stroke();
    ctx.font = '14px monospace'; ctx.fillStyle = '#804040'; ctx.textAlign = 'center';
    ctx.fillText('Salir de sala', W / 2, by2 + 24);
  }

  // ─── Tabla hex/bin ────────────────────────────────────────────────────────────
  _drawHints() {
    const ctx = this.ctx;
    const bw = 68, bh = 17, perCol = 8;
    const ox = 6, oy = GROUND_Y + 6;
    const tw = bw * 2 + 4, th = perCol * bh + 8;

    ctx.fillStyle = 'rgba(4,5,16,0.60)';
    ctx.beginPath(); ctx.roundRect(ox - 4, oy - 4, tw, th, 7); ctx.fill();
    ctx.strokeStyle = '#1e2040'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(ox - 4, oy - 4, tw, th, 7); ctx.stroke();

    ctx.font = '12px monospace'; ctx.textAlign = 'left';
    for (let i = 0; i < 16; i++) {
      const col = (i / perCol) | 0, row = i % perCol;
      const x = ox + col * bw, y = oy + row * bh + 12;
      ctx.fillStyle = '#ffd700'; ctx.fillText(HEX[i], x, y);
      ctx.fillStyle = '#383850'; ctx.fillText('=', x + 11, y);
      ctx.fillStyle = '#00c8ff'; ctx.fillText(i.toString(2).padStart(4, '0'), x + 22, y);
    }
  }

  // ─── Pausa ────────────────────────────────────────────────────────────────────
  _drawPause() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(4,5,20,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = 'bold 52px monospace'; ctx.fillStyle = '#ffd700'; ctx.textAlign = 'center';
    ctx.fillText('PAUSA', W / 2, H / 2 - 20);
    ctx.font = '18px monospace'; ctx.fillStyle = '#505070';
    ctx.fillText('Pulsa P para reanudar', W / 2, H / 2 + 28);
  }

  // ─── Game Over ────────────────────────────────────────────────────────────────
  _drawGameOver() {
    const ctx = this.ctx;
    ctx.font = 'bold 62px monospace'; ctx.fillStyle = '#ff3c3c'; ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 70);

    ctx.font = 'bold 26px monospace'; ctx.fillStyle = '#f0f0fa';
    ctx.fillText(`Puntuación: ${this.score}`, W / 2, H / 2);

    if (this.gameMode === 'libre') {
      ctx.font = 'bold 22px monospace'; ctx.fillStyle = '#ffd700';
      ctx.fillText(`Nivel alcanzado: ${this.level}`, W / 2, H / 2 + 42);
    } else {
      ctx.font = 'bold 22px monospace'; ctx.fillStyle = this.fixedConfig.color;
      ctx.fillText(this.fixedConfig.name, W / 2, H / 2 + 42);
    }

    if (this.roomCode) {
      ctx.font = '16px monospace'; ctx.fillStyle = '#7070a0';
      ctx.fillText('ENTER — reintentar  ·  ESC — salir de sala', W / 2, H / 2 + 95);
    } else {
      ctx.font = '18px monospace'; ctx.fillStyle = '#505070';
      ctx.fillText('ENTER — reintentar  ·  ESC — menú principal', W / 2, H / 2 + 95);
    }
  }

  // ─── Podio ────────────────────────────────────────────────────────────────────
  _drawPodium() {
    const ctx = this.ctx;
    const d = this.podiumData;
    if (!d) return;

    // Fondo semitransparente
    ctx.fillStyle = 'rgba(4,5,16,0.94)';
    ctx.fillRect(0, 0, W, H);

    // ── Título ───────────────────────────────────────────────────────────────
    ctx.font = 'bold 38px monospace'; ctx.fillStyle = '#ffd700'; ctx.textAlign = 'center';
    ctx.fillText('🏆  PODIO  🏆', W / 2, 52);

    // ── Top 3 compacto ────────────────────────────────────────────────────────
    const podiumColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    const podiumLabels = ['①', '②', '③'];
    const podiumSizes  = [30, 25, 21];
    const podiumY      = [95, 135, 168];

    (d.top || []).forEach((p, i) => {
      ctx.font = `bold ${podiumSizes[i]}px monospace`;
      ctx.fillStyle = podiumColors[i];
      ctx.textAlign = 'left';
      const nick = p.nick.length > 14 ? p.nick.slice(0, 13) + '…' : p.nick;
      ctx.fillText(`${podiumLabels[i]}  ${nick}`, W / 2 - 200, podiumY[i]);
      ctx.textAlign = 'right';
      ctx.fillText(`${p.score} pts`, W / 2 + 200, podiumY[i]);
    });

    // ── Separador ─────────────────────────────────────────────────────────────
    ctx.strokeStyle = '#1e2040'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(60, 190); ctx.lineTo(W - 60, 190); ctx.stroke();
    ctx.font = '12px monospace'; ctx.fillStyle = '#404060'; ctx.textAlign = 'center';
    ctx.fillText('─── Clasificación completa ───', W / 2, 205);

    // ── Ranking completo en 2 columnas ────────────────────────────────────────
    const all = d.all || [];
    const rowH = 19, startY = 222;
    const half = Math.ceil(all.length / 2);
    const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

    all.forEach((p, i) => {
      const col   = i < half ? 0 : 1;
      const row   = i < half ? i : i - half;
      const x     = col === 0 ? 55 : W / 2 + 10;
      const y     = startY + row * rowH;
      const color = i < 3 ? rankColors[i] : '#707090';
      const nick  = p.nick.length > 12 ? p.nick.slice(0, 11) + '…' : p.nick;

      ctx.font = i < 3 ? 'bold 13px monospace' : '13px monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${nick}`, x, y);
      ctx.textAlign = 'right';
      ctx.fillText(`${p.score}`, col === 0 ? W / 2 - 10 : W - 55, y);
    });

    // ── Volver ────────────────────────────────────────────────────────────────
    ctx.font = '14px monospace'; ctx.fillStyle = '#505070'; ctx.textAlign = 'center';
    ctx.fillText('ENTER / clic — volver al menú', W / 2, H - 22);
  }

  // ─── Acerca de ───────────────────────────────────────────────────────────────
  _drawAbout() {
    const ctx = this.ctx;

    ctx.font = 'bold 32px monospace'; ctx.fillStyle = '#00e650'; ctx.textAlign = 'center';
    ctx.fillText('HexInvaders', W / 2, 80);

    ctx.font = '14px monospace'; ctx.fillStyle = '#7070a0'; ctx.textAlign = 'center';
    ctx.fillText('Juego educativo para aprender hexadecimal y binario', W / 2, 112);

    // Bloque autor
    const bx = (W - 500) / 2, by = 148;
    ctx.fillStyle = '#08091c';
    ctx.beginPath(); ctx.roundRect(bx, by, 500, 90, 10); ctx.fill();
    ctx.strokeStyle = '#1e2040'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, 500, 90, 10); ctx.stroke();

    ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#00c8ff'; ctx.textAlign = 'center';
    ctx.fillText('Autor', W / 2, by + 24);
    ctx.font = '15px monospace'; ctx.fillStyle = '#f0f0fa';
    ctx.fillText('José Manuel Lizana Jiménez', W / 2, by + 48);
    ctx.font = '13px monospace'; ctx.fillStyle = '#7070a0';
    ctx.fillText('Departamento de Informática · IES Ciudad Jardín', W / 2, by + 68);

    // Licencia
    const ly = 268;
    ctx.fillStyle = '#08091c';
    ctx.beginPath(); ctx.roundRect(bx, ly, 500, 80, 10); ctx.fill();
    ctx.strokeStyle = '#1e2040'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, ly, 500, 80, 10); ctx.stroke();

    ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#ffd700'; ctx.textAlign = 'center';
    ctx.fillText('Licencia', W / 2, ly + 24);
    ctx.font = '14px monospace'; ctx.fillStyle = '#f0f0fa';
    ctx.fillText('Creative Commons BY-SA 4.0', W / 2, ly + 47);
    ctx.font = '11px monospace'; ctx.fillStyle = '#606080';
    ctx.fillText('Libre uso, modificación y redistribución con atribución y misma licencia', W / 2, ly + 65);

    // Tecnologías
    const ty = 376;
    ctx.fillStyle = '#08091c';
    ctx.beginPath(); ctx.roundRect(bx, ty, 500, 140, 10); ctx.fill();
    ctx.strokeStyle = '#1e2040'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, ty, 500, 110, 10); ctx.stroke();

    ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#b43cff'; ctx.textAlign = 'center';
    ctx.fillText('Tecnologías', W / 2, ty + 24);

    const techs = [
      ['Backend',    'Python · Flask · Flask-SocketIO · Gunicorn'],
      ['Frontend',   'JavaScript · HTML5 Canvas · Web Audio API'],
      ['Despliegue', 'Docker · Docker Compose'],
    ];
    techs.forEach(([label, value], i) => {
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px monospace'; ctx.fillStyle = '#8888aa';
      ctx.fillText(`${label}:`, W / 2, ty + 46 + i * 24);
      ctx.font = '12px monospace'; ctx.fillStyle = '#c0c0d8';
      ctx.fillText(value, W / 2, ty + 60 + i * 24);
    });

    // Año
    ctx.font = '12px monospace'; ctx.fillStyle = '#404060'; ctx.textAlign = 'center';
    ctx.fillText(`© 2025  ·  hexinvaders`, W / 2, ty + 100);

    // Enlace docs (clicable)
    const docsText = '📄 Documentación técnica → /docs';
    ctx.font = '13px monospace'; ctx.fillStyle = '#00c8ff'; ctx.textAlign = 'center';
    ctx.fillText(docsText, W / 2, 522);
    const docsW = ctx.measureText(docsText).width;
    ctx.fillRect(W / 2 - docsW / 2, 524, docsW, 1);

    ctx.font = '13px monospace'; ctx.fillStyle = '#404060'; ctx.textAlign = 'center';
    ctx.fillText('ENTER / ESC — volver', W / 2, H - 12);
  }
}

// ─── Arranque ─────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  const img = new Image();
  img.onload = () => {
    const tmp = document.createElement('canvas');
    tmp.width = img.naturalWidth; tmp.height = img.naturalHeight;
    const tc = tmp.getContext('2d');
    tc.drawImage(img, 0, 0);
    const d = tc.getImageData(0, 0, tmp.width, tmp.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const r = d.data[i], g = d.data[i+1], b = d.data[i+2];
      if (r < 110 && g < 70 && b < 120) d.data[i+3] = 0;
    }
    tc.putImageData(d, 0, 0);
    SHIP_CANVAS = tmp;
  };
  img.src = '/static/nave.png';
  new Game(document.getElementById('game'));
});
