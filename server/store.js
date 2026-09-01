/**
 * 极简 JSON 持久化存储层。
 * 单文件、零外部依赖，方便一键部署；生产环境可替换为 MySQL / MongoDB。
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

const DEFAULT = {
  users: [],
  swipes: [],
  matches: [],
  messages: [],
  moments: [],
  notifications: [],
  visits: [],
  reports: [],
  blocks: [],
  topics: [],
  smsCodes: [],
  counters: { user: 0, message: 0, moment: 0, swipe: 0, match: 0 },
};

let db = null;
let saveTimer = null;

function ensureDir() {
  if (!fs.existsSync(config.DATA_DIR)) fs.mkdirSync(config.DATA_DIR, { recursive: true });
  if (!fs.existsSync(config.UPLOAD_DIR)) fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
}

function file() {
  return path.join(config.DATA_DIR, 'db.json');
}

function load() {
  // 幂等：模块内的 db 只能初始化一次。
  // 否则重复 load() 会替换 db 引用，导致已解构 db 的路由模块指向旧对象（写入成功却读不到）。
  if (db) return db;
  ensureDir();
  if (fs.existsSync(file())) {
    try {
      db = JSON.parse(fs.readFileSync(file(), 'utf8'));
    } catch (e) {
      console.error('[store] db.json 解析失败，已备份并使用空库', e.message);
      fs.copyFileSync(file(), file() + '.bak.' + Date.now());
      db = null;
    }
  }
  if (!db) db = JSON.parse(JSON.stringify(DEFAULT));
  for (const k of Object.keys(DEFAULT)) if (!db[k]) db[k] = JSON.parse(JSON.stringify(DEFAULT[k]));
  return db;
}

function save() {
  ensureDir();
  const tmp = file() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, file());
}

function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { save(); } catch (e) { console.error('[store] 保存失败', e); }
  }, 300);
}

function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nextId(coll, prefix) {
  const k = 'counters';
  db[k][coll] = (db[k][coll] || 0) + 1;
  return prefix ? prefix + db[k][coll] : db[k][coll];
}

// 查询助手
const q = {
  by: (coll, field, val) => db[coll].filter((x) => x[field] === val),
  one: (coll, field, val) => db[coll].find((x) => x[field] === val),
  find: (coll, fn) => db[coll].find(fn),
  filter: (coll, fn) => db[coll].filter(fn),
  add: (coll, obj) => { db[coll].push(obj); saveSoon(); return obj; },
  del: (coll, fn) => {
    const before = db[coll].length;
    db[coll] = db[coll].filter((x) => !fn(x));
    if (before !== db[coll].length) saveSoon();
  },
};

/** 强制从磁盘重灌（仅在需要回滚数据时使用） */
function reload() {
  db = null;
  return load();
}

module.exports = { load, reload, save, saveSoon, uid, nextId, q, get db() { return db || load(); } };
