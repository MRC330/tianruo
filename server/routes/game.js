/**
 * 玩法系统 v3.0：火花值 / 连续聊天 / 每日任务 / 签到 / 心动问答 / 随机闪聊
 */
const express = require('express');
const { db, q, saveSoon, uid } = require('../store');
const { auth, publicUser } = require('./user');
const { pushTo } = require('../ws');
const U = require('../utils');
const moderate = require('../moderation');

const router = express.Router();

/* ---------------- 火花值 & 等级 ---------------- */
/** 火花值 = 聊天消息数 + 互赞 + 连续天数加成。等级每 100 升一级 */
const LEVELS = [
  { lv: 1, name: '小火苗', min: 0 },
  { lv: 2, name: '火星', min: 50 },
  { lv: 3, name: '火花', min: 150 },
  { lv: 4, name: '烈焰', min: 400 },
  { lv: 5, name: '炽热', min: 900 },
  { lv: 6, name: '永恒之火', min: 2000 },
];
function levelOf(tianruo) {
  let cur = LEVELS[0];
  let next = LEVELS[1];
  for (let i = 0; i < LEVELS.length; i++) {
    if (tianruo >= LEVELS[i].min) { cur = LEVELS[i]; next = LEVELS[i + 1] || null; }
  }
  return { level: cur.lv, name: cur.name, next: next ? next.min : null, progress: next ? (tianruo - cur.min) / (next.min - cur.min) : 1 };
}

router.get('/tianruo', auth, (req, res) => {
  const ms = q.filter('matches', (m) => m.users.includes(req.uid));
  const total = ms.reduce((s, m) => s + (m.tianruo || 0), 0);
  res.json({ ok: true, total, ...levelOf(total), matches: ms.length });
});

router.get('/tianruo/:matchId', auth, (req, res) => {
  const m = q.one('matches', 'id', req.params.matchId);
  if (!m || !m.users.includes(req.uid)) return res.json({ ok: false, msg: '会话不存在' });
  res.json({ ok: true, tianruo: m.tianruo || 0, streak: m.streak || 0, lastChatDay: m.lastChatDay || '', ...levelOf(m.tianruo || 0) });
});

/* ---------------- 每日任务 & 签到 ---------------- */
const TASKS = [
  { id: 'login', name: '登录 天弱', reward: 5, icon: '🔑' },
  { id: 'swipe5', name: '滑动 5 次', reward: 10, icon: '👆', target: 5 },
  { id: 'like3', name: '喜欢 3 个人', reward: 15, icon: '💖', target: 3 },
  { id: 'chat1', name: '和一个匹配聊天', reward: 20, icon: '💬', target: 1 },
  { id: 'moment1', name: '发布 1 条动态', reward: 15, icon: '📝', target: 1 },
  { id: 'comment3', name: '评论 3 次', reward: 10, icon: '💭', target: 3 },
];

function todayTask(u) {
  const key = U.todayKey();
  if (!u.tasks || u.tasks.day !== key) u.tasks = { day: key, progress: {}, done: {} };
  return u.tasks;
}

router.get('/tasks', auth, (req, res) => {
  const t = todayTask(req.user);
  const list = TASKS.map((x) => ({
    ...x,
    progress: Math.min(x.target || 1, t.progress[x.id] || 0),
    done: !!t.done[x.id],
  }));
  res.json({ ok: true, list, coins: req.user.coins || 0 });
});

router.post('/task/claim', auth, (req, res) => {
  const { id } = req.body || {};
  const task = TASKS.find((x) => x.id === id);
  if (!task) return res.json({ ok: false, msg: '任务不存在' });
  const t = todayTask(req.user);
  if (t.done[id]) return res.json({ ok: false, msg: '今天已领取' });
  if ((t.progress[id] || 0) < (task.target || 1)) return res.json({ ok: false, msg: '任务未完成' });
  t.done[id] = true;
  req.user.coins = (req.user.coins || 0) + task.reward;
  saveSoon();
  res.json({ ok: true, coins: req.user.coins, reward: task.reward });
});

