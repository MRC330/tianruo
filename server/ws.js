const { verifyToken } = require('./utils');
const { q } = require('./store');

const sockets = new Map(); // uid -> Set<ws>

function attach(server) {
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    let uid = null;
    const url = new URL(req.url, 'http://x');
    const token = url.searchParams.get('token');
    const payload = token ? verifyToken(token) : null;
    if (payload) uid = payload.uid;
    if (!uid) {
      try { ws.close(4001, 'unauthorized'); } catch (e) {}
      return;
    }
    if (!sockets.has(uid)) sockets.set(uid, new Set());
    sockets.get(uid).add(ws);
    const u = q.one('users', 'id', uid);
    if (u) { u.online = true; u.lastActive = Date.now(); }
    broadcastOnline(uid, true);

    ws.on('message', (raw) => {
      let data;
      try { data = JSON.parse(raw); } catch (e) { return; }
      if (data.type === 'ping') send(ws, { type: 'pong', t: Date.now() });
      if (data.type === 'typing' && data.matchId) {
        const m = q.one('matches', 'id', data.matchId);
        if (!m || !m.users.includes(uid)) return;
        const other = m.users.find((x) => x !== uid);
        pushTo(other, { type: 'typing', matchId: data.matchId, userId: uid });
      }
    });

    ws.on('close', () => {
      const set = sockets.get(uid);
      if (set) { set.delete(ws); if (!set.size) { sockets.delete(uid); const uu = q.one('users', 'id', uid); if (uu) { uu.online = false; uu.lastActive = Date.now(); } broadcastOnline(uid, false); } }
    });

    send(ws, { type: 'hello', uid, t: Date.now() });
  });

  // 心跳
  const timer = setInterval(() => {
    sockets.forEach((set) => set.forEach((ws) => {
      if (ws.readyState !== 1) return;
      try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {}
    }));
  }, 25000);
  timer.unref && timer.unref();

  return wss;
}

function send(ws, data) {
  try { ws.send(JSON.stringify(data)); } catch (e) {}
}

function pushTo(uid, data) {
  const set = sockets.get(uid);
  if (!set) return false;
  let hit = false;
  set.forEach((ws) => { if (ws.readyState === 1) { send(ws, data); hit = true; } });
  return hit;
}

function broadcastOnline(uid, online) {
  // 通知所有相关会话的对方
  const { db } = require('./store');
  const mates = new Set();
  db.matches.forEach((m) => { if (m.users.includes(uid)) m.users.forEach((x) => x !== uid && mates.add(x)); });
  mates.forEach((id) => pushTo(id, { type: 'online', userId: uid, online }));
}

module.exports = { attach, pushTo, sockets };
