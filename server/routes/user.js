const express = require('express');
const config = require('../config');
const { db, q, saveSoon, uid } = require('../store');
const U = require('../utils');

const router = express.Router();

/** 鉴权中间件 */
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  const payload = token ? U.verifyToken(token) : null;
  if (!payload) return res.status(401).json({ ok: false, msg: '请先登录', code: 401 });
  const user = q.one('users', 'id', payload.uid);
  if (!user) return res.status(401).json({ ok: false, msg: '用户不存在', code: 401 });
  req.user = user;
  req.uid = user.id;
  user.lastActive = Date.now();
  next();
}

function avatarOf(u) {
  if (u.avatar) return u.avatar;
  return `/avatar/${encodeURIComponent(u.id)}`;
}

/** 对外输出的用户信息（脱敏） */
function publicUser(u, viewer) {
  if (!u) return null;
  const isSelf = viewer && viewer.id === u.id;
  const dist = viewer && viewer.lat != null && u.lat != null ? U.distance(viewer, u) : null;
  const swiped = viewer ? q.find('swipes', (s) => s.fromId === viewer.id && s.toId === u.id) : null;
  return {
    id: u.id,
    nickname: u.nickname,
    gender: u.gender,
    age: U.age(u.birthday),
    birthday: isSelf ? u.birthday : undefined,
    avatar: avatarOf(u),
    photos: (u.photos || []).slice(0, 6),
    bio: u.bio,
    signature: u.signature,
    tags: u.tags || [],
    city: u.city,
    school: u.school,
    job: u.job,
    voice: u.voice,
    online: !!u.online,
    lastActive: u.lastActive,
    vip: !!u.vip,
    verified: !!u.verified,
    distance: dist,
    createdAt: u.createdAt,
    liked: swiped ? swiped.type : null,
    isSelf: !!isSelf,
    phone: isSelf ? u.phone : undefined,
  };
}

// ---------- 资料 ----------
router.get('/profile/:id', auth, (req, res) => {
  const u = q.one('users', 'id', req.params.id);
  if (!u) return res.json({ ok: false, msg: '用户不存在' });
  if (req.params.id !== req.uid) {
    q.add('visits', { id: uid('v_'), userId: req.params.id, visitorId: req.uid, createdAt: Date.now() });
    q.add('notifications', {
      id: uid('n_'), userId: req.params.id, type: 'visit', fromId: req.uid,
      text: '访问了你的主页', read: false, createdAt: Date.now(),
    });
  }
  res.json({ ok: true, user: publicUser(u, req.user) });
});

router.post('/update', auth, (req, res) => {
  const u = req.user;
  const allow = ['nickname', 'gender', 'birthday', 'avatar', 'photos', 'bio', 'signature', 'tags', 'city', 'school', 'job', 'voice', 'lat', 'lng'];
  for (const k of allow) if (req.body[k] !== undefined) u[k] = req.body[k];
  if (u.lat) u.lat = parseFloat(u.lat);
  if (u.lng) u.lng = parseFloat(u.lng);
  u.fresh = false;
  u.updatedAt = Date.now();
  saveSoon();
  res.json({ ok: true, user: publicUser(u, u) });
});

router.post('/location', auth, (req, res) => {
  const { lat, lng, city } = req.body || {};
  if (lat != null) req.user.lat = parseFloat(lat);
  if (lng != null) req.user.lng = parseFloat(lng);
  if (city) req.user.city = city;
  saveSoon();
  res.json({ ok: true });
});

// ---------- 推荐 / 附近 ----------
router.get('/nearby', auth, (req, res) => {
  const { gender, minAge, maxAge, limit } = req.query;
  const me = req.user;
  const seen = new Set(q.filter('swipes', (s) => s.fromId === me.id).map((s) => s.toId));
  let list = db.users.filter((u) => u.id !== me.id && !seen.has(u.id) && !u.fresh);
  if (gender && gender !== 'all') list = list.filter((u) => u.gender === gender);
  if (minAge) list = list.filter((u) => (U.age(u.birthday) || 0) >= +minAge);
  if (maxAge) list = list.filter((u) => (U.age(u.birthday) || 99) <= +maxAge);
  list = list.map((u) => ({ u, d: U.distance(me, u) }))
    .sort((a, b) => (a.d == null ? 9999 : a.d) - (b.d == null ? 9999 : b.d))
    .slice(0, parseInt(limit || '40', 10));
  res.json({ ok: true, list: list.map((x) => publicUser(x.u, me)) });
});

// ---------- 谁喜欢我 ----------
router.get('/likes-me', auth, (req, res) => {
  const likes = q.filter('swipes', (s) => s.toId === req.uid && (s.type === 'like' || s.type === 'super'))
    .sort((a, b) => b.createdAt - a.createdAt);
  const list = likes.map((s) => q.one('users', 'id', s.fromId)).filter(Boolean).map((u) => publicUser(u, req.user));
  res.json({ ok: true, list });
});

// ---------- 访客 ----------
router.get('/visitors', auth, (req, res) => {
  const list = q.filter('visits', (v) => v.userId === req.uid)
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 50)
    .map((v) => q.one('users', 'id', v.visitorId)).filter(Boolean);
  const uniq = [];
  const seen = new Set();
  for (const u of list) if (!seen.has(u.id)) { seen.add(u.id); uniq.push(publicUser(u, req.user)); }
  res.json({ ok: true, list: uniq });
});

// ---------- 屏蔽 / 举报 ----------
router.post('/block', auth, (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.json({ ok: false, msg: '缺少用户 ID' });
  if (!q.find('blocks', (b) => b.fromId === req.uid && b.toId === userId)) {
    q.add('blocks', { id: uid('b_'), fromId: req.uid, toId: userId, createdAt: Date.now() });
  }
  res.json({ ok: true });
});

router.post('/report', auth, (req, res) => {
  const { userId, reason, type } = req.body || {};
  q.add('reports', { id: uid('r_'), fromId: req.uid, toId: userId, reason, type: type || 'user', createdAt: Date.now() });
  res.json({ ok: true, msg: '举报已提交，我们会尽快处理' });
});

// ---------- 搜索 ----------
router.get('/search', auth, (req, res) => {
  const kw = String(req.query.kw || '').trim();
  if (!kw) return res.json({ ok: true, list: [] });
  const list = db.users.filter(
    (u) => u.id !== req.uid && !u.fresh &&
      (u.nickname.includes(kw) || (u.city || '').includes(kw) || (u.school || '').includes(kw) || (u.tags || []).some((t) => t.includes(kw)))
  ).slice(0, 30);
  res.json({ ok: true, list: list.map((u) => publicUser(u, req.user)) });
});

module.exports = { router, auth, publicUser, avatarOf };
