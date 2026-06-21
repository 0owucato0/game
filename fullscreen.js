import { showToast } from './state.js';

let fsToggleBtn = null;
let dialogFsBtn = null;
let dialogActions = null;
let suppressClick = false;

const IMMERSIVE_CLASS = 'mobile-immersive';

function isMobileCoarse() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function fsTarget() {
  return document.getElementById('game-shell') || document.documentElement;
}

function shellEl() {
  return document.getElementById('game-shell');
}

function isImmersive() {
  return shellEl()?.classList.contains(IMMERSIVE_CLASS) ?? false;
}

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement) || isImmersive();
}

function enterImmersive() {
  const shell = shellEl();
  if (!shell) return false;
  shell.classList.add(IMMERSIVE_CLASS);
  document.documentElement.classList.add('fs-active');
  requestAnimationFrame(() => {
    window.scrollTo(0, 1);
    setTimeout(() => window.scrollTo(0, 1), 120);
  });
  try {
    screen.orientation?.lock?.('landscape').catch(() => {});
  } catch {
    /* 部分瀏覽器不支援 */
  }
  return true;
}

function exitImmersive() {
  shellEl()?.classList.remove(IMMERSIVE_CLASS);
  document.documentElement.classList.remove('fs-active');
  try {
    screen.orientation?.unlock?.();
  } catch {
    /* 略過 */
  }
}

async function requestNativeFullscreen(el) {
  const opts = { navigationUI: 'hide' };
  if (el.requestFullscreen) {
    await el.requestFullscreen(opts);
    return true;
  }
  if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen();
    return true;
  }
  return false;
}

async function exitNativeFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
}

export async function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      await exitNativeFullscreen();
      exitImmersive();
    } else {
      const el = fsTarget();
      let ok = false;
      try {
        ok = await requestNativeFullscreen(el);
      } catch {
        ok = false;
      }
      if (!ok && isMobileCoarse()) {
        ok = enterImmersive();
        if (ok) showToast('已進入全螢幕模式（再按一次可還原）');
      } else if (!ok) {
        showToast('此瀏覽器不支援全螢幕，請用瀏覽器選單切換');
      }
    }
  } catch {
    if (!isFullscreen() && isMobileCoarse()) {
      enterImmersive();
      showToast('已進入全螢幕模式（再按一次可還原）');
    }
  }
  updateFullscreenButtons();
  window.dispatchEvent(new Event('resize'));
}

export function updateFullscreenButtons() {
  const on = isFullscreen();
  const label = on ? '還原視窗' : '全螢幕';
  if (fsToggleBtn) {
    fsToggleBtn.textContent = on ? '⛶ 還原' : '⛶ 全螢幕';
    fsToggleBtn.setAttribute('aria-label', label);
    fsToggleBtn.title = label;
  }
  if (dialogFsBtn) {
    dialogFsBtn.textContent = on ? '還原視窗' : '全螢幕遊玩';
  }
}

export function setDialogFullscreenVisible(visible) {
  if (dialogActions) dialogActions.hidden = !visible;
}

function bindFsButton(btn) {
  if (!btn) return;
  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    suppressClick = true;
    toggleFullscreen();
    setTimeout(() => { suppressClick = false; }, 500);
  }, { passive: false });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (suppressClick) return;
    toggleFullscreen();
  });
}

export function initFullscreen() {
  fsToggleBtn = document.getElementById('fs-toggle-btn');
  dialogFsBtn = document.getElementById('dialog-fs-btn');
  dialogActions = document.getElementById('dialog-actions');

  bindFsButton(fsToggleBtn);
  bindFsButton(dialogFsBtn);

  document.addEventListener('fullscreenchange', updateFullscreenButtons);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButtons);
  updateFullscreenButtons();
}
