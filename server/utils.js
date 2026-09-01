const crypto = require('crypto');
const config = require('./config');

function hashPassword(pwd, salt) {
  const s = salt || crypto.randomBytes(8).toString('hex');
  const h = crypto.scryptSync(String(pwd), s, 32).toString('hex');
  return `${s}:${h}`;
}

function verifyPassword(pwd, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [s, h] = stored.split(':');
  try {
    return crypto.timingSafeEqual(Buffer.from(crypto.scryptSync(String(pwd), s, 32).toString('hex')), Buffer.from(h));
  } catch (e) {
    return false;
  }
}

function signToken(payload, ttlSec = 60 * 60 * 24 * 30) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSec * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', config.SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [body, sig] = String(token).split('.');
    const expect = crypto.createHmac('sha256', config.SECRET).update(body).digest('base64url');
    if (expect !== sig) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// 地球距离（km）
function distance(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}

function age(birthday) {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (isNaN(b)) return null;
  const d = new Date();
  let a = d.getFullYear() - b.getFullYear();
  const m = d.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) a--;
  return a;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const AVATAR_EMOJI = ['🦊','🐼','🐯','🐨','🐸','🐵','🦁','🐷','🐮','🐔','🦄','🐙','🐳','🦋','🌸','🍑','🍓','🌙','⭐','🔥','💫','🎧','🎮','🍭'];
function emojiFor(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_EMOJI[h % AVATAR_EMOJI.length];
}

function hueFor(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 131 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

module.exports = {
  hashPassword, verifyPassword, signToken, verifyToken,
  distance, age, pick, todayKey, shuffle, emojiFor, hueFor,
};
