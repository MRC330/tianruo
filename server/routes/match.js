const express = require('express');
const config = require('../config');
const { db, q, saveSoon, uid } = require('../store');
const U = require('../utils');
const { auth, publicUser } = require('./user');
const { pushTo } = require('../ws');

const router = express.Router();

function quotaOf(u) {
  const key = U.todayKey();
  const used = (u.dailyLikes && u.dailyLikes[key]) || 0;
  const limit = u.vip ? 9999 : config.DAILY_LIKE_LIMIT;
  return { used, limit, left: Math.max(0, limit - used) };
}

/**
 * 候选池回收：当可推荐人数不足时，清掉 N 天前的「跳过」记录，
 * 让被 pass 过的人经过一段时间后重新进入推荐池（like/super 永不回收）。
 */
const RECYCLE_AFTER = 3 * 86400000; // 3 天
function recycleIfStarved(me, threshold) {
  const pool = db.users.filter(
    (u) => u.id !== me.id && !u.fresh && u.nickname
  ).length;
  const seenCount = q.filter('swipes', (s) => s.fromId === me.id).length;
  if (pool - seenCount >= threshold) return 0;
  const cut = Date.now() - RECYCLE_AFTER;
  let n = 0;
  q.filter('swipes', (s) => s.fromId === me.id && s.type === 'pass' && s.createdAt < cut)
    .forEach((s) => {
      q.del('swipes', (x) => x.id === s.id);
      n++;
    });
  if (n) saveSoon();
  return n;
}

/** 推荐卡片 */
router.get('/cards', auth, (req, res) => {
  const me = req.user;
  const gender = req.query.gender || (me.gender === '男' ? '女' : me.gender === '女' ? '男' : 'all');
  const blocked = new Set([
    ...q.filter('blocks', (b) => b.fromId === me.id).map((b) => b.toId),
    ...q.filter('blocks', (b) => b.toId === me.id).map((b) => b.fromId),
  ]);
  const candidates = () => db.users.filter(
    (u) => u.id !== me.id && !blocked.has(u.id) && !u.fresh && u.nickname
  );

  let seen = new Set(q.filter('swipes', (s) => s.fromId === me.id).map((s) => s.toId));
  let list = candidates().filter((u) => !seen.has(u.id));
  // 候选耗尽 → 回收 3 天前的 pass，避免"滑完就永远空"
  if (list.length < 5) {
    const recycled = recycleIfStarved(me, 5);
    if (recycled) {
      seen = new Set(q.filter('swipes', (s) => s.fromId === me.id).map((s) => s.toId));
      list = candidates().filter((u) => !seen.has(u.id));
    }
  }
  if (gender !== 'all') {
    const g = list.filter((u) => u.gender === gender);
    if (g.length >= 3 || !list.length) list = g.length ? g : list;
    else list = g.concat(list.filter((u) => u.gender !== gender)).slice(0, 20);
  }
  if (!list.length) list = candidates();
  list = list.map((u) => ({ u, d: U.distance(me, u) }))
    .sort((a, b) => (a.d == null ? 9999 : a.d) - (b.d == null ? 9999 : b.d));
  const near = list.slice(0, 20);
  const rest = U.shuffle(list.slice(20));
  res.json({
    ok: true,
    list: [...near, ...rest].slice(0, 30).map((x) => publicUser(x.u, me)),
    quota: quotaOf(me),
  });
});

