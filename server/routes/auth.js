const express = require('express');
const config = require('../config');
const { verifyToken } = require('../utils');
const { db, q, saveSoon } = require('../store');

const router = express.Router();

/** 演示短信网关（生产环境替换为阿里云/腾讯云短信 SDK） */
const codes = new Map(); // phone -> {code, exp}

function sendCode(phone) {
  const code = config.DEMO_SMS ? config.DEMO_SMS_CODE : String(Math.floor(1000 + Math.random() * 9000));
  codes.set(phone, { code, exp: Date.now() + 5 * 60 * 1000 });
  console.log(`[sms] 验证码 ${phone} -> ${code}`);
  return config.DEMO_SMS ? code : true;
}

router.post('/send-code', (req, res) => {
  const { phone } = req.body || {};
  if (!/^1[3-9]\d{9}$/.test(String(phone || ''))) return res.json({ ok: false, msg: '请输入正确的手机号' });
  const sent = sendCode(phone);
  res.json({ ok: true, msg: '验证码已发送', devCode: sent === true ? undefined : sent });
});

router.post('/login', (req, res) => {
  const { phone, code, password } = req.body || {};
  if (!phone) return res.json({ ok: false, msg: '请输入手机号' });
  let user = q.one('users', 'phone', phone);

  if (code) {
    const rec = codes.get(phone);
    if (!rec) return res.json({ ok: false, msg: '请先获取验证码' });
    if (rec.exp < Date.now()) return res.json({ ok: false, msg: '验证码已过期' });
    if (String(rec.code) !== String(code)) return res.json({ ok: false, msg: '验证码错误' });
    codes.delete(phone);
    if (!user) {
      user = q.add('users', {
        id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        phone,
        password: '',
        nickname: 'TianRuo_' + phone.slice(-4),
        gender: '',
        birthday: '',
        avatar: '',
        photos: [],
        bio: '',
        tags: [],
        signature: '',
        city: '',
        lat: null,
        lng: null,
        school: '',
        job: '',
        voice: '',
        online: true,
        lastActive: Date.now(),
        createdAt: Date.now(),
        vip: false,
        verified: false,
        dailyLikes: {},
        fresh: true,
      });
    }
  } else if (password) {
    if (!user || !user.password) return res.json({ ok: false, msg: '账号不存在或未设置密码' });
    const { verifyPassword } = require('../utils');
    if (!verifyPassword(password, user.password)) return res.json({ ok: false, msg: '手机号或密码错误' });
  } else {
    return res.json({ ok: false, msg: '请输入验证码或密码' });
  }

  user.online = true;
  user.lastActive = Date.now();
  saveSoon();
  const token = verifyToken ? null : null;
  const { signToken } = require('../utils');
  res.json({
    ok: true,
    token: signToken({ uid: user.id }),
    user: require('./user').publicUser(user, user),
    isNew: !!user.fresh,
  });
});

router.get('/me', require('./user').auth, (req, res) => {
  res.json({ ok: true, user: require('./user').publicUser(req.user, req.user) });
});

module.exports = router;
