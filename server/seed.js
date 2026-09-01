/**
 * 种子数据：预置一批虚拟用户，让新用户一登录就有内容可刷。
 * 幂等：已存在则不重复插入。
 */
const { db, q, saveSoon } = require('./store');
const { hashPassword } = require('./utils');

const CITIES = [
  { name: '杭州', lat: 30.2741, lng: 120.1551 },
  { name: '上海', lat: 31.2304, lng: 121.4737 },
  { name: '北京', lat: 39.9042, lng: 116.4074 },
  { name: '成都', lat: 30.5728, lng: 104.0668 },
  { name: '广州', lat: 23.1291, lng: 113.2644 },
  { name: '深圳', lat: 22.5431, lng: 114.0579 },
  { name: '武汉', lat: 30.5928, lng: 114.3055 },
  { name: '西安', lat: 34.3416, lng: 108.9398 },
  { name: '长沙', lat: 28.2282, lng: 112.9388 },
  { name: '南京', lat: 32.0603, lng: 118.7969 },
];

const PEOPLE = [
  ['小鹿乱撞', '女', '2003-04-12', '喜欢一切毛茸茸的东西 🐰', ['摄影', '猫咖', '手帐'], '一个人的电影也不错'],
  ['阿泽', '男', '2002-11-03', '篮球 / 说唱 / 深夜食堂', ['篮球', '说唱', '健身'], '想找个能一起看日出的人'],
  ['柚子茶', '女', '2004-01-28', '甜品胃，拍照狂魔', ['甜品', '穿搭', '旅行'], '今天也在认真生活'],
  ['Kiko', '女', '2001-08-09', '独立音乐爱好者，吉他自学中', ['吉他', 'livehouse', '咖啡'], '用歌单代替自我介绍'],
  ['大熊', '男', '2000-05-21', '程序员，周末爬山', ['爬山', '代码', '咖啡'], '敲代码的手也能牵你'],
  ['海盐可可', '女', '2003-09-16', '跳舞十年，教爵士', ['舞蹈', '穿搭', '美妆'], '来一起出汗吗'],
  ['十七', '男', '2004-03-07', '滑板少年，摔了也要帅', ['滑板', '摄影', '游戏'], '风会记得我们一起走过'],
  ['Luna', '女', '2002-12-25', '深夜写歌，白天睡觉', ['音乐', '星座', '塔罗'], '月亮不睡我不睡'],
  ['陈皮', '男', '2001-06-30', '做饭一级，洗碗二级', ['做饭', '电影', '骑行'], '投喂你是我最大的爱好'],
  ['Momo', '女', '2003-02-14', '插画师，颜色控', ['插画', '手帐', '猫'], '用画笔记录生活碎片'],
  ['阿凯', '男', '2000-10-08', '摄影后期，城市漫步', ['摄影', '旅行', '咖啡'], '想把世界拍给你看'],
  ['小满', '女', '2004-06-01', '汉服娘，古风控', ['汉服', '古风', '拍照'], '二十四节气都很可爱'],
  ['野比', '男', '2002-04-19', '二次元，手办收藏家', ['动漫', '游戏', '手办'], '现实太苦，来二次元吧'],
  ['糖糖', '女', '2003-11-11', '宠物店打工，狗子比我亲人', ['宠物', '跑步', '奶茶'], '撸狗请排队'],
  ['Leo', '男', '2001-01-05', '留学回来，喜欢做饭', ['做饭', '健身', '旅行'], '走过很多路，想遇见你'],
  ['西瓜', '女', '2004-07-22', '高考完的暑假，想找搭子', ['追剧', '奶茶', '小说'], '暑假不要一个人过'],
  ['毛毛', '男', '2003-08-30', '乐队鼓手，白天上班', ['鼓', '摇滚', '啤酒'], '节奏即自由'],
  ['Cici', '女', '2002-03-18', '瑜伽老师，早起星人', ['瑜伽', '养生', '阅读'], '自律给我自由'],
  ['老白', '男', '2000-09-09', '咖啡师，拉花还行', ['咖啡', '电影', '猫'], '一杯拿铁换一个故事'],
  ['南栀', '女', '2003-05-06', '花艺师，喜欢雨天', ['花艺', '阅读', '散步'], '愿你如花般盛开'],
  ['阿飞', '男', '2004-02-02', '电竞少年，王者荣耀', ['游戏', '电竞', '零食'], '上分搭子有没有'],
  ['桃桃', '女', '2002-07-15', '甜品师，自己做蛋糕', ['烘焙', '摄影', '旅行'], '甜的部分要分享'],
  ['阿岩', '男', '2001-12-03', '潜水教练，海边长大', ['潜水', '冲浪', '旅行'], '海里有另一个世界'],
  ['安安', '女', '2003-10-20', '师范生，喜欢小朋友', ['教育', '手工', '音乐'], '想当个温柔的人'],
  ['小K', '男', '2000-03-25', '创业中，熬夜冠军', ['创业', '阅读', '跑步'], '忙但值得'],
  ['布丁', '女', '2004-04-08', '刚上大学，什么都不会', ['追剧', '美食', '睡觉'], '大学四年请多指教'],
  ['阿德', '男', '2002-09-14', '骑摩托，环岛过', ['摩托', '旅行', '摄影'], '风是自由的形状'],
  ['Nini', '女', '2001-11-27', '空乘，飞了十几个国家', ['旅行', '穿搭', '摄影'], '世界很大，我想带你看看'],
  ['大壮', '男', '2003-01-19', '健身两年，体型还行', ['健身', '篮球', '做饭'], '自律是最长情的告白'],
  ['小七', '女', '2002-06-08', '心理咨询在读，很会听', ['心理', '阅读', '瑜伽'], '你愿意说说吗'],
];

