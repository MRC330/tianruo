/**
 * v5.0 智能推荐 + 邀请裂变 + v7.0 虚拟礼物 / VIP 特权
 */
const express = require('express');
const { db, q, saveSoon, uid } = require('../store');
const { auth, publicUser, avatarOf } = require('./user');
const { pushTo } = require('../ws');
const U = require('../utils');
const config = require('../config');
const { recycleIfStarved } = require('./match');

const router = express.Router();

/* ============ v5.0 智能推荐打分 ============ */
/**
 * 综合打分（0-100）：
 *  - 距离分 30%（越近越高，5km 内满分）
 *  - 兴趣标签重合 25%
 *  - 年龄契合 15%（偏好 ±3 岁内满分）
 *  - 问答契合 15%
 *  - 活跃度 10%（7 天内活跃）
 *  - 资料完整度 5%
 */
function scoreFor(me, target) {
  let score = 0;
  const detail = {};

  // 距离
  const d = U.distance(me, target);
  if (d == null) { detail.distance = 12; }
  else if (d <= 1) detail.distance = 30;
  else if (d <= 5) detail.distance = 30 - (d - 1) * 2.5;
  else if (d <= 30) detail.distance = Math.max(8, 20 - (d - 5) * 0.4);
  else detail.distance = 5;

  // 标签
  const mt = new Set(me.tags || []);
  const tt = new Set(target.tags || []);
  let inter = 0;
  tt.forEach((t) => { if (mt.has(t)) inter++; });
  const union = new Set([...mt, ...tt]).size || 1;
  detail.tags = Math.round((inter / Math.max(1, Math.min(3, union))) * 25);

  // 年龄
  const myAge = U.age(me.birthday) || 22;
  const tAge = U.age(target.birthday) || 22;
  const diff = Math.abs(myAge - tAge);
  detail.age = diff <= 1 ? 15 : diff <= 3 ? 12 : diff <= 5 ? 8 : 4;

  // 问答契合
  const a = me.answers || {};
  const b = target.answers || {};
  const keys = Object.keys(a).filter((k) => b[k] !== undefined);
  detail.qa = keys.length ? Math.round((keys.filter((k) => a[k] === b[k]).length / keys.length) * 15) : 7;

  // 活跃度
  const active = Date.now() - (target.lastActive || 0);
  detail.active = active < 3600000 ? 10 : active < 86400000 ? 7 : active < 7 * 86400000 ? 4 : 1;

  // 资料完整度
  let full = 0;
  if (target.avatar || (target.photos && target.photos.length)) full += 2;
  if (target.bio) full += 1;
  if (target.photos && target.photos.length >= 3) full += 1;
  if (target.signature) full += 1;
  detail.profile = full;

  Object.values(detail).forEach((v) => (score += v));
  return { score: Math.round(score), detail };
}

router.get('/recommend', auth, (req, res) => {
  const me = req.user;
  const gender = req.query.gender || (me.gender === '男' ? '女' : me.gender === '女' ? '男' : 'all');
  const seen = new Set(q.filter('swipes', (s) => s.fromId === me.id).map((s) => s.toId));
  const blocked = new Set([
    ...q.filter('blocks', (b) => b.fromId === me.id).map((b) => b.toId),
    ...q.filter('blocks', (b) => b.toId === me.id).map((b) => b.fromId),
  ]);
  const candidates = () => db.users.filter(
    (u) => u.id !== me.id && !blocked.has(u.id) && !u.fresh && u.nickname
  );
  let pool = candidates().filter((u) => !seen.has(u.id));
  // 候选耗尽 → 回收 3 天前的 pass，避免"滑完就永远空"
  if (pool.length < 5) {
    const recycled = recycleIfStarved(me, 5);
    if (recycled) {
      const fresh = new Set(q.filter('swipes', (s) => s.fromId === me.id).map((s) => s.toId));
      pool = candidates().filter((u) => !fresh.has(u.id));
    }
  }
  if (gender !== 'all') {
    const g = pool.filter((u) => u.gender === gender);
    pool = g.length >= 3 ? g : pool;
  }
  if (!pool.length) pool = candidates();

  const scored = pool.map((u) => ({ u, ...scoreFor(me, u) })).sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 30);
  // 额度：与 match 路由口径一致
  const key = U.todayKey();
  const used = (me.dailyLikes && me.dailyLikes[key]) || 0;
  const limit = me.vip ? 9999 : config.DAILY_LIKE_LIMIT;
  res.json({
    ok: true,
    list: top.map((x) => ({ ...publicUser(x.u, me), matchScore: x.score, scoreDetail: x.detail })),
    quota: { used, limit, left: Math.max(0, limit - used) },
  });
});

