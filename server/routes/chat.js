const express = require('express');
const { db, q, saveSoon, uid } = require('../store');
const { auth, publicUser } = require('./user');
const { pushTo } = require('../ws');
const moderate = require('../moderation');

const router = express.Router();

function ensureMember(matchId, myId) {
  const m = q.one('matches', 'id', matchId);
  if (!m || !m.users.includes(myId)) return null;
  return m;
}

function shape(x, myId) {
  return {
    id: x.id, matchId: x.matchId, fromId: x.fromId, type: x.type,
    content: x.content, extra: x.extra || null, createdAt: x.createdAt,
    read: x.read, revoked: !!x.revoked, mine: x.fromId === myId,
    replyTo: x.replyTo || null,
  };
}

/** 表情包商店（必须在 /:matchId 之前，否则被当作会话 ID） */
const STICKERS = [
  { id: 's1', name: '开心', url: '/sticker/1.svg' },
  { id: 's2', name: '生气', url: '/sticker/2.svg' },
  { id: 's3', name: '爱心', url: '/sticker/3.svg' },
  { id: 's4', name: '抱抱', url: '/sticker/4.svg' },
  { id: 's5', name: '大笑', url: '/sticker/5.svg' },
  { id: 's6', name: '哭泣', url: '/sticker/6.svg' },
];
router.get('/stickers', auth, (req, res) => res.json({ ok: true, list: STICKERS }));

/** 会话列表 */
router.get('/list', auth, (req, res) => {
  const ms = q.filter('matches', (m) => m.users.includes(req.uid))
    .sort((a, b) => (b.lastAt || b.createdAt) - (a.lastAt || a.createdAt));
  const list = ms.map((m) => {
    const otherId = m.users.find((x) => x !== req.uid);
    const other = q.one('users', 'id', otherId);
    const msgs = q.filter('messages', (x) => x.matchId === m.id).sort((a, b) => a.createdAt - b.createdAt);
    const last = msgs[msgs.length - 1];
    const unread = msgs.filter((x) => x.fromId !== req.uid && !x.read).length;
    return {
      matchId: m.id,
      user: publicUser(other, req.user),
      lastMessage: last ? { type: last.type, content: last.content, createdAt: last.createdAt, fromId: last.fromId } : null,
      unread,
      updatedAt: m.lastAt || m.createdAt,
      tianruo: m.tianruo || 0,
      streak: m.streak || 0,
      pinned: !!m.pinned,
      muted: !!m.muted,
    };
  });
  list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
  res.json({ ok: true, list, unreadTotal: list.reduce((s, x) => s + x.unread, 0) });
});

/** 聊天记录（支持分页：before=消息ID 或时间戳，取更早的 limit 条） */
router.get('/:matchId', auth, (req, res) => {
  const m = ensureMember(req.params.matchId, req.uid);
  if (!m) return res.json({ ok: false, msg: '会话不存在' });
  const limit = Math.min(100, parseInt(req.query.limit || '30', 10));
  const before = req.query.before ? parseInt(req.query.before, 10) : null;
  let all = q.filter('messages', (x) => x.matchId === m.id).sort((a, b) => a.createdAt - b.createdAt);
  if (before) all = all.filter((x) => x.createdAt < before);
  const page = all.slice(Math.max(0, all.length - limit));
  res.json({
    ok: true,
    list: page.map((x) => shape(x, req.uid)),
    hasMore: before ? all.length > limit : all.length > limit,
    total: all.length,
    match: m,
    tianruo: m.tianruo || 0,
    streak: m.streak || 0,
  });
});

