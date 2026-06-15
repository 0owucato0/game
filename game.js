/**
 * 職人級 2D 橫向捲軸物理解謎 — 階段一
 * PixiJS v7 + Matter.js（CDN 全域）+ levels.js（ESM）
 */

import { LEVELS, ITEM_NAMES } from './levels.js';

const { Engine, World, Bodies, Body, Composite, Events } = Matter;

// ─── 設計解析度（21:9 內部座標）────────────────────────────
const DESIGN_W = 1680;
const DESIGN_H = 720;
const PLAYER_W = 36;
const PLAYER_H = 52;
const INTERACT_RANGE = 80;
const MOVE_FORCE = 0.008;
const MAX_SPEED = 9;

// ─── DOM ───────────────────────────────────────────────────
const shell = document.getElementById('game-shell');
const canvasHost = document.getElementById('game-canvas');
const levelTitleEl = document.getElementById('level-title');
const inventoryEl = document.getElementById('inventory-panel');
const toastEl = document.getElementById('toast');
const victoryOverlay = document.getElementById('victory-overlay');

// ─── 遊戲狀態 ───────────────────────────────────────────────
let app;
let worldContainer;
let bgContainer;
let entityContainer;
let playerGfx;
let engine;
let world;
let playerBody;
let currentLevelIndex = 0;
let levelState = null;
let cameraX = 0;
let inventory = [];
let toastTimer = null;
let victoryTriggered = false;
let interactPressed = false;
let interactLatch = false;

const input = {
  left: false,
  right: false,
  jump: false,
  interact: false,
};

// ─── 工具 ───────────────────────────────────────────────────
function showToast(message, duration = 2800) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
}

function updateInventoryUI() {
  if (inventory.length === 0) {
    inventoryEl.innerHTML = '背包：<span>（空）</span>';
    return;
  }
  const labels = inventory.map((id) => ITEM_NAMES[id] || id);
  inventoryEl.innerHTML = `背包：<span>${labels.join('、')}</span>`;
}

function hasItem(id) {
  return inventory.includes(id);
}

function addItem(id) {
  if (!hasItem(id)) inventory.push(id);
  updateInventoryUI();
  tryCraftPickaxe();
}

function removeItem(id) {
  const idx = inventory.indexOf(id);
  if (idx !== -1) inventory.splice(idx, 1);
  updateInventoryUI();
}

function tryCraftPickaxe() {
  if (hasItem('pickaxe')) return;
  if (hasItem('wood') && hasItem('stone_pile')) {
    removeItem('wood');
    removeItem('stone_pile');
    addItem('pickaxe');
    showToast('🔨 木頭與碎石已合成：石稿！');
  }
}

function cloneEntity(ent) {
  return { ...ent, gfx: null, body: null };
}

function deepCloneLevel(level) {
  return {
    ...level,
    entities: level.entities.map(cloneEntity),
    platforms: level.platforms.map((p) => ({ ...p })),
  };
}

// ─── 輸入 ───────────────────────────────────────────────────
function onKeyDown(e) {
  switch (e.code) {
    case 'ArrowLeft':
    case 'KeyA':
      input.left = true;
      e.preventDefault();
      break;
    case 'ArrowRight':
    case 'KeyD':
      input.right = true;
      e.preventDefault();
      break;
    case 'Space':
      input.jump = true;
      e.preventDefault();
      break;
    case 'KeyE':
      input.interact = true;
      e.preventDefault();
      break;
    default:
      break;
  }
}

function onKeyUp(e) {
  switch (e.code) {
    case 'ArrowLeft':
    case 'KeyA':
      input.left = false;
      break;
    case 'ArrowRight':
    case 'KeyD':
      input.right = false;
      break;
    case 'Space':
      input.jump = false;
      break;
    case 'KeyE':
      input.interact = false;
      interactLatch = false;
      break;
    default:
      break;
  }
}

window.addEventListener('game-input', (e) => {
  const { action, pressed } = e.detail;
  if (action === 'left') input.left = pressed;
  if (action === 'right') input.right = pressed;
  if (action === 'jump') input.jump = pressed;
  if (action === 'interact') {
    input.interact = pressed;
    if (!pressed) interactLatch = false;
  }
});

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);