const MOMENT_TEXTS = [
  '今天的晚霞绝了 🌇',
  '新买的相机到了，随手拍一张',
  '一个人吃火锅也没那么孤独',
  '终于把那首歌弹下来了！',
  '周末去爬山，有人一起吗',
  '这家咖啡店的拉花有点东西',
  '深夜emo，想找人聊聊',
  '今日份穿搭 ✓',
  '跑完五公里，活着真好',
  '猫主子又占领了我的床',
  '试了新配方，味道还不错',
  '记录一下今天的天空',
];

const TOPICS = [
  { name: '#今日穿搭', desc: '分享你的今日 OOTD', hot: 12800 },
  { name: '#深夜碎碎念', desc: '深夜里的真心话', hot: 9600 },
  { name: '#找一个搭子', desc: '找人一起吃饭看电影', hot: 15200 },
  { name: '#周末去哪儿', desc: '周末活动分享', hot: 7300 },
  { name: '#我的毛孩子', desc: '晒晒你家主子', hot: 18900 },
  { name: '#一起听歌', desc: '交换歌单', hot: 5400 },
];

function run() {
  if (db.users.length > 3) return { seeded: false, count: db.users.length };

  // 演示账号
  const demoPwd = hashPassword('123456');
  const demo = {
    id: 'u_demo',
    phone: '13800000000',
    password: demoPwd,
    nickname: '你',
    gender: '男',
    birthday: '2003-01-01',
    avatar: '',
    photos: [],
    bio: '这是我的 天弱 个人简介',
    tags: ['摄影', '音乐'],
    city: '杭州',
    lat: 30.2741,
    lng: 120.1551,
    school: '',
    job: '',
    voice: '',
    online: true,
    lastActive: Date.now(),
    createdAt: Date.now(),
    vip: true,
    verified: true,
    dailyLikes: {},
  };
  if (!q.one('users', 'id', 'u_demo')) q.add('users', demo);

  PEOPLE.forEach((p, i) => {
    const [nickname, gender, birthday, bio, tags, signature] = p;
    const city = CITIES[i % CITIES.length];
    const id = 'u_seed_' + (i + 1);
    if (q.one('users', 'id', id)) return;
    const lat = city.lat + (Math.random() - 0.5) * 0.18;
    const lng = city.lng + (Math.random() - 0.5) * 0.18;
    q.add('users', {
      id,
      phone: '139' + String(10000000 + i),
      password: demoPwd,
      nickname,
      gender,
      birthday,
      avatar: '',
      photos: [],
      bio,
      tags,
      signature,
      city: city.name,
      lat,
      lng,
      school: ['浙江大学', '武汉大学', '四川大学', '南京艺术学院', '厦门大学'][i % 5],
      job: ['学生', '设计师', '程序员', '自由职业', '老师'][i % 5],
      voice: '',
      online: Math.random() > 0.4,
      lastActive: Date.now() - Math.floor(Math.random() * 86400000),
      createdAt: Date.now() - Math.floor(Math.random() * 30 * 86400000),
      vip: Math.random() > 0.7,
      verified: Math.random() > 0.5,
      dailyLikes: {},
      seed: true,
    });
  });

  TOPICS.forEach((t) => {
    if (!q.one('topics', 'name', t.name)) q.add('topics', { id: 't_' + t.name, ...t, createdAt: Date.now() });
  });

  // 动态
  const users = db.users.filter((u) => u.id !== 'u_demo');
  for (let i = 0; i < 24; i++) {
    const u = users[Math.floor(Math.random() * users.length)];
    const topic = Math.random() > 0.55 ? TOPICS[Math.floor(Math.random() * TOPICS.length)].name : '';
    q.add('moments', {
      id: 'm_seed_' + i,
      userId: u.id,
      text: MOMENT_TEXTS[Math.floor(Math.random() * MOMENT_TEXTS.length)],
      images: [],
      topic,
      likes: users.slice(0, Math.floor(Math.random() * 8)).map((x) => x.id),
      comments: [],
      createdAt: Date.now() - Math.floor(Math.random() * 7 * 86400000),
    });
  }

  // 让 demo 账号已有几个匹配，方便体验聊天
  ['u_seed_1', 'u_seed_3', 'u_seed_11'].forEach((uid, idx) => {
    const matchId = 'm_seed_match_' + idx;
    q.add('matches', { id: matchId, users: ['u_demo', uid], createdAt: Date.now() - (idx + 1) * 3600000, lastAt: Date.now() });
    const conv = [
      ['你好呀 👋', uid],
      ['嗨，看到你在附近', 'u_demo'],
      ['对呀，我在杭州，你呢？', uid],
    ];
    conv.forEach(([text, from], k) => {
      q.add('messages', {
        id: 'msg_seed_' + idx + '_' + k,
        matchId,
        fromId: from,
        type: 'text',
        content: text,
        createdAt: Date.now() - (conv.length - k) * 60000,
        read: k < 2,
      });
    });
    q.add('swipes', { id: 's_seed_' + idx, fromId: 'u_demo', toId: uid, type: 'like', createdAt: Date.now() });
    q.add('swipes', { id: 's_seed_b_' + idx, fromId: uid, toId: 'u_demo', type: 'like', createdAt: Date.now() });
  });

  // 一些"喜欢我的人"
  ['u_seed_5', 'u_seed_17', 'u_seed_23'].forEach((uid, i) => {
    q.add('swipes', { id: 's_seed_like_' + i, fromId: uid, toId: 'u_demo', type: i === 0 ? 'super' : 'like', createdAt: Date.now() - i * 600000 });
  });

  saveSoon();
  return { seeded: true, count: db.users.length };
}

module.exports = { run, CITIES, TOPICS, MOMENT_TEXTS };