/** 发送：text / image / voice / emoji / gift / system */
router.post('/:matchId/send', auth, (req, res) => {
  const m = ensureMember(req.params.matchId, req.uid);
  if (!m) return res.json({ ok: false, msg: '会话不存在' });
  const { type, content, extra, replyTo } = req.body || {};
  if (!content && type !== 'voice') return res.json({ ok: false, msg: '内容不能为空' });
  const t = type || 'text';

  // 内容安全
  if (t === 'text') {
    const chk = moderate.check(String(content));
    if (!chk.pass) return res.json({ ok: false, msg: '消息包含敏感内容，请修改后重试' });
  }

  const msg = {
    id: uid('msg_'), matchId: m.id, fromId: req.uid,
    type: t, content: String(content || '').slice(0, 4000),
    extra: extra || null, replyTo: replyTo || null,
    createdAt: Date.now(), read: false,
  };
  q.add('messages', msg);
  m.lastAt = Date.now();

  // 火花值：双方发言都加，连续天数 streak
  const key = require('../utils').todayKey();
  if (!m.tianruoLog) m.tianruoLog = {};
  const isNewDay = m.lastChatDay !== key;
  if (isNewDay) {
    const yesterday = require('../utils').todayKey(new Date(Date.now() - 86400000));
    m.streak = m.lastChatDay === yesterday ? (m.streak || 0) + 1 : 1;
    m.lastChatDay = key;
  }
  m.tianruo = (m.tianruo || 0) + 1;
  saveSoon();

  const otherId = m.users.find((x) => x !== req.uid);
  pushTo(otherId, { type: 'message', matchId: m.id, message: shape(msg, otherId), tianruo: m.tianruo, streak: m.streak });
  res.json({ ok: true, message: shape(msg, req.uid), tianruo: m.tianruo, streak: m.streak });
});

/** 标记已读 */
router.post('/:matchId/read', auth, (req, res) => {
  const m = ensureMember(req.params.matchId, req.uid);
  if (!m) return res.json({ ok: false });
  q.filter('messages', (x) => x.matchId === m.id && x.fromId !== req.uid).forEach((x) => { x.read = true; });
  saveSoon();
  pushTo(m.users.find((x) => x !== req.uid), { type: 'read', matchId: m.id });
  res.json({ ok: true });
});

router.post('/:matchId/typing', auth, (req, res) => {
  const m = ensureMember(req.params.matchId, req.uid);
  if (!m) return res.json({ ok: false });
  pushTo(m.users.find((x) => x !== req.uid), { type: 'typing', matchId: m.id, userId: req.uid });
  res.json({ ok: true });
});

/** 撤回（5 分钟内） */
router.post('/revoke', auth, (req, res) => {
  const { messageId } = req.body || {};
  const msg = q.one('messages', 'id', messageId);
  if (!msg) return res.json({ ok: false, msg: '消息不存在' });
  if (msg.fromId !== req.uid) return res.json({ ok: false, msg: '只能撤回自己的消息' });
  if (Date.now() - msg.createdAt > 5 * 60 * 1000) return res.json({ ok: false, msg: '超过 5 分钟不能撤回' });
  msg.revoked = true;
  msg.content = '';
  saveSoon();
  const m = q.one('matches', 'id', msg.matchId);
  pushTo(m.users.find((x) => x !== req.uid), { type: 'revoke', matchId: msg.matchId, messageId });
  res.json({ ok: true });
});

/** 消息内搜索 */
router.get('/:matchId/search', auth, (req, res) => {
  const m = ensureMember(req.params.matchId, req.uid);
  if (!m) return res.json({ ok: false });
  const kw = String(req.query.kw || '').trim();
  if (!kw) return res.json({ ok: true, list: [] });
  const list = q.filter('messages', (x) => x.matchId === m.id && !x.revoked && x.type === 'text' && x.content.includes(kw))
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 50)
    .map((x) => shape(x, req.uid));
  res.json({ ok: true, list });
});

/** 会话设置：置顶 / 免打扰 / 备注 */
router.post('/:matchId/settings', auth, (req, res) => {
  const m = ensureMember(req.params.matchId, req.uid);
  if (!m) return res.json({ ok: false });
  const { pinned, muted, remark } = req.body || {};
  if (pinned !== undefined) m.pinned = !!pinned;
  if (muted !== undefined) m.muted = !!muted;
  if (remark !== undefined) m.remark = String(remark).slice(0, 20);
  saveSoon();
  res.json({ ok: true });
});

module.exports = router;