// ─── Pixi 初始化 ────────────────────────────────────────────
function initPixi() {
  app = new PIXI.Application({
    width: DESIGN_W,
    height: DESIGN_H,
    backgroundColor: 0x0a0f1a,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  canvasHost.appendChild(app.view);

  bgContainer = new PIXI.Container();
  worldContainer = new PIXI.Container();
  entityContainer = new PIXI.Container();

  worldContainer.addChild(bgContainer);
  worldContainer.addChild(entityContainer);
  app.stage.addChild(worldContainer);

  resizeRenderer();
  window.addEventListener('resize', resizeRenderer);
}

function resizeRenderer() {
  const rect = shell.getBoundingClientRect();
  app.renderer.resize(rect.width, rect.height);
  const scale = Math.min(rect.width / DESIGN_W, rect.height / DESIGN_H);
  app.stage.scale.set(scale);
  app.stage.position.set(
    (rect.width - DESIGN_W * scale) / 2,
    (rect.height - DESIGN_H * scale) / 2,
  );
}

// ─── Matter 初始化 ──────────────────────────────────────────
function initPhysics() {
  engine = Engine.create({ gravity: { x: 0, y: 1.2 } });
  world = engine.world;
}

// ─── 視覺：背景與平台 ───────────────────────────────────────
function drawLevelBackground(level) {
  bgContainer.removeChildren();

  const sky = new PIXI.Graphics();
  sky.beginFill(0x0f172a);
  sky.drawRect(0, 0, level.length + 400, DESIGN_H);
  sky.endFill();
  bgContainer.addChild(sky);

  const farHills = new PIXI.Graphics();
  farHills.beginFill(0x1e293b, 0.6);
  for (let x = -100; x < level.length + 200; x += 280) {
    farHills.drawEllipse(x, 380, 200, 90);
  }
  farHills.endFill();
  bgContainer.addChild(farHills);

  const groundStrip = new PIXI.Graphics();
  groundStrip.beginFill(0x14532d);
  groundStrip.drawRect(0, level.groundY, level.length, DESIGN_H - level.groundY);
  groundStrip.endFill();
  bgContainer.addChild(groundStrip);

  level.platforms.forEach((plat, i) => {
    const g = new PIXI.Graphics();
    const colors = [0x365314, 0x3f6212, 0x4d7c0f];
    g.beginFill(colors[i % colors.length]);
    g.drawRoundedRect(plat.x, plat.y, plat.w, plat.h, 6);
    g.endFill();
    bgContainer.addChild(g);
  });
}

function createEntityGraphic(ent) {
  const g = new PIXI.Graphics();
  const w = ent.width;
  const h = ent.height;
  const cx = ent.x;
  const cy = ent.y;

  switch (ent.type) {
    case 'item':
      g.beginFill(ent.color);
      if (ent.id === 'honey') {
        g.drawEllipse(cx, cy + h / 2, w / 2, h / 2);
        g.beginFill(0xffeb3b, 0.5);
        g.drawCircle(cx - 8, cy + 8, 6);
      } else if (ent.id === 'glow_stone') {
        g.drawCircle(cx, cy + h / 2, w / 2);
        g.beginFill(0xffffff, 0.35);
        g.drawCircle(cx - 6, cy + 10, 8);
      } else {
        g.drawRoundedRect(cx - w / 2, cy, w, h, 8);
      }
      g.endFill();
      break;
    case 'npc':
      g.beginFill(ent.color);
      g.drawRoundedRect(cx - w / 2, cy, w, h, 12);
      g.endFill();
      g.beginFill(0x5d4037);
      g.drawCircle(cx - 14, cy + 18, 10);
      g.drawCircle(cx + 14, cy + 18, 10);
      g.endFill();
      break;
    case 'obstacle':
      g.beginFill(ent.color);
      for (let i = 0; i < 5; i++) {
        g.drawRect(cx - w / 2 + i * 10, cy + i * 18, 8, h - i * 18);
      }
      g.endFill();
      break;
    case 'portal':
      g.beginFill(ent.color);
      g.drawEllipse(cx, cy + h / 2, w / 2, h / 2);
      g.endFill();
      g.beginFill(0x1b5e20, 0.5);
      g.drawEllipse(cx, cy + h / 2 + 8, w / 3, h / 3);
      g.endFill();
      break;
    default:
      g.beginFill(0xffffff);
      g.drawRect(cx - 20, cy, 40, 40);
      g.endFill();
  }

  const label = new PIXI.Text(ent.name, {
    fontFamily: 'Microsoft JhengHei, sans-serif',
    fontSize: 14,
    fill: 0xe2e8f0,
  });
  label.anchor.set(0.5, 1);
  label.position.set(cx, cy - 4);
  g.addChild(label);

  return g;
}

function createPlayerGraphic() {
  const g = new PIXI.Graphics();
  g.beginFill(0x38bdf8);
  g.drawRoundedRect(-PLAYER_W / 2, 0, PLAYER_W, PLAYER_H, 8);
  g.endFill();
  g.beginFill(0xf8fafc);
  g.drawCircle(0, 14, 8);
  g.endFill();
  return g;
}

// ─── 物理：平台與實體剛體 ───────────────────────────────────
function buildPlatforms(level) {
  const bodies = [];
  level.platforms.forEach((plat) => {
    const body = Bodies.rectangle(
      plat.x + plat.w / 2,
      plat.y + plat.h / 2,
      plat.w,
      plat.h,
      { isStatic: true, friction: 0.8, label: 'platform' },
    );
    bodies.push(body);
  });
  return bodies;
}

function createEntityBody(ent, level) {
  const w = ent.width;
  const h = ent.height;
  const cx = ent.x;
  const cy = ent.y + h / 2;

  return Bodies.rectangle(cx, cy, w, h, {
    isStatic: true,
    friction: 0.6,
    label: `entity_${ent.id}`,
  });
}

function syncEntityPhysics(ent) {
  if (ent.isSolid && ent.active && !ent.body) {
    ent.body = createEntityBody(ent, levelState);
    Composite.add(world, ent.body);
  } else if ((!ent.isSolid || !ent.active) && ent.body) {
    Composite.remove(world, ent.body);
    ent.body = null;
  }
}

function rebuildEntityVisuals() {
  entityContainer.removeChildren();
  levelState.entities.forEach((ent) => {
    if (!ent.active) return;
    ent.gfx = createEntityGraphic(ent);
    entityContainer.addChild(ent.gfx);
    syncEntityPhysics(ent);
  });

  if (!playerGfx) {
    playerGfx = createPlayerGraphic();
  }
  entityContainer.addChild(playerGfx);
}

// ─── 關卡載入 ───────────────────────────────────────────────
function loadLevel(index, resetInventory = false) {
  if (resetInventory) inventory = [];

  currentLevelIndex = index;
  const src = LEVELS[index];
  levelState = deepCloneLevel(src);

  levelTitleEl.textContent = `關卡 ${src.id}：${src.name}`;
  updateInventoryUI();

  Composite.clear(world, false);
  Engine.clear(engine);

  const platformBodies = buildPlatforms(levelState);
  Composite.add(world, platformBodies);

  const spawn = levelState.spawn;
  if (playerBody) {
    Composite.remove(world, playerBody);
  }

  playerBody = Bodies.rectangle(
    spawn.x,
    spawn.y + PLAYER_H / 2,
    PLAYER_W,
    PLAYER_H,
    {
      friction: 0.02,
      frictionAir: 0.02,
      restitution: 0,
      density: 0.002,
      label: 'player',
    },
  );

  Composite.add(world, playerBody);

  drawLevelBackground(levelState);
  rebuildEntityVisuals();
  cameraX = 0;
  victoryTriggered = false;
  victoryOverlay.classList.remove('show');
}

// ─── 相機 ───────────────────────────────────────────────────
function updateCamera() {
  const level = levelState;
  const px = playerBody.position.x;
  const maxCam = Math.max(0, level.length - DESIGN_W);
  const target = px - DESIGN_W * 0.35;
  cameraX = Math.max(0, Math.min(target, maxCam));
  worldContainer.position.x = -cameraX;
}

// ─── 玩家控制 ───────────────────────────────────────────────
function isOnGround() {
  const feet = {
    x: playerBody.position.x,
    y: playerBody.bounds.max.y + 3,
  };
  const statics = Composite.allBodies(world).filter((b) => b.isStatic);
  return Matter.Query.point(statics, feet).length > 0;
}

function updatePlayer() {
  if (victoryTriggered) return;

  const body = playerBody;
  let vx = body.velocity.x;

  if (input.left) {
    Body.applyForce(body, body.position, { x: -MOVE_FORCE, y: 0 });
    vx -= 0.15;
  }
  if (input.right) {
    Body.applyForce(body, body.position, { x: MOVE_FORCE, y: 0 });
    vx += 0.15;
  }

  vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vx));
  Body.setVelocity(body, { x: vx, y: body.velocity.y });

  if (input.jump && isOnGround()) {
    Body.setVelocity(body, { x: body.velocity.x, y: -13 });
  }

  const edge = levelState.length - 30;
  if (body.position.x < 20) {
    Body.setPosition(body, { x: 20, y: body.position.y });
  }
  if (body.position.x > edge) {
    Body.setPosition(body, { x: edge, y: body.position.y });
  }

  if (input.interact && !interactLatch) {
    interactLatch = true;
    checkInteraction();
  }
}