/** 行为埋点：各处调用 */
function bump(userId, action, n) {
  const u = q.one('users', 'id', userId);
  if (!u) return;
  const t = todayTask(u);
  t.progress[action] = (t.progress[action] || 0) + (n || 1);
  saveSoon();
}

/** 签到 */
router.get('/checkin', auth, (req, res) => {
  const key = U.todayKey();
  const c = req.user.checkin || {};
  res.json({ ok: true, today: !!c[key], streak: c.streak || 0, last: c.last || '', coins: req.user.coins || 0 });
});

router.post('/checkin', auth, (req, res) => {
  const key = U.todayKey();
  const c = (req.user.checkin = req.user.checkin || {});
  if (c[key]) return res.json({ ok: false, msg: '今天已经签到过了' });
  const y = U.todayKey(new Date(Date.now() - 86400000));
  c.streak = c.last === y ? (c.streak || 0) + 1 : 1;
  c.last = key;
  c[key] = true;
  const reward = 10 + Math.min(20, c.streak * 2);
  req.user.coins = (req.user.coins || 0) + reward;
  saveSoon();
  res.json({ ok: true, coins: req.user.coins, reward, streak: c.streak });
});

/* ---------------- 心动问答 ---------------- */
const QUESTIONS = [
  { id: 1, q: '如果能立刻去一个地方，你会去哪？', options: ['海边', '山顶', '陌生城市', '回家'] },
  { id: 2, q: '你更享受哪种夜晚？', options: ['热闹的聚会', '两个人散步', '一个人看剧', '通宵打游戏'] },
  { id: 3, q: '恋爱里你最看重？', options: ['真诚', '有趣', '安全感', '共同成长'] },
  { id: 4, q: '周末的第一选择是？', options: ['睡到自然醒', '出门探店', '运动出汗', '宅家充电'] },
  { id: 5, q: '你表达爱意的方式？', options: ['直接说', '默默做事', '送小礼物', '陪伴'] },
  { id: 6, q: '最受不了对方？', options: ['已读不回', '说谎', '冷暴力', '不守时'] },
  { id: 7, q: '理想的一次约会？', options: ['看电影', '一起做饭', '看展/演出', 'Citywalk'] },
  { id: 8, q: '你觉得自己最吸引人的地方？', options: ['性格', '外表', '才华', '幽默感'] },
];
router.get('/questions', auth, (req, res) => res.json({ ok: true, list: QUESTIONS }));

router.post('/answers', auth, (req, res) => {
  const { answers } = req.body || {};
  req.user.answers = answers || {};
  saveSoon();
  res.json({ ok: true });
});

/** 问答匹配度：与某人的答案一致率 */
router.get('/compat/:userId', auth, (req, res) => {
  const other = q.one('users', 'id', req.params.userId);
  if (!other) return res.json({ ok: false, msg: '用户不存在' });
  const a = req.user.answers || {};
  const b = other.answers || {};
  const keys = Object.keys(a).filter((k) => b[k] !== undefined);
  const same = keys.filter((k) => a[k] === b[k]).length;
  const rate = keys.length ? Math.round((same / keys.length) * 100) : null;
  res.json({ ok: true, rate, total: keys.length, same, hasOther: Object.keys(b).length > 0 });
});

/* ---------------- 随机闪聊（匿名 5 分钟） ---------------- */
const flashRooms = new Map(); // roomId -> {users:[], expires, msgs:[]}