/** 滑动：like / pass / super */
router.post('/swipe', auth, (req, res) => {
  const { toId, type } = req.body || {};
  const me = req.user;
  if (!toId) return res.json({ ok: false, msg: '缺少目标用户' });
  if (toId === me.id) return res.json({ ok: false, msg: '不能对自己操作' });

  if (type !== 'pass') {
    const qt = quotaOf(me);
    if (qt.left <= 0) return res.json({ ok: false, msg: '今天的喜欢次数用完啦，明天再来 💫', quota: qt });
  }
  if (q.find('swipes', (s) => s.fromId === me.id && s.toId === toId)) {
    return res.json({ ok: false, msg: '已经操作过了' });
  }
  q.add('swipes', { id: uid('s_'), fromId: me.id, toId, type: type || 'pass', createdAt: Date.now() });

  if (type !== 'pass') {
    const key = U.todayKey();
    me.dailyLikes = me.dailyLikes || {};
    me.dailyLikes[key] = (me.dailyLikes[key] || 0) + 1;
    saveSoon();
  }

  const target = q.one('users', 'id', toId);
  const back = q.find('swipes', (s) => s.fromId === toId && s.toId === me.id && (s.type === 'like' || s.type === 'super'));
  let matched = false;
  let matchId = null;
  if ((type === 'like' || type === 'super') && back) {
    const exist = q.find('matches', (m) => m.users.includes(me.id) && m.users.includes(toId));
    if (!exist) {
      matchId = uid('m_');
      q.add('matches', { id: matchId, users: [me.id, toId], createdAt: Date.now(), lastAt: Date.now(), superLike: type === 'super' });
      q.add('messages', {
        id: uid('msg_'), matchId, fromId: 'system', type: 'system',
        content: type === 'super' ? '⚡ 超级喜欢！你们已成功匹配，打个招呼吧～' : '🎉 你们已成功匹配，打个招呼吧～',
        createdAt: Date.now(), read: false,
      });
    } else matchId = exist.id;
    matched = true;
    q.add('notifications', { id: uid('n_'), userId: toId, type: 'match', fromId: me.id, matchId, text: type === 'super' ? '⚡ 用超级喜欢和你匹配了！' : '你们互相喜欢，已匹配 🎉', read: false, createdAt: Date.now() });
    pushTo(toId, { type: 'match', matchId, user: publicUser(me, target) });
  } else if (type !== 'pass' && target) {
    q.add('notifications', { id: uid('n_'), userId: toId, type: type === 'super' ? 'superlike' : 'like', fromId: me.id, text: type === 'super' ? '⚡ 对你使用了超级喜欢' : '喜欢了你', read: false, createdAt: Date.now() });
    pushTo(toId, { type: 'like', user: publicUser(me, target) });
  }

  res.json({ ok: true, matched, matchId, quota: quotaOf(me) });
});

/** 匹配（好友）列表 */
router.get('/list', auth, (req, res) => {
  const ms = q.filter('matches', (m) => m.users.includes(req.uid)).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  const list = ms.map((m) => {
    const otherId = m.users.find((x) => x !== req.uid);
    const other = q.one('users', 'id', otherId);
    const msgs = q.filter('messages', (x) => x.matchId === m.id);
    const last = msgs[msgs.length - 1];
    const unread = msgs.filter((x) => x.fromId !== req.uid && !x.read).length;
    return {
      matchId: m.id,
      user: publicUser(other, req.user),
      lastMessage: last ? { type: last.type, content: last.content, createdAt: last.createdAt, fromId: last.fromId } : null,
      unread,
      createdAt: m.createdAt,
    };
  });
  res.json({ ok: true, list });
});

/** 解除匹配 */
router.delete('/:matchId', auth, (req, res) => {
  const m = q.one('matches', 'id', req.params.matchId);
  if (!m || !m.users.includes(req.uid)) return res.json({ ok: false, msg: '匹配不存在' });
  q.del('matches', (x) => x.id === m.id);
  q.del('messages', (x) => x.matchId === m.id);
  q.del('swipes', (s) => (s.fromId === m.users[0] && s.toId === m.users[1]) || (s.fromId === m.users[1] && s.toId === m.users[0]));
  res.json({ ok: true });
});

router.get('/quota', auth, (req, res) => res.json({ ok: true, quota: quotaOf(req.user) }));

module.exports = router;
module.exports.recycleIfStarved = recycleIfStarved;