function syncPlayerGraphic() {
  const { x, y } = playerBody.position;
  playerGfx.position.set(x - PLAYER_W / 2, y - PLAYER_H / 2);
}

// ─── 互動系統 ───────────────────────────────────────────────
function findNearestInteractable() {
  const px = playerBody.position.x;
  let nearest = null;
  let minDist = INTERACT_RANGE + 1;

  levelState.entities.forEach((ent) => {
    if (!ent.active) return;
    const dist = Math.abs(px - ent.x);
    if (dist < INTERACT_RANGE && dist < minDist) {
      minDist = dist;
      nearest = ent;
    }
  });

  return nearest;
}

function removeEntity(ent) {
  ent.active = false;
  if (ent.gfx) {
    entityContainer.removeChild(ent.gfx);
    ent.gfx.destroy();
    ent.gfx = null;
  }
  syncEntityPhysics(ent);
}

function checkInteraction() {
  const ent = findNearestInteractable();
  if (!ent) {
    showToast('附近沒有可互動的物件');
    return;
  }

  switch (ent.type) {
    case 'item':
      collectItem(ent);
      break;
    case 'npc':
      interactBear(ent);
      break;
    case 'obstacle':
      interactFence(ent);
      break;
    case 'portal':
      usePortal(ent);
      break;
    default:
      break;
  }
}

