let fsToggleBtn = null;
let dialogFsBtn = null;
let dialogActions = null;

function fsElement() {
  return document.documentElement;
}

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export async function toggleFullscreen() {
  try {
    if (!isFullscreen()) {
      const el = fsElement();
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } else if (document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch {
    /* 部分瀏覽器需手勢或不支援 */
  }
  updateFullscreenButtons();
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

export function initFullscreen() {
  fsToggleBtn = document.getElementById('fs-toggle-btn');
  dialogFsBtn = document.getElementById('dialog-fs-btn');
  dialogActions = document.getElementById('dialog-actions');

  if (fsToggleBtn) {
    fsToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFullscreen();
    });
  }
  if (dialogFsBtn) {
    dialogFsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFullscreen();
    });
  }

  document.addEventListener('fullscreenchange', updateFullscreenButtons);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButtons);
  updateFullscreenButtons();
}
