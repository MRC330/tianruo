const path = require('path');

/** 头像 SVG 生成，零外部依赖，永不 404 */
function avatarSvg(seed, size = 200) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 131 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const hue2 = (hue + 40 + (h % 60)) % 360;
  let e = 0;
  for (const ch of String(seed)) e = (e * 31 + ch.charCodeAt(0)) >>> 0;
  const emoji = ['🦊','🐼','🐯','🐨','🐸','🐵','🦁','🐷','🐮','🐔','🦄','🐙','🐳','🦋','🌸','🍑','🍓','🌙','⭐','🔥','💫','🎧','🎮','🍭'][e % 24];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},85%,62%)"/>
      <stop offset="100%" stop-color="hsl(${hue2},85%,52%)"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" rx="${size > 120 ? 40 : 100}" fill="url(#g)"/>
  <circle cx="100" cy="82" r="34" fill="rgba(255,255,255,.92)"/>
  <text x="100" y="152" font-size="64" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
</svg>`;
}

function registerAvatarRoutes(app) {
  app.get('/avatar/:seed', (req, res) => {
    const size = Math.min(600, Math.max(32, parseInt(req.query.size || '200', 10)));
    res.type('image/svg+xml');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(avatarSvg(req.params.seed, size));
  });
}

/** 1x1 透明占位图 */
function placeholder(req, res) {
  res.type('image/svg+xml').send(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#1b1b24"/></svg>`
  );
}

module.exports = { avatarSvg, registerAvatarRoutes, placeholder };
