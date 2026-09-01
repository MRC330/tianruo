/**
 * 社区 v4.0：群聊 / 兴趣圈子 / 楼中楼评论 / 热榜
 */
const express = require('express');
const { db, q, saveSoon, uid } = require('../store');
const { auth, publicUser, avatarOf } = require('./user');
const { pushTo } = require('../ws');
const moderate = require('../moderation');

const router = express.Router();

/* ---------------- 兴趣圈子 ---------------- */
const CIRCLES = [
  { id: 'c_photo', name: '摄影研究所', icon: '📷', desc: '光影与构图的浪漫', color: '#ff6b9d' },
  { id: 'c_music', name: '深夜听歌室', icon: '🎧', desc: '交换歌单，共享频率', color: '#7c5cff' },
  { id: 'c_food', name: '干饭联盟', icon: '🍜', desc: '今天吃什么', color: '#ffc94d' },
  { id: 'c_sport', name: '出汗俱乐部', icon: '🏃', desc: '自律给我自由', color: '#3ddad7' },
  { id: 'c_game', name: '开黑小分队', icon: '🎮', desc: '缺个辅助', color: '#6bff8f' },
  { id: 'c_pet', name: '毛孩子家长', icon: '🐾', desc: '晒晒你家主子', color: '#ff9c6b' },
  { id: 'c_read', name: '阅读角落', icon: '📚', desc: '一本书的共鸣', color: '#8ab4ff' },
  { id: 'c_travel', name: '在路上的我们', icon: '🧳', desc: '风景与远方', color: '#ff7ad9' },
];

function ensureCircles() {
  CIRCLES.forEach((c) => {
    if (!q.one('topics', 'id', c.id)) {
      q.add('topics', { id: c.id, name: c.name, desc: c.desc, icon: c.icon, color: c.color, isCircle: true, hot: 0, members: 0, createdAt: Date.now() });
    }
  });
}

router.get('/circles', auth, (req, res) => {
  ensureCircles();
  const list = db.topics.filter((t) => t.isCircle).map((t) => ({
    ...t,
    members: q.filter('messages', (m) => m.groupId === t.id).length ? new Set(q.filter('messages', (m) => m.groupId === t.id).map((m) => m.fromId)).size : Math.floor(Math.random() * 0) + (t.members || 0),
    posts: db.moments.filter((m) => m.circle === t.id).length,
    joined: !!q.find('messages', (m) => m.groupId === t.id && m.fromId === req.uid && m.type === 'join'),
  }));
  res.json({ ok: true, list });
});

/* ---------------- 群聊 ---------------- */
router.post('/join', auth, (req, res) => {
  const { groupId } = req.body || {};
  const c = q.one('topics', 'id', groupId);
  if (!c) return res.json({ ok: false, msg: '圈子不存在' });
  const joined = q.find('messages', (m) => m.groupId === groupId && m.fromId === req.uid && m.type === 'join');
  if (!joined) {
    q.add('messages', {
      id: uid('gm_'), groupId, matchId: null, fromId: req.uid, type: 'join',
      content: `${req.user.nickname} 加入了圈子`, createdAt: Date.now(), read: true,
    });
    saveSoon();
  }
  res.json({ ok: true });
});

/** 群消息（圈子内广播） */
router.get('/messages', auth, (req, res) => {
  const { groupId, limit } = req.query;
  if (!groupId) return res.json({ ok: false, msg: '缺少 groupId' });
  const all = q.filter('messages', (m) => m.groupId === groupId).sort((a, b) => a.createdAt - b.createdAt);
  const list = all.slice(-parseInt(limit || '60', 10)).map((m) => {
    const u = q.one('users', 'id', m.fromId);
    return {
      id: m.id, fromId: m.fromId, type: m.type, content: m.content,
      createdAt: m.createdAt, mine: m.fromId === req.uid,
      nickname: u ? u.nickname : '系统',
      avatar: u ? avatarOf(u) : '/avatar/system',
    };
  });
  res.json({ ok: true, list });
});

