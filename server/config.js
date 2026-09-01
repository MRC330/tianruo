const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

/** 加载 .env 文件（零依赖，不覆盖已有环境变量） */
(function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  try {
    const txt = fs.readFileSync(file, 'utf8');
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      // 去掉包裹引号
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && process.env[k] === undefined) process.env[k] = v;
    }
  } catch (e) {
    /* .env 读取失败不影响启动 */
  }
})();

module.exports = {
  ROOT,
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  // JWT 密钥，生产环境请通过环境变量覆盖
  SECRET: process.env.TIANRUO_SECRET || 'tianruo-social-secret-change-me',
  DATA_DIR: process.env.SPARK_DATA || path.join(ROOT, 'data'),
  UPLOAD_DIR: process.env.SPARK_UPLOAD || path.join(ROOT, 'data', 'uploads'),
  // 演示模式：短信验证码固定为 1234，关闭后走真实短信网关（在 sms.js 里接入）
  DEMO_SMS: process.env.SPARK_DEMO_SMS !== 'false',
  DEMO_SMS_CODE: process.env.SPARK_SMS_CODE || '1234',
  // 每日喜欢额度（免费用户）
  DAILY_LIKE_LIMIT: parseInt(process.env.SPARK_DAILY_LIKE || '50', 10),
  SUPER_LIKE_LIMIT: parseInt(process.env.SPARK_SUPER_LIKE || '5', 10),
  VERSION: require('../package.json').version,
};