/** 为什么推荐 TA */
router.get('/why/:userId', auth, (req, res) => {
  const t = q.one('users', 'id', req.params.userId);
  if (!t) return res.json({ ok: false });
  const { score, detail } = scoreFor(req.user, t);
  const reasons = [];
  const d = U.distance(req.user, t);
  if (d != null && d < 5) reasons.push({ icon: '📍', text: `距离你仅 ${d}km` });
  const mt = new Set(req.user.tags || []);
  const same = (t.tags || []).filter((x) => mt.has(x));
  if (same.length) reasons.push({ icon: '🏷', text: `共同兴趣：${same.join('、')}` });
  const a = req.user.answers || {};
  const b = t.answers || {};
  const keys = Object.keys(a).filter((k) => b[k] !== undefined && a[k] === b[k]);
  if (keys.length) reasons.push({ icon: '💭', text: `${keys.length} 个问题答案一致` });
  if (t.city && t.city === req.user.city) reasons.push({ icon: '🏙', text: '同一座城市' });
  if (t.online) reasons.push({ icon: '🟢', text: '当前在线' });
  res.json({ ok: true, score, detail, reasons });
});

/* ============ 邀请裂变 ============ */
router.get('/invite', auth, (req, res) => {
  if (!req.user.inviteCode) {
    const { uid } = require('../store');
    req.user.inviteCode = uid('').slice(-6).toUpperCase();
    saveSoon();
  }
  const invited = db.users.filter((u) => u.invitedBy === req.uid).map((u) => publicUser(u, req.user));
  res.json({ ok: true, code: req.user.inviteCode, invited, reward: invited.length * 20 });
});

router.post('/invite/use', auth, (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.json({ ok: false, msg: '请输入邀请码' });
  if (req.user.invitedBy) return res.json({ ok: false, msg: '你已使用过邀请码' });
  const inviter = db.users.find((u) => u.inviteCode === String(code).toUpperCase());
  if (!inviter) return res.json({ ok: false, msg: '邀请码无效' });
  if (inviter.id === req.uid) return res.json({ ok: false, msg: '不能使用自己的邀请码' });
  req.user.invitedBy = inviter.id;
  req.user.coins = (req.user.coins || 0) + 30;
  inviter.coins = (inviter.coins || 0) + 20;
  q.add('notifications', { id: uid('n_'), userId: inviter.id, type: 'invite', fromId: req.uid, text: '通过你的邀请码加入，奖励已到账', read: false, createdAt: Date.now() });
  saveSoon();
  res.json({ ok: true, coins: req.user.coins });
});

/* ============ v7.0 虚拟礼物 ============ */
const GIFTS = [
  { id: 'g1', name: '棒棒糖', icon: '🍭', price: 10, anim: '💫' },
  { id: 'g2', name: '咖啡', icon: '☕', price: 20, anim: '✨' },
  { id: 'g3', name: '小熊', icon: '🧸', price: 50, anim: '💕' },
  { id: 'g4', name: '玫瑰', icon: '🌹', price: 88, anim: '🌸' },
  { id: 'g5', name: '烟花', icon: '🎆', price: 188, anim: '🎇' },
  { id: 'g6', name: '皇冠', icon: '👑', price: 520, anim: '🌟' },
];
router.get('/gifts', auth, (req, res) => res.json({ ok: true, list: GIFTS, coins: req.user.coins || 0 }));

