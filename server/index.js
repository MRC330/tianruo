const http = require('http');
const path = require('path');
const express = require('express');
const config = require('./config');
const store = require('./store');
const seed = require('./seed');
const avatar = require('./avatar');
const ws = require('./ws');

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));

// CORS：方便前端用任意服务器地址直连
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 静态资源
app.use('/uploads', express.static(config.UPLOAD_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(config.ROOT, 'public'), { maxAge: '1h', index: 'index.html' }));

// 头像
avatar.registerAvatarRoutes(app);

// API
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    name: '天弱交友服务端',
    version: config.VERSION,
    time: Date.now(),
    users: store.db.users.length,
    moments: store.db.moments.length,
    matches: store.db.matches.length,
    uptime: process.uptime(),
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user').router);
app.use('/api/match', require('./routes/match'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/moment', require('./routes/moment'));
app.use('/api/social', require('./routes/social'));
app.use('/api/upload', require('./upload').router);

// v3.0 玩法 / v4.0 社区 / v5.0 推荐 / v7.0 商业化 / v10.0 管理后台
app.use('/api/game', require('./routes/game').router);
app.use('/api/group', require('./routes/group').router);
app.use('/api/extra', require('./routes/extra').router);
app.use('/api/admin', require('./routes/admin'));

// 表情包 SVG
app.get('/sticker/:id.svg', (req, res) => {
  const faces = {
    1: ['😄', '开心', '#ffd93d'], 2: ['😠', '生气', '#ff6b6b'], 3: ['😍', '爱心', '#ff6b9d'],
    4: ['🤗', '抱抱', '#7c5cff'], 5: ['🤣', '大笑', '#3ddad7'], 6: ['😭', '哭泣', '#6b8cff'],
  };
  const [emoji, name, color] = faces[req.params.id] || faces[1];
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400')
    .send(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <rect width="120" height="120" rx="24" fill="${color}" opacity=".18"/>
    <text x="60" y="66" font-size="56" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
    <text x="60" y="104" font-size="13" text-anchor="middle" fill="${color}" font-weight="700">${name}</text>
  </svg>`);
});

// 404
app.use('/api', (req, res) => res.status(404).json({ ok: false, msg: '接口不存在：' + req.path }));
// SPA 回退：所有非 /api、非静态资源的请求都返回 index.html。
// 注意：Express 4.22+ / 5.x 的 path-to-regexp 已移除裸 '*' 与 '/*splat' 支持，
// 用无路径的 app.use() 作为兜底中间件，Express 4/5 全版本通用。
const indexFile = path.join(config.ROOT, 'public', 'index.html');
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api')) return next();
  if (path.extname(req.path)) return next(); // 有扩展名的静态文件缺失 → 走 404
  res.sendFile(indexFile, (err) => { if (err) next(); });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ ok: false, msg: '服务器开小差了' });
});

function start() {
  store.load();
  const r = seed.run();
  store.save();
  const server = http.createServer(app);
  ws.attach(server);
  server.listen(config.PORT, config.HOST, () => {
    const os = require('os');
    const nets = os.networkInterfaces();
    const ips = [];
    Object.values(nets).flat().forEach((n) => { if (n && n.family === 'IPv4' && !n.internal) ips.push(n.address); });
    console.log('');
    console.log('  ⚡ 天弱交友服务端已启动');
    console.log(`  版本    v${config.VERSION}`);
    console.log(`  本机    http://localhost:${config.PORT}`);
    ips.forEach((ip) => console.log(`  局域网  http://${ip}:${config.PORT}`));
    console.log(`  用户数  ${store.db.users.length}${r.seeded ? '（已注入种子数据）' : ''}`);
    console.log(`  数据    ${config.DATA_DIR}`);
    console.log('');
  });
  return server;
}

if (require.main === module) start();
module.exports = { app, start };