router.post('/flash/enter', auth, (req, res) => {
  // 清理过期
  const now = Date.now();
  for (const [k, v] of flashRooms) if (v.expires < now) flashRooms.delete(k);

  // 找一个等待中的房间
  let room = null;
  for (const v of flashRooms.values()) {
    if (v.users.length === 1 && !v.users.includes(req.uid)) { room = v; break; }
  }
  if (!room) {
    const id = uid('flash_');
    room = { id, users: [req.uid], expires: now + 5 * 60 * 1000, msgs: [], createdAt: now };
    flashRooms.set(id, room);
  } else {
    room.users.push(req.uid);
    room.expires = now + 5 * 60 * 1000;
    room.msgs.push({ id: uid('fm_'), fromId: 'system', type: 'system', content: '⚡ 已配对成功！你们有 5 分钟匿名聊天时间，聊得来可以申请解锁身份', createdAt: now });
    room.users.forEach((u) => pushTo(u, { type: 'flash_matched', roomId: room.id }));
  }
  res.json({ ok: true, roomId: room.id, ready: room.users.length === 2, expires: room.expires, msgs: room.msgs });
});

router.get('/flash/:roomId', auth, (req, res) => {
  const room = flashRooms.get(req.params.roomId);
  if (!room) return res.json({ ok: false, msg: '房间已结束' });
  if (!room.users.includes(req.uid)) return res.json({ ok: false, msg: '无权访问' });
  res.json({ ok: true, ready: room.users.length === 2, expires: room.expires, msgs: room.msgs, revealed: room.revealed || {} });
});

router.post('/flash/:roomId/send', auth, (req, res) => {
  const room = flashRooms.get(req.params.roomId);
  if (!room) return res.json({ ok: false, msg: '房间已结束' });
  if (!room.users.includes(req.uid)) return res.json({ ok: false, msg: '无权访问' });
  const { content } = req.body || {};
  const chk = moderate.check(String(content));
  if (!chk.pass) return res.json({ ok: false, msg: '包含敏感内容' });
  const msg = { id: uid('fm_'), fromId: req.uid, type: 'text', content: String(content).slice(0, 500), createdAt: Date.now() };
  room.msgs.push(msg);
  const other = room.users.find((u) => u !== req.uid);
  if (other) pushTo(other, { type: 'flash_message', roomId: room.id, message: msg });
  res.json({ ok: true, message: msg });
});

/** 申请解锁身份（双方同意则互相匹配） */
router.post('/flash/:roomId/reveal', auth, (req, res) => {
  const room = flashRooms.get(req.params.roomId);
  if (!room || !room.users.includes(req.uid)) return res.json({ ok: false, msg: '房间无效' });
  room.revealed = room.revealed || {};
  room.revealed[req.uid] = true;
  const both = room.users.every((u) => room.revealed[u]);
  if (both) {
    const [a, b] = room.users;
    if (!q.find('matches', (m) => m.users.includes(a) && m.users.includes(b))) {
      const mid = uid('m_');
      q.add('matches', { id: mid, users: [a, b], createdAt: Date.now(), lastAt: Date.now(), from: 'flash' });
      q.add('messages', { id: uid('msg_'), matchId: mid, fromId: 'system', type: 'system', content: '⚡ 闪聊解锁成功，你们已成为好友！', createdAt: Date.now(), read: false });
      room.matchId = mid;
    }
    room.users.forEach((u) => pushTo(u, { type: 'flash_revealed', roomId: room.id, matchId: room.matchId }));
  } else {
    const other = room.users.find((u) => u !== req.uid);
    pushTo(other, { type: 'flash_reveal_request', roomId: room.id });
  }
  res.json({ ok: true, both });
});

router.post('/flash/:roomId/leave', auth, (req, res) => {
  const room = flashRooms.get(req.params.roomId);
  if (room) {
    room.users = room.users.filter((u) => u !== req.uid);
    if (!room.users.length) flashRooms.delete(room.id);
    else pushTo(room.users[0], { type: 'flash_leave', roomId: room.id });
  }
  res.json({ ok: true });
});

module.exports = { router, bump, TASKS, LEVELS, levelOf, QUESTIONS };
