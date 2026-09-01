/**
 * 内容安全：敏感词过滤 + 风险检测
 * 采用 敏感词库 + 变体归一化（去空格/标点/繁简/大小写）匹配
 */
const BAD_WORDS = [
  '傻逼', '傻b', '煞笔', '智障', '脑残', '垃圾人', '去死', '滚蛋', '废物', '白痴',
  '妈的', '草泥马', '尼玛', '狗东西', '贱人', '婊子', '操你', '日你',
  '约炮', '一夜情', '援交', '包养', '裸聊', '约吗', '做爱', '性交', '色情', '成人影片',
  '兼职刷单', '博彩', '赌场', '迷奸', '催情',
  'fuck', 'shit', 'bitch', 'asshole',
];

// 归一化：去掉非字母数字汉字字符，全角转半角，大写转小写
function normalize(s) {
  return String(s)
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .toLowerCase();
}

function check(text) {
  const raw = String(text || '');
  const norm = normalize(raw);
  const hits = [];
  for (const w of BAD_WORDS) {
    const nw = normalize(w);
    if (nw && norm.includes(nw)) hits.push(w);
  }
  // 联系方式 / 引流检测（软处理：打标 + 后台复核，不直接阻断）
  const patterns = [
    /微信|weixin|wechat|vx\b|wx\b/i,
    /qq|扣扣|q号/i,
    /\b[1-9]\d{5,11}\b/,
    /1[3-9]\d{9}/,
    /\b[a-zA-Z][a-zA-Z0-9_-]{5,19}\b(?=.*(?:号|加|联系))/,
    /扫码|二维码|群聊|私聊我|加我/i,
  ];
  let contact = null;
  for (const p of patterns) if (p.test(raw)) { contact = 'contact'; break; }

  return {
    pass: hits.length === 0,
    hits,
    risk: contact || null,
    masked: mask(raw),
  };
}

function mask(text) {
  let out = String(text || '');
  const norm = normalize(out);
  for (const w of BAD_WORDS) {
    const nw = normalize(w);
    if (nw && norm.includes(nw)) {
      out = out.split(w).join('*'.repeat(w.length));
    }
  }
  return out;
}

/** 用户行为风控：短时间大量操作 */
const bucket = new Map();
function rate(key, limit = 20, windowMs = 60000) {
  const now = Date.now();
  const arr = (bucket.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  bucket.set(key, arr);
  return arr.length <= limit;
}

module.exports = { check, mask, normalize, rate, BAD_WORDS };