router.post('/send', auth, (req, res) => {
  const { groupId, content } = req.body || {};
  if (!groupId || !content) return res.json({ ok: false, msg: '内容不能为空' });
  const chk = moderate.check(String(content));
  if (!chk.pass) return res.json({ ok: false, msg: '包含敏感内容' });
  const msg = {
    id: uid('gm_'), groupId, matchId: null, fromId: req.uid, type: 'text',
    content: String(content).slice(0, 1000), createdAt: Date.now(), read: true,
  };
  q.add('messages', msg);
  saveSoon();
  // 广播给圈内其他人（简化：推送给所有曾发言者）
  const members = [...new Set(q.filter('messages', (m) => m.groupId === groupId).map((m) => m.fromId))];
  members.forEach((u) => {
    if (u === req.uid) return;
    pushTo(u, { type: 'group_message', groupId, message: { ...msg, nickname: req.user.nickname, avatar: avatarOf(req.user) } });
  });
  res.json({ ok: true, message: msg });
});

/* ---------------- 楼中楼评论 ---------------- */
router.post('/moment/:id/reply', auth, (req, res) => {
  const m = q.one('moments', 'id', req.params.id);
  if (!m) return res.json({ ok: false, msg: '动态不存在' });
  const { text, parentId } = req.body || {};
  if (!text) return res.json({ ok: false, msg: '评论不能为空' });
  const chk = moderate.check(String(text));
  if (!chk.pass) return res.json({ ok: false, msg: '包含敏感内容' });
  m.comments = m.comments || [];
  const c = {
    id: uid('c_'), userId: req.uid, text: String(text).slice(0, 300),
    parentId: parentId || null, likes: [], createdAt: Date.now(),
  };
  m.comments.push(c);
  if (m.userId !== req.uid) {
    q.add('notifications', {
      id: uid('n_'), userId: m.userId, type: parentId ? 'moment_reply' : 'moment_comment',
      fromId: req.uid, momentId: m.id, text: (parentId ? '回复了你：' : '评论了你的动态：') + String(text).slice(0, 30),
      read: false, createdAt: Date.now(),
    });
    pushTo(m.userId, { type: 'moment_comment', momentId: m.id });
  }
  saveSoon();
  res.json({ ok: true, comment: { ...c, user: publicUser(req.user, null) } });
});

router.post('/comment/:cid/like', auth, (req, res) => {
  for (const m of db.moments) {
    const c = (m.comments || []).find((x) => x.id === req.params.cid);
    if (c) {
      c.likes = c.likes || [];
      const i = c.likes.indexOf(req.uid);
      if (i >= 0) c.likes.splice(i, 1); else c.likes.push(req.uid);
      saveSoon();
      return res.json({ ok: true, liked: i < 0, likes: c.likes.length });
    }
  }
  res.json({ ok: false, msg: '评论不存在' });
});

/* ---------------- 热榜 ---------------- */
router.get('/hot', auth, (req, res) => {
  const since = Date.now() - 24 * 3600000;
  const hot = db.moments
    .filter((m) => m.createdAt > since - 6 * 86400000)
    .map((m) => ({
      ...m,
      score: (m.likes || []).length * 3 + (m.comments || []).length * 5 + Math.max(0, 1 - (Date.now() - m.createdAt) / 86400000) * 20,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((m, i) => ({
      rank: i + 1, id: m.id, text: m.text.slice(0, 40), topic: m.topic,
      likes: (m.likes || []).length, comments: (m.comments || []).length,
      user: publicUser(q.one('users', 'id', m.userId), null),
    }));
  res.json({ ok: true, list: hot });
});

/** 活跃榜：动态+互动最多的人 */
router.get('/rank', auth, (req, res) => {
  const list = db.users.filter((u) => !u.fresh).map((u) => {
    const ms = db.moments.filter((m) => m.userId === u.id);
    const likes = ms.reduce((s, m) => s + (m.likes || []).length, 0);
    const cmts = ms.reduce((s, m) => s + (m.comments || []).length, 0);
    return { user: publicUser(u, req.user), score: ms.length * 10 + likes * 2 + cmts * 3, moments: ms.length, likes };
  }).sort((a, b) => b.score - a.score).slice(0, 20);
  res.json({ ok: true, list });
});

module.exports = { router, CIRCLES, ensureCircles };
