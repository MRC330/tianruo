/* App 主体：路由 / TabBar / WebSocket */
(function () {
  const C = window.TIANRUO_CONFIG;
  const app = {
    me: C.profile,
    page: null,
    params: {},
    ws: null,
    handlers: {},
    badge: { message: 0, notification: 0 },
  };
  window.app = app;

  const ROOT = () => document.getElementById('app');
  const TABS = [
    { k: 'deck', icon: '⚡', label: '火花' },
    { k: 'square', icon: '🌍', label: '广场' },
    { k: 'messages', icon: '💬', label: '消息' },
    { k: 'me', icon: '👤', label: '我的' },
  ];

  /* ---------- 路由 ---------- */
  app.go = function (name, params) {
    const page = window.PAGES[name];
    if (!page) return toast('页面不存在：' + name);
    app.params = params || {};
    history.pushState({ page: name, params: app.params }, '', '#' + name);
    render(name);
  };

  app.replace = function (name, params) {
    app.params = params || {};
    history.replaceState({ page: name, params: app.params }, '', '#' + name);
    render(name);
  };

  function render(name) {
    const P = window.PAGES[name];
    const inst = P();
    app.page = inst;
    const root = ROOT();
    root.innerHTML = inst.html;
    const isTab = TABS.some((t) => t.k === inst.tab);
    if (isTab) {
      const bar = document.createElement('div');
      bar.className = 'tabbar';
      bar.innerHTML = TABS.map((t) => `<button class="tab ${t.k === inst.tab ? 'active' : ''}" data-tab="${t.k}">
        <span class="ti">${t.icon}</span><span>${t.label}</span>
        ${t.k === 'messages' && app.badge.message ? `<span class="dot" data-dot>${app.badge.message}</span>` : ''}
      </button>`).join('');
      root.appendChild(bar);
      bar.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => {
        if (b.dataset.tab === inst.tab) return;
        app.replace(b.dataset.tab);
      }));
    }
    inst.mount && inst.mount(root, app, app.params);
    window.scrollTo(0, 0);
  }

  app.onShow = function () {
    const inst = app.page;
    if (inst && inst.onShow) inst.onShow(ROOT(), app);
  };

  window.addEventListener('popstate', (e) => {
    const s = e.state || {};
    const name = s.page || (C.token ? 'deck' : 'auth');
    app.params = s.params || {};
    render(name);
  });

  /* ---------- 登录 ---------- */
  app.afterLogin = function (r) {
    C.setToken(r.token);
    app.me = r.user;
    C.setProfile(r.user);
    connectWs();
    if (r.isNew || !r.user.nickname || r.user.fresh) {
      toast('欢迎来到 天弱，先完善一下资料吧');
      app.replace('edit', { first: true });
    } else {
      app.replace('deck');
    }
    locate();
  };

  app.onUnauthorized = function () {
    C.setToken('');
    app.replace('auth');
    toast('登录已失效，请重新登录');
  };

  function locate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => api.location(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { timeout: 6000 }
    );
  }

  /* ---------- WebSocket ---------- */
  function connectWs() {
    if (!C.token) return;
    try {
      const url = C.wsUrl() + '?token=' + encodeURIComponent(C.token);
      const ws = new WebSocket(url);
      app.ws = ws;
      ws.onmessage = (e) => {
        let d; try { d = JSON.parse(e.data); } catch (err) { return; }
        if (d.type === 'pong' || d.type === 'ping' || d.type === 'hello') return;
        dispatch(d);
      };
      ws.onclose = () => { setTimeout(() => { if (C.token) connectWs(); }, 4000); };
      ws.onerror = () => {};
    } catch (e) {}
  }

  function dispatch(d) {
    const list = app.handlers[d.type] || [];
    list.forEach((fn) => { try { fn(d); } catch (e) {} });
    if (d.type === 'message' || d.type === 'match' || d.type === 'like') {
      refreshBadge();
      if (d.type === 'message' && window.Notification && Notification.permission === 'granted') {
        try { new Notification('新消息', { body: d.message.content.slice(0, 40) }); } catch (e) {}
      }
    }
  }

  app.onWs = function (type, fn) {
    // 每个页面挂载时重置该类型的处理器，避免跨页串扰
    (app.handlers[type] = app.handlers[type] || []).push(fn);
    return fn;
  };

  app.setBadge = function (b) {
    app.badge = b;
    const dot = document.querySelector('[data-dot]');
    if (dot) {
      if (b.message) { dot.style.display = ''; dot.textContent = b.message; }
      else dot.style.display = 'none';
    }
    app.handlers._badge && app.handlers._badge.forEach((f) => f(b));
  };

  app.refreshBadge = async function () {
    const r = await api.badge();
    if (r.ok) app.setBadge(r);
    return r.ok ? r : { message: 0, notification: 0 };
  };

  /* ---------- 匹配成功 ---------- */
  app.onMatched = function (user, matchId, jump) {
    const box = document.createElement('div');
    box.className = 'match-pop';
    box.innerHTML = `<h2>⚡ 匹配成功</h2>
      <div class="match-avatars">
        <img src="${esc(app.me && app.me.avatar ? app.me.avatar : '/avatar/me')}">
        <span style="font-size:26px">💕</span>
        <img src="${esc(user.avatar)}">
      </div>
      <p>你和 <b style="color:#fff">${esc(user.nickname)}</b> 互相喜欢</p>
      <button class="btn btn-primary" style="width:200px" data-chat>💬 去聊天</button>
      <button class="btn btn-ghost" style="width:200px" data-close>继续滑动</button>`;
    document.body.appendChild(box);
    box.querySelector('[data-close]').onclick = () => box.remove();
    box.querySelector('[data-chat]').onclick = () => { box.remove(); app.go('chat', { matchId, uid: user.id }); };
    if (jump) setTimeout(() => { box.remove(); app.go('chat', { matchId, uid: user.id }); }, 900);
  };

  /* ---------- 发布动态 ---------- */
  app.publishSheet = function (done) {
    let images = [];
    let topic = '';
    sheet(
      `<div style="font-weight:700;margin-bottom:10px">发布动态</div>
       <textarea class="input" id="mText" rows="4" placeholder="此刻在想什么…" style="resize:none"></textarea>
       <div id="mImgs" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"></div>
       <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
         <button class="btn btn-sm" id="mPic">🖼 图片</button>
         <button class="btn btn-sm" id="mTopic">🏷 话题</button>
         <span id="mTopicName" style="color:#b9a8ff;font-size:13px"></span>
       </div>
       <input type="file" id="mFile" accept="image/*" multiple style="display:none">
       <button class="btn btn-primary btn-block" id="mSend">发布</button>`,
      (s, close) => {
        s.querySelector('#mPic').onclick = () => s.querySelector('#mFile').click();
        s.querySelector('#mFile').onchange = async (e) => {
          for (const f of Array.from(e.target.files).slice(0, 9 - images.length)) {
            const r = await api.upload(f);
            if (r.ok) images.push(r.url);
          }
          renderImgs(s);
        };
        s.querySelector('#mTopic').onclick = async () => {
          const r = await api.topics();
          if (!r.ok) return;
          const names = r.list.map((t) => t.name);
          const pick = prompt('输入话题，可选：\n' + names.join(' '), names[0] || '');
          if (pick) { topic = pick; s.querySelector('#mTopicName').textContent = topic; }
        };
        s.querySelector('#mSend').onclick = async () => {
          const text = s.querySelector('#mText').value.trim();
          if (!text && !images.length) return toast('说点什么吧');
          const r = await api.publish(text, images, topic);
          if (!r.ok) return toast(r.msg);
          toast('发布成功 ✨');
          close();
          done && done();
        };
      }
    );
    function renderImgs(s) {
      s.querySelector('#mImgs').innerHTML = images.map((u, i) => `<div style="position:relative">
        <img src="${esc(u)}" style="width:64px;height:64px;object-fit:cover;border-radius:10px">
        <button data-i="${i}" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;
          background:var(--pink);border:none;color:#fff;font-size:12px;line-height:1">×</button></div>`).join('');
      s.querySelectorAll('#mImgs button').forEach((b) => (b.onclick = () => { images.splice(+b.dataset.i, 1); renderImgs(s); }));
    }
  };

  /* ---------- 筛选 ---------- */
  app.filterSheet = function (done) {
    let gender = localStorage.getItem('tianruo_filter_gender') || '';
    sheet(
      `<div style="font-weight:700;margin-bottom:12px">推荐筛选</div>
       <div style="font-size:13px;color:var(--sub);margin-bottom:8px">想看</div>
       <div id="fg">${['', '女', '男'].map((g) => `<span class="tag ${gender === g ? 'on' : ''}" data-g="${g}">${g === '' ? '不限' : g === '女' ? '女生' : '男生'}</span>`).join('')}</div>
       <button class="btn btn-primary btn-block" id="fOk">应用</button>`,
      (s, close) => {
        s.querySelectorAll('#fg .tag').forEach((t) => (t.onclick = () => {
          gender = t.dataset.g;
          s.querySelectorAll('#fg .tag').forEach((x) => x.classList.toggle('on', x.dataset.g === gender));
        }));
        s.querySelector('#fOk').onclick = () => {
          localStorage.setItem('tianruo_filter_gender', gender);
          close();
          toast('已应用');
          done && done();
        };
      }
    );
  };

  /* ---------- 聊天更多 ---------- */
  app.chatMore = function (user, matchId, done) {
    sheet(
      `<div style="font-weight:700;margin-bottom:10px">聊天设置</div>
       <button class="btn btn-block" data-a="view">👤 查看资料</button>
       <button class="btn btn-block" data-a="search">🔍 搜索聊天记录</button>
       <button class="btn btn-block" data-a="pin">📌 置顶会话</button>
       <button class="btn btn-block" data-a="mute">🔇 消息免打扰</button>
       <button class="btn btn-block" data-a="remark">✏️ 设置备注</button>
       <button class="btn btn-block" data-a="block">🚫 屏蔽对方</button>
       <button class="btn btn-block" data-a="report">🚩 举报</button>
       <button class="btn btn-block" data-a="unmatch" style="color:#ff6b8a">💔 解除匹配</button>
       <button class="btn btn-ghost btn-block" data-close>取消</button>`,
      (s, close) => {
        s.querySelector('[data-a=view]').onclick = () => { close(); app.go('profile', { id: user.id }); };
        s.querySelector('[data-a=search]').onclick = async () => {
          close();
          const kw = prompt('搜索聊天记录中的关键词');
          if (!kw) return;
          const r = await api.searchMsg(matchId, kw);
          if (!r.ok) return toast(r.msg);
          if (!r.list.length) return toast('没有找到相关消息');
          sheet(`<div style="font-weight:700;margin-bottom:10px">找到 ${r.list.length} 条</div>
            ${r.list.map((m) => `<div style="padding:10px 0;border-bottom:1px solid var(--line);font-size:13.5px">
              <div style="color:var(--dim);font-size:11px;margin-bottom:3px">${esc(timeAgo(m.createdAt))} ${m.mine ? '我' : esc(user.nickname)}</div>
              ${esc(m.content)}</div>`).join('')}
            <button class="btn btn-ghost btn-block" data-close>关闭</button>`, (s2, c2) => (s2.querySelector('[data-close]').onclick = c2));
        };
        s.querySelector('[data-a=pin]').onclick = async () => { const r = await api.chatSettings(matchId, { pinned: true }); toast(r.ok ? '已置顶' : r.msg); close(); done && done(); };
        s.querySelector('[data-a=mute]').onclick = async () => { const r = await api.chatSettings(matchId, { muted: true }); toast(r.ok ? '已开启免打扰' : r.msg); close(); };
        s.querySelector('[data-a=remark]').onclick = async () => {
          const v = prompt('备注名', (user && user.nickname) || '');
          if (v == null) return;
          const r = await api.chatSettings(matchId, { remark: v });
          toast(r.ok ? '备注已保存' : r.msg); close();
        };
        s.querySelector('[data-a=block]').onclick = async () => { const r = await api.block(user.id); toast(r.msg || '已屏蔽'); close(); };
        s.querySelector('[data-a=report]').onclick = async () => {
          const reason = prompt('举报原因'); if (!reason) return;
          const r = await api.report(user.id, reason); toast(r.msg); close();
        };
        s.querySelector('[data-a=unmatch]').onclick = () => {
          window.modal('解除匹配', '解除后将删除聊天记录，且无法恢复。', async () => {
            const r = await api.unmatch(matchId);
            toast(r.ok ? '已解除匹配' : r.msg);
            close();
            app.replace('messages');
          }, '解除');
        };
        s.querySelector('[data-close]').onclick = close;
      }
    );
  };

  /* ---------- 礼物面板 ---------- */
  app.giftSheet = function (user, done) {
    if (!user) return;
    sheet(
      `<div style="font-weight:700;margin-bottom:6px">🎁 送给 ${esc(user.nickname)}</div>
       <div style="color:var(--dim);font-size:12px;margin-bottom:12px">礼物可提升你们的火花值</div>
       <div id="giftGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
         <div class="spinner" style="grid-column:1/4;margin:20px auto"></div></div>
       <button class="btn btn-block" data-wallet style="margin-top:12px">💰 我的钱包 / 充值</button>
       <button class="btn btn-ghost btn-block" data-close>取消</button>`,
      async (s, close) => {
        s.querySelector('[data-close]').onclick = close;
        s.querySelector('[data-wallet]').onclick = () => { close(); app.go('wallet'); };
        const r = await api.gifts();
        if (!r.ok) return (s.querySelector('#giftGrid').innerHTML = `<div class="empty">${esc(r.msg)}</div>`);
        s.querySelector('#giftGrid').innerHTML = r.list.map((g) => `
          <div data-g="${esc(g.id)}" style="background:var(--bg2);border-radius:14px;padding:14px 6px;text-align:center;cursor:pointer">
            <div style="font-size:34px">${g.icon}</div>
            <div style="font-size:12.5px;margin-top:5px;font-weight:600">${esc(g.name)}</div>
            <div style="color:var(--gold);font-size:11.5px;margin-top:2px">${g.price} 币</div>
          </div>`).join('') +
          `<div style="grid-column:1/4;color:var(--dim);font-size:12px;text-align:center;padding:6px">余额 ${r.coins} 火花币</div>`;
        s.querySelectorAll('[data-g]').forEach((el) => (el.onclick = async () => {
          const r2 = await api.sendGift(user.id, el.dataset.g);
          toast(r2.msg || '赠送成功 🎁');
          if (r2.ok) { close(); done && done(); }
        }));
      }
    );
  };

  /* ---------- 启动 ---------- */
  async function boot() {
    // 服务器地址未配置时引导填写
    const health = await api.health();
    document.getElementById('boot').remove();
    if (!health.ok) {
      openServerSettings(() => location.reload());
      toast('请先设置服务器地址');
    }
    let authed = false;
    if (C.token) {
      const r = await api.me();
      if (r.ok) { app.me = r.user; C.setProfile(r.user); authed = true; connectWs(); }
      else C.setToken('');
    }
    render(authed ? 'deck' : 'auth');
    if (authed) { app.refreshBadge(); locate(); }

    if ('serviceWorker' in navigator) {
      // PWA 预留
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
