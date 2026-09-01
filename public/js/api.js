/* API 请求封装：所有请求走 TIANRUO_CONFIG.server，换服务器地址即换后端 */
(function () {
  const C = window.TIANRUO_CONFIG;

  function url(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return (C.server || '') + path;
  }

  async function request(method, path, body, opts) {
    const o = opts || {};
    const headers = { 'Content-Type': 'application/json' };
    if (C.token) headers['Authorization'] = 'Bearer ' + C.token;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (o.timeout || 15000));
    try {
      const res = await fetch(url(path), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { data = { ok: false, msg: '返回格式错误：' + text.slice(0, 80) }; }
      if (res.status === 401) {
        C.setToken('');
        if (window.SPARK_APP && window.SPARK_APP.onUnauthorized) window.SPARK_APP.onUnauthorized();
      }
      return data;
    } catch (e) {
      clearTimeout(timer);
      return { ok: false, msg: e.name === 'AbortError' ? '请求超时，检查服务器地址' : '网络错误，无法连接服务器', net: true };
    }
  }

  window.api = {
    get: (p, o) => request('GET', p, null, o),
    post: (p, b, o) => request('POST', p, b, o),
    del: (p, o) => request('DELETE', p, null, o),
    upload: async function (file) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await fetch(url('/api/upload'), {
          method: 'POST',
          headers: C.token ? { Authorization: 'Bearer ' + C.token } : {},
          body: fd,
        });
        return await res.json();
      } catch (e) {
        return { ok: false, msg: '上传失败：' + e.message };
      }
    },
    // 具体接口
    sendCode: (phone) => request('POST', '/api/auth/send-code', { phone }),
    login: (phone, code) => request('POST', '/api/auth/login', { phone, code }),
    loginPwd: (phone, password) => request('POST', '/api/auth/login', { phone, password }),
    me: () => request('GET', '/api/auth/me'),
    cards: (gender) => request('GET', '/api/match/cards' + (gender ? '?gender=' + gender : '')),
    swipe: (toId, type) => request('POST', '/api/match/swipe', { toId, type }),
    matchList: () => request('GET', '/api/match/list'),
    unmatch: (id) => request('DELETE', '/api/match/' + id),
    quota: () => request('GET', '/api/match/quota'),
    chatList: () => request('GET', '/api/chat/list'),
    chat: (id) => request('GET', '/api/chat/' + id),
    send: (id, content, type, extra, replyTo) => request('POST', '/api/chat/' + id + '/send', { content, type, extra, replyTo }),
    read: (id) => request('POST', '/api/chat/' + id + '/read'),
    typing: (id) => request('POST', '/api/chat/' + id + '/typing'),
    revoke: (messageId) => request('POST', '/api/chat/revoke', { messageId }),
    feed: (params) => request('GET', '/api/moment/feed' + (params ? '?' + params : '')),
    publish: (text, images, topic) => request('POST', '/api/moment/publish', { text, images, topic }),
    likeMoment: (id) => request('POST', '/api/moment/' + id + '/like'),
    comment: (id, text) => request('POST', '/api/moment/' + id + '/comment', { text }),
    delMoment: (id) => request('DELETE', '/api/moment/' + id),
    topics: () => request('GET', '/api/moment/topics'),
    notifications: () => request('GET', '/api/social/notifications'),
    readNotify: (id) => request('POST', '/api/social/read', id ? { id } : {}),
    badge: () => request('GET', '/api/social/badge'),
    hellos: () => request('GET', '/api/social/hellos'),
    profile: (id) => request('GET', '/api/user/profile/' + id),
    update: (data) => request('POST', '/api/user/update', data),
    location: (lat, lng, city) => request('POST', '/api/user/location', { lat, lng, city }),
    nearby: (q) => request('GET', '/api/user/nearby' + (q ? '?' + q : '')),
    likesMe: () => request('GET', '/api/user/likes-me'),
    visitors: () => request('GET', '/api/user/visitors'),
    search: (kw) => request('GET', '/api/user/search?kw=' + encodeURIComponent(kw)),
    block: (userId) => request('POST', '/api/user/block', { userId }),
    report: (userId, reason) => request('POST', '/api/user/report', { userId, reason }),
    health: () => request('GET', '/api/health', null, { timeout: 6000 }),

    // v3.0 玩法
    tianruo: () => request('GET', '/api/game/tianruo'),
    tianruoOf: (mid) => request('GET', '/api/game/tianruo/' + mid),
    tasks: () => request('GET', '/api/game/tasks'),
    claim: (id) => request('POST', '/api/game/task/claim', { id }),
    checkin: () => request('GET', '/api/game/checkin'),
    doCheckin: () => request('POST', '/api/game/checkin'),
    questions: () => request('GET', '/api/game/questions'),
    saveAnswers: (answers) => request('POST', '/api/game/answers', { answers }),
    compat: (uid) => request('GET', '/api/game/compat/' + uid),
    flashEnter: () => request('POST', '/api/game/flash/enter'),
    flashGet: (rid) => request('GET', '/api/game/flash/' + rid),
    flashSend: (rid, content) => request('POST', '/api/game/flash/' + rid + '/send', { content }),
    flashReveal: (rid) => request('POST', '/api/game/flash/' + rid + '/reveal'),
    flashLeave: (rid) => request('POST', '/api/game/flash/' + rid + '/leave'),

    // v4.0 社区
    circles: () => request('GET', '/api/group/circles'),
    circleJoin: (groupId) => request('POST', '/api/group/join', { groupId }),
    circleMsgs: (groupId, limit) => request('GET', `/api/group/messages?groupId=${encodeURIComponent(groupId)}&limit=${limit || 60}`),
    circleSend: (groupId, content) => request('POST', '/api/group/send', { groupId, content }),
    replyMoment: (id, text, parentId) => request('POST', '/api/group/moment/' + id + '/reply', { text, parentId }),
    likeComment: (cid) => request('POST', '/api/group/comment/' + cid + '/like'),
    hot: () => request('GET', '/api/group/hot'),
    rank: () => request('GET', '/api/group/rank'),

    // v5.0 推荐 / v7.0 商业化
    recommend: (gender) => request('GET', '/api/extra/recommend' + (gender ? '?gender=' + gender : '')),
    why: (uid) => request('GET', '/api/extra/why/' + uid),
    invite: () => request('GET', '/api/extra/invite'),
    useInvite: (code) => request('POST', '/api/extra/invite/use', { code }),
    gifts: () => request('GET', '/api/extra/gifts'),
    sendGift: (toId, giftId) => request('POST', '/api/extra/gift/send', { toId, giftId }),
    vipPlans: () => request('GET', '/api/extra/vip/plans'),
    buyVip: (planId, pay) => request('POST', '/api/extra/vip/buy', { planId, pay }),
    recharge: (amount) => request('POST', '/api/extra/coins/recharge', { amount }),

    // 聊天增强
    chatPage: (mid, before, limit) => request('GET', `/api/chat/${mid}?limit=${limit || 30}${before ? '&before=' + before : ''}`),
    searchMsg: (mid, kw) => request('GET', `/api/chat/${mid}/search?kw=` + encodeURIComponent(kw)),
    chatSettings: (mid, data) => request('POST', '/api/chat/' + mid + '/settings', data),
    stickers: () => request('GET', '/api/chat/stickers'),
  };
})();
