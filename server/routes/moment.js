const express = require('express');
const moderate = require('../moderation');
const { db, q, saveSoon, uid } = require('../store');
const { auth, publicUser } = require('./user');
const { pushTo } = require('../ws');

const router = express.Router();

function shape(m, viewerId) {
  const u = q.one('users', 'id', m.userId);
  return {
    id: m.id,
    user: publicUser(u, q.one('users', 'id', viewerId)),
    text: m.text,
    images: m.images || [],
    topic: m.topic,
    likes: (m.likes || []).length,
    liked: viewerId ? (m.likes || []).includes(viewerId) : false,
    comments: (m.comments || []).map((c) => ({ ...c, user: publicUser(q.one('users', 'id', c.userId), null) })),
    createdAt: m.createdAt,
  };
}

router.get('/feed', auth, (req, res) => {
  const { topic, userId, type } = req.query;
  let list = db.moments.slice();
  if (topic) list = list.filter((m) => m.topic === topic);
  if (userId) list = list.filter((m) => m.userId === userId);
  if (type === 'hot') list.sort((a, b) => (b.likes || []).length - (a.likes || []).length);
  else list.sort((a, b) => b.createdAt - a.createdAt);
  list = list.slice(0, 80);
  res.json({ ok: true, list: list.map((m) => shape(m, req.uid)) });
});

router.post('/publish', auth, (req, res) => {
  const { text, images, topic } = req.body || {};
  if (!text && (!images || !images.length)) return res.json({ ok: false, msg: '说点什么吧' });

  // 内容安全：敏感词拦截，联系方式仅打标（不阻断，交由后台复核）
  const chk = moderate.check(String(text || ''));
  if (!chk.pass) return res.json({ ok: false, msg: '内容包含敏感词：' + chk.hits.slice(0, 3).join('、'), hits: chk.hits });

  const m = {
    id: uid('mo_'), userId: req.uid, text: String(text || '').slice(0, 1000),
    images: (images || []).slice(0, 9), topic: topic || '',
    likes: [], comments: [], createdAt: Date.now(),
    risk: chk.risk || null, reviewed: !chk.risk,
  };
  q.add('moments', m);
  res.json({ ok: true, moment: shape(m, req.uid), risk: chk.risk || null });
});

router.post('/:id/like', auth, (req, res) => {
  const m = q.one('moments', 'id', req.params.id);
  if (!m) return res.json({ ok: false, msg: '动态不存在' });
  m.likes = m.likes || [];
  const i = m.likes.indexOf(req.uid);
  if (i >= 0) m.likes.splice(i, 1);
  else {
    m.likes.push(req.uid);
    if (m.userId !== req.uid) {
      q.add('notifications', { id: uid('n_'), userId: m.userId, type: 'moment_like', fromId: req.uid, momentId: m.id, text: '赞了你的动态', read: false, createdAt: Date.now() });
      pushTo(m.userId, { type: 'moment_like', momentId: m.id });
    }
  }
  saveSoon();
  res.json({ ok: true, liked: i < 0, likes: m.likes.length });
});

router.post('/:id/comment', auth, (req, res) => {
  const m = q.one('moments', 'id', req.params.id);
  if (!m) return res.json({ ok: false, msg: '动态不存在' });
  const { text, replyTo } = req.body || {};
  if (!text) return res.json({ ok: false, msg: '评论不能为空' });
  const chk = moderate.check(String(text));
  if (!chk.pass) return res.json({ ok: false, msg: '评论包含敏感词：' + chk.hits.slice(0, 3).join('、') });
  m.comments = m.comments || [];
  const c = { id: uid('c_'), userId: req.uid, text: String(text).slice(0, 300), replyTo: replyTo || '', createdAt: Date.now() };
  m.comments.push(c);
  if (m.userId !== req.uid) {
    q.add('notifications', { id: uid('n_'), userId: m.userId, type: 'moment_comment', fromId: req.uid, momentId: m.id, text: '评论了你的动态：' + String(text).slice(0, 30), read: false, createdAt: Date.now() });
    pushTo(m.userId, { type: 'moment_comment', momentId: m.id });
  }
  saveSoon();
  res.json({ ok: true, comment: { ...c, user: publicUser(req.user, null) } });
});

router.delete('/:id', auth, (req, res) => {
  const m = q.one('moments', 'id', req.params.id);
  if (!m) return res.json({ ok: false });
  if (m.userId !== req.uid) return res.json({ ok: false, msg: '只能删除自己的动态' });
  q.del('moments', (x) => x.id === m.id);
  res.json({ ok: true });
});

router.get('/topics', auth, (req, res) => {
  const topics = db.topics.map((t) => ({
    ...t,
    count: db.moments.filter((m) => m.topic === t.name).length,
  })).sort((a, b) => b.hot - a.hot);
  res.json({ ok: true, list: topics });
});

module.exports = router;
