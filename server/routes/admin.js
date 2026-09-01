/**
 * v10.0 管理后台：数据看板 / 用户管理 / 内容审核 / 举报处理
 * 鉴权：ADMIN_TOKEN 环境变量，或 header x-admin-token
 */
const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const { db, q, saveSoon, uid } = require('../store');
const { publicUser } = require('./user');
const moderate = require('../moderation');

const router = express.Router();
const ADMIN_TOKEN = process.env.TIANRUO_ADMIN_TOKEN || 'tianruo-admin-2024';

function admin(req, res, next) {
  const t = req.headers['x-admin-token'] || req.query.adminToken;
  if (t !== ADMIN_TOKEN) return res.status(403).json({ ok: false, msg: '无权访问' });
  next();
}

/** 管理员登录 */
router.post('/login', (req, res) => {
  const { token } = req.body || {};
  if (token !== ADMIN_TOKEN) return res.json({ ok: false, msg: '管理密钥错误' });
  res.json({ ok: true, token });
});

/** 数据看板 */
router.get('/dashboard', admin, (req, res) => {
  const now = Date.now();
  const day = 86400000;
  const newUsers = (d) => db.users.filter((u) => u.createdAt > now - d).length;
  const activeUsers = (d) => db.users.filter((u) => u.lastActive > now - d).length;
  const msgs = (d) => db.messages.filter((m) => m.createdAt > now - d).length;

  // 7 日趋势
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const start = now - (i + 1) * day;
    const end = now - i * day;
    trend.push({
      date: new Date(end).getMonth() + 1 + '/' + new Date(end).getDate(),
      users: db.users.filter((u) => u.createdAt >= start && u.createdAt < end).length,
      messages: db.messages.filter((m) => m.createdAt >= start && m.createdAt < end).length,
      moments: db.moments.filter((m) => m.createdAt >= start && m.createdAt < end).length,
    });
  }

  // 性别 / 城市分布
  const gender = { 男: 0, 女: 0, 未知: 0 };
  db.users.forEach((u) => { gender[u.gender || '未知'] = (gender[u.gender || '未知'] || 0) + 1; });
  const cityMap = {};
  db.users.forEach((u) => { if (u.city) cityMap[u.city] = (cityMap[u.city] || 0) + 1; });
  const cities = Object.entries(cityMap).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 8);

  res.json({
    ok: true,
    overview: {
      users: db.users.length,
      newToday: newUsers(day),
      newWeek: newUsers(7 * day),
      activeToday: activeUsers(day),
      activeWeek: activeUsers(7 * day),
      online: db.users.filter((u) => u.online).length,
      matches: db.matches.length,
      messages: db.messages.length,
      msgToday: msgs(day),
      moments: db.moments.length,
      reports: db.reports.length,
      vip: db.users.filter((u) => u.vip).length,
    },
    trend, gender, cities,
    version: config.VERSION,
    uptime: process.uptime(),
  });
});

/** 用户列表 */
router.get('/users', admin, (req, res) => {
  const kw = String(req.query.kw || '').trim();
  const page = parseInt(req.query.page || '1', 10);
  const size = parseInt(req.query.size || '20', 10);
  let list = db.users.slice();
  if (kw) list = list.filter((u) => (u.nickname || '').includes(kw) || (u.phone || '').includes(kw) || (u.city || '').includes(kw));
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const total = list.length;
  const pageList = list.slice((page - 1) * size, page * size).map((u) => ({
    id: u.id, nickname: u.nickname, phone: u.phone, gender: u.gender, age: null,
    city: u.city, online: !!u.online, vip: !!u.vip, banned: !!u.banned,
    createdAt: u.createdAt, lastActive: u.lastActive, coins: u.coins || 0,
    moments: db.moments.filter((m) => m.userId === u.id).length,
  }));
  res.json({ ok: true, list: pageList, total, page, size });
});

/** 封禁 / 解封 */
router.post('/user/:id/ban', admin, (req, res) => {
  const u = q.one('users', 'id', req.params.id);
  if (!u) return res.json({ ok: false, msg: '用户不存在' });
  u.banned = req.body.ban !== false;
  u.banReason = req.body.reason || '违反社区规范';
  saveSoon();
  res.json({ ok: true, banned: u.banned });
});

/** 内容审核：动态列表 + 删除 */
router.get('/moments', admin, (req, res) => {
  const list = db.moments.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 100).map((m) => {
    const u = q.one('users', 'id', m.userId);
    const chk = moderate.check(m.text);
    return {
      id: m.id, text: m.text, images: m.images, topic: m.topic,
      likes: (m.likes || []).length, comments: (m.comments || []).length,
      createdAt: m.createdAt, risky: !chk.pass, hits: chk.hits,
      user: u ? { id: u.id, nickname: u.nickname } : null,
    };
  });
  res.json({ ok: true, list });
});

router.post('/moment/:id/delete', admin, (req, res) => {
  q.del('moments', (m) => m.id === req.params.id);
  res.json({ ok: true });
});

/** 举报处理 */
router.get('/reports', admin, (req, res) => {
  const list = db.reports.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 100).map((r) => ({
    ...r,
    from: publicUser(q.one('users', 'id', r.fromId), null),
    to: publicUser(q.one('users', 'id', r.toId), null),
  }));
  res.json({ ok: true, list });
});

router.post('/report/:id/resolve', admin, (req, res) => {
  const r = q.one('reports', 'id', req.params.id);
  if (!r) return res.json({ ok: false });
  r.resolved = true;
  r.resolveNote = req.body.note || '';
  if (req.body.banUser) {
    const u = q.one('users', 'id', r.toId);
    if (u) { u.banned = true; u.banReason = '举报成立：' + (r.reason || ''); }
  }
  saveSoon();
  res.json({ ok: true });
});

/** 系统广播 */
router.post('/broadcast', admin, (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.json({ ok: false });
  db.users.forEach((u) => {
    q.add('notifications', { id: uid('n_'), userId: u.id, type: 'system', text, read: false, createdAt: Date.now() });
  });
  saveSoon();
  res.json({ ok: true, count: db.users.length });
});

module.exports = router;
