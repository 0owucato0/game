/** Google Apps Script 後端網址（部署 Web App 後填入） */
export const API_URL = 'https://script.google.com/macros/s/AKfycbxIDnDYT3YdvqFwIFxGNbNX81SihASxDazapMNxyiom3v7JzYnH5T7cHJnlU38G63M3/exec';

const UUID_KEY = 'game_user_uuid';
const NAME_KEY = 'game_user_name';
export const MAX_NAME_LEN = 20;

export function sanitizeName(name) {
  return String(name ?? '').trim().slice(0, MAX_NAME_LEN);
}

export function getOrCreateUuid() {
  let uuid = localStorage.getItem(UUID_KEY);
  if (!uuid) {
    uuid = crypto.randomUUID();
    localStorage.setItem(UUID_KEY, uuid);
  }
  return uuid;
}

export function getDefaultPlayerName() {
  const short = getOrCreateUuid().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `玩家${short}`;
}

export function getPlayerName() {
  const saved = localStorage.getItem(NAME_KEY);
  if (saved && saved.trim()) return saved.trim();
  return getDefaultPlayerName();
}

export function setPlayerName(name) {
  const n = sanitizeName(name);
  if (!n) return;
  localStorage.setItem(NAME_KEY, n);
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRow(row, index) {
  if (!row || typeof row !== 'object') return null;
  const score = toNum(row.score ?? row.Score ?? row.points ?? row.highScore, 0);
  const name = String(row.name ?? row.playerName ?? row.nickname ?? row.player ?? '—').trim();
  return {
    rank: toNum(row.rank ?? row.Rank, index + 1),
    name: name || '—',
    score,
    uuid: String(row.uuid ?? row.UUID ?? '').trim(),
  };
}

function extractLeaderboard(data) {
  const candidates = [
    data.leaderboard,
    data.rankings,
    data.topList,
    data.rankList,
    data.topPlayers,
    data.list,
    data.players,
    data.rows,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c.map(normalizeRow).filter(Boolean);
  }
  return [];
}

function normalizeResponse(raw) {
  const data = raw?.data ?? raw ?? {};
  if (data.result === 'error') {
    throw new Error(data.message || 'API error');
  }

  const list = extractLeaderboard(data);
  const globalMax = toNum(
    data.globalMax ?? data.globalHigh ?? data.highestScore ?? data.topScore ?? data.maxScore,
    list.reduce((m, row) => Math.max(m, row.score), 0),
  );

  return {
    currentScore: data.currentScore ?? null,
    personalMax: toNum(data.personalMax, 0),
    myRank: data.myRank != null ? toNum(data.myRank, null) : null,
    totalPlayers: toNum(data.totalPlayers, list.length),
    globalMax,
    leaderboard: list,
  };
}

function isApiConfigured() {
  return API_URL && !API_URL.includes('YOUR_GAS');
}

/**
 * 上傳／查詢合一。name、score 皆選填；兩者皆空則為純查詢。
 */
export async function sendGameData(name, score) {
  getOrCreateUuid();

  const payload = { uuid: getOrCreateUuid() };
  if (name != null && String(name).trim()) {
    payload.name = sanitizeName(name);
    setPlayerName(payload.name);
  }
  if (score != null && typeof score === 'number' && !Number.isNaN(score)) {
    payload.score = score;
  }

  if (!isApiConfigured()) {
    return normalizeResponse({
      currentScore: payload.score ?? null,
      personalMax: payload.score ?? 0,
      myRank: 1,
      totalPlayers: 1,
      globalMax: payload.score ?? 0,
      leaderboard: [{
        rank: 1,
        name: payload.name ?? getPlayerName(),
        score: payload.score ?? 0,
      }],
    });
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);

  const text = await res.text();
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('API 回傳非 JSON');
  }

  const normalized = normalizeResponse(raw);
  if (window.__DEBUG__) {
    console.log('[leaderboard] raw:', raw, 'normalized:', normalized);
  }
  return normalized;
}