router.post('/gift/send', auth, (req, res) => {
  const { giftId } = req.body || {};
  let { toId, matchId } = req.body || {};
  const gift = GIFTS.find((g) => g.id === giftId);
  if (!gift) return res.json({ ok: false, msg: '礼物不存在' });
  // 兼容传 matchId：自动解析出对方
  let m = null;
  if (matchId) {
    m = q.one('matches', 'id', matchId);
    if (!m || !m.users.includes(req.uid)) return res.json({ ok: false, msg: '会话不存在' });
    toId = m.users.find((x) => x !== req.uid);
  }
  const to = q.one('users', 'id', toId);
  if (!to) return res.json({ ok: false, msg: '用户不存在' });
  const coins = req.user.coins || 0;
  if (coins < gift.price) return res.json({ ok: false, msg: `火花币不足，还差 ${gift.price - coins}` });
  // 必须是匹配关系
  if (!m) m = q.find('matches', (x) => x.users.includes(req.uid) && x.users.includes(toId));
  if (!m) return res.json({ ok: false, msg: '只能给已匹配的人送礼物' });
  req.user.coins = coins - gift.price;
  q.add('messages', {
    id: uid('msg_'), matchId: m.id, fromId: req.uid, type: 'gift',
    content: `送出 ${gift.icon} ${gift.name}`, extra: { giftId, icon: gift.icon, name: gift.name, price: gift.price },
    createdAt: Date.now(), read: false,
  });
  m.lastAt = Date.now();
  m.tianruo = (m.tianruo || 0) + Math.ceil(gift.price / 10);
  q.add('notifications', { id: uid('n_'), userId: toId, type: 'gift', fromId: req.uid, text: `送你 ${gift.icon} ${gift.name}`, read: false, createdAt: Date.now() });
  saveSoon();
  pushTo(toId, { type: 'gift', gift, from: publicUser(req.user, to), matchId: m.id });
  res.json({ ok: true, coins: req.user.coins });
});

/* ============ VIP 特权 ============ */
const VIP_PLANS = [
  { id: 'm1', name: '月卡', months: 1, price: 30, coins: 300, tag: '' },
  { id: 'm3', name: '季卡', months: 3, price: 78, coins: 780, tag: '省 12' },
  { id: 'm12', name: '年卡', months: 12, price: 258, coins: 2580, tag: '最划算' },
];
router.get('/vip/plans', auth, (req, res) => res.json({
  ok: true, list: VIP_PLANS, isVip: !!req.user.vip,
  expire: req.user.vipExpire || 0, coins: req.user.coins || 0,
}));

router.post('/vip/buy', auth, (req, res) => {
  const { planId, pay } = req.body || {};
  const plan = VIP_PLANS.find((p) => p.id === planId);
  if (!plan) return res.json({ ok: false, msg: '套餐不存在' });
  if (pay === 'coin') {
    if ((req.user.coins || 0) < plan.coins) return res.json({ ok: false, msg: '火花币不足' });
    req.user.coins -= plan.coins;
  }
  // 演示模式直接开通
  const base = (req.user.vipExpire || 0) > Date.now() ? req.user.vipExpire : Date.now();
  req.user.vipExpire = base + plan.months * 30 * 86400000;
  req.user.vip = true;
  saveSoon();
  res.json({ ok: true, vip: true, expire: req.user.vipExpire, coins: req.user.coins });
});

/** 充值火花币（演示） */
router.post('/coins/recharge', auth, (req, res) => {
  const amount = Math.min(10000, parseInt(req.body.amount || '100', 10));
  req.user.coins = (req.user.coins || 0) + amount;
  saveSoon();
  res.json({ ok: true, coins: req.user.coins, msg: `充值成功（演示环境）` });
});

module.exports = { router, scoreFor, GIFTS, VIP_PLANS };