function collectItem(ent) {
  addItem(ent.id);
  showToast(`獲得：${ent.name}`);
  removeEntity(ent);
}

function interactBear(ent) {
  if (!hasItem('honey')) {
    showToast('小熊盯著你：「能帶點蜂蜜給我嗎？」');
    return;
  }
  removeItem('honey');
  ent.isSolid = false;
  syncEntityPhysics(ent);
  showToast('🐻 小熊：「謝謝你！請從我身邊過去吧～」');
}

function interactFence(ent) {
  if (!hasItem('pickaxe')) {
    showToast('鐵柵欄太堅固了，需要石稿才能破壞');
    return;
  }
  ent.isSolid = false;
  syncEntityPhysics(ent);
  showToast('💥 石稿擊碎了鐵柵欄！');
}

function usePortal(ent) {
  if (ent.id !== 'exit_1' || ent.targetLevel !== 2) return;
  showToast('進入樹洞，前往下一關…');
  setTimeout(() => {
    loadLevel(1, false);
    Body.setPosition(playerBody, {
      x: LEVELS[1].spawn.x,
      y: LEVELS[1].spawn.y + PLAYER_H / 2,
    });
    Body.setVelocity(playerBody, { x: 0, y: 0 });
  }, 600);
}

function checkLevel2Victory() {
  if (currentLevelIndex !== 1 || victoryTriggered) return;
  if (playerBody.position.x > 3050) {
    victoryTriggered = true;
    victoryOverlay.classList.add('show');
  }
}

// ─── 主迴圈 ─────────────────────────────────────────────────
function gameLoop() {
  Engine.update(engine, 1000 / 60);
  updatePlayer();
  updateCamera();
  syncPlayerGraphic();
  checkLevel2Victory();
  requestAnimationFrame(gameLoop);
}

// ─── 啟動 ───────────────────────────────────────────────────
function boot() {
  if (typeof PIXI === 'undefined' || typeof Matter === 'undefined') {
    document.body.innerHTML =
      '<p style="color:#fff;text-align:center;padding:2rem">無法載入 PixiJS 或 Matter.js，請確認網路連線。</p>';
    return;
  }

  initPixi();
  initPhysics();
  loadLevel(0, true);
  gameLoop();
}

boot();
