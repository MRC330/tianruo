const express = require('express');
const { db, q, saveSoon, uid } = require('../store');
const { auth, publicUser } = require('./user');
const { pushTo } = require('../ws');

const router = express.Router();

router.get('/notifications', auth, (req, res) => {
  const list = q.filter('notifications', (n) => n.userId === req.uid)
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 100)
    .map((n) => ({ ...n, from: publicUser(q.one('users', 'id', n.fromId), req.user) }));
  res.json({ ok: true, list, unread: list.filter((n) => !n.read).length });
});

router.post('/read', auth, (req, res) => {
  const { id } = req.body || {};
  const ns = id ? q.filter('notifications', (n) => n.id === id) : q.filter('notifications', (n) => n.userId === req.uid);
  ns.forEach((n) => { n.read = true; });
  saveSoon();
  res.json({ ok: true });
});

/** 首页红点汇总 */
router.get('/badge', auth, (req, res) => {
  const unreadMsg = q.filter('matches', (m) => m.users.includes(req.uid))
    .reduce((s, m) => s + q.filter('messages', (x) => x.matchId === m.id && x.fromId !== req.uid && !x.read).length, 0);
  const unreadNotify = q.filter('notifications', (n) => n.userId === req.uid && !n.read).length;
  res.json({ ok: true, message: unreadMsg, notification: unreadNotify, total: unreadMsg + unreadNotify });
});

/** 打招呼（快捷短语） */
const HELLOS = [
  '你好呀，很高兴认识你 👋',
  '你的头像好好看，是自己拍的吗？',
  '看你也在杭州，同城哎！',
  '你的签名好有意思，能聊聊吗？',
  '嘿，今天过得怎么样？',
];
router.get('/hellos', auth, (req, res) => res.json({ ok: true, list: HELLOS }));

module.exports = router;
