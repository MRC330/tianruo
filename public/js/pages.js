/* 页面：登录 / 匹配卡片 / 广场 */
(function () {
  const P = (window.PAGES = window.PAGES || {});

  /* ================= 登录 ================= */
  P.auth = function () {
    let counting = 0;
    return {
      tab: false,
      html: `
      <div class="auth">
        <div class="auth-logo">⚡</div>
        <div class="auth-title">天弱</div>
        <div class="auth-slogan">在这里，遇见同频的年轻人</div>
        <input class="input" id="phone" type="tel" maxlength="11" placeholder="手机号" autocomplete="off">
        <div class="code-row">
          <input class="input" id="code" type="tel" maxlength="6" placeholder="验证码" autocomplete="off">
          <button class="code-btn" id="getCode">获取验证码</button>
        </div>
        <button class="btn btn-primary btn-block" id="loginBtn" style="margin-top:18px">登录 / 注册</button>
        <div class="auth-tip">
          演示环境验证码：<b style="color:var(--pink)">1234</b>（任意 11 位手机号）<br>
          也可直接用演示账号 13800000000 · 密码 123456<br>
          <span class="link" id="toPwd">密码登录</span> · <span class="link" id="serverLink">服务器设置</span>
        </div>
      </div>`,
      mount(root, app) {
        const phone = root.querySelector('#phone');
        const code = root.querySelector('#code');
        const btn = root.querySelector('#loginBtn');
        const codeBtn = root.querySelector('#getCode');
        const saved = window.TIANRUO_CONFIG.profile;
        if (saved && saved.phone) phone.value = saved.phone;

        codeBtn.onclick = async () => {
          if (!/^1[3-9]\d{9}$/.test(phone.value)) return toast('请输入正确的手机号');
          const r = await api.sendCode(phone.value);
          if (!r.ok) return toast(r.msg);
          toast('验证码已发送' + (r.devCode ? '：' + r.devCode : ''));
          counting = 60;
          const t = setInterval(() => {
            counting--;
            if (counting <= 0) { clearInterval(t); codeBtn.disabled = false; codeBtn.textContent = '重新获取'; }
            else { codeBtn.disabled = true; codeBtn.textContent = counting + 's'; }
          }, 1000);
        };
        btn.onclick = async () => {
          if (!/^1[3-9]\d{9}$/.test(phone.value)) return toast('请输入正确的手机号');
          if (!code.value) return toast('请输入验证码');
          btn.disabled = true; btn.textContent = '登录中…';
          const r = await api.login(phone.value, code.value);
          btn.disabled = false; btn.textContent = '登录 / 注册';
          if (!r.ok) return toast(r.msg);
          app.afterLogin(r);
        };
        root.querySelector('#toPwd').onclick = () => {
          const pwd = prompt('请输入密码（演示账号 13800000000 / 123456）');
          if (!pwd) return;
          api.loginPwd(phone.value, pwd).then((r) => (r.ok ? app.afterLogin(r) : toast(r.msg)));
        };
        root.querySelector('#serverLink').onclick = () => openServerSettings(() => location.reload());
      },
    };
  };

  /* ================= 匹配卡片 ================= */
  P.deck = function () {
    let cards = [];
    let index = 0;
    let quota = null;
    let deckEl = null;

    function cardHtml(u, i) {
      const grad = `linear-gradient(160deg,hsl(${(u.id.length * 37) % 360},55%,42%),hsl(${(u.id.length * 37 + 50) % 360},55%,28%))`;
      const photo = u.photos && u.photos.length ? u.photos[0] : u.avatar;
      const meta = [u.age ? u.age + '岁' : '', u.city || '', distText(u.distance), u.school || ''].filter(Boolean).join(' · ');
      const score = u.matchScore;
      const sameTags = (u.scoreDetail && u.scoreDetail.tags >= 15);
      return `<div class="card" data-id="${u.id}" data-i="${i}" style="z-index:${30 - i};transform:translateY(${i * 6}px) scale(${1 - i * 0.03})">
        <div class="card-photo" style="background-image:url('${photo}'),${grad}"></div>
        <div class="card-shade"></div>
        ${score ? `<div style="position:absolute;top:16px;left:16px;z-index:5;background:rgba(0,0,0,.45);backdrop-filter:blur(8px);
          padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;color:#fff">
          🔥 匹配度 ${score}</div>` : ''}
        ${sameTags ? `<div style="position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:5;
          background:var(--grad);padding:5px 12px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap">
          🏷 兴趣高度契合</div>` : ''}
        <div class="card-stamp like">LIKE</div>
        <div class="card-stamp nope">NOPE</div>
        <div class="card-stamp super">SUPER ⚡</div>
        <div class="card-info">
          <div class="card-name">${esc(u.nickname)}${u.vip ? '<span class="badge-vip">VIP</span>' : ''}${u.verified ? '<span class="badge-verified">✔</span>' : ''}</div>
          <div class="card-meta">${esc(meta)}${u.online ? ' · <span style="color:#4ade80">在线</span>' : ''}</div>
          <div class="card-bio">${esc(u.signature || u.bio || '')}</div>
          <div class="card-tags">${(u.tags || []).slice(0, 4).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
        </div>
        <button class="why-btn" data-why="${esc(u.id)}" style="position:absolute;right:16px;bottom:96px;z-index:6;
          background:rgba(0,0,0,.45);backdrop-filter:blur(8px);border:none;color:#fff;font-size:11.5px;
          padding:6px 12px;border-radius:999px">为什么是 TA？</button>
      </div>`;
    }

    function render(root, app) {
      deckEl = root.querySelector('.deck-wrap');
      if (!cards.length) {
        deckEl.innerHTML = `<div class="deck-empty"><div style="font-size:52px;margin-bottom:14px">✨</div>
          <div style="font-size:16px;color:#fff;margin-bottom:6px">附近没有更多人了</div>
          <div style="font-size:13px">试试放宽筛选条件，晚点再来看看</div>
          <button class="btn btn-primary" style="margin-top:20px" id="reloadCards">刷新一下</button></div>`;
        const rb = deckEl.querySelector('#reloadCards');
        if (rb) rb.onclick = () => load(app);
        return;
      }
      deckEl.innerHTML = cards.slice(index, index + 3).map((u, i) => cardHtml(u, i)).join('') +
        `<div class="card-actions">
          <button class="act" data-act="pass">✕</button>
          <button class="act super" data-act="super">⭐</button>
          <button class="act big" data-act="like">♥</button>
        </div>
        <div class="quota">${quota ? `今日喜欢 ${quota.left}/${quota.limit}` : ''}</div>`;
      bindDrag(root, app);
      deckEl.querySelectorAll('[data-act]').forEach((b) => {
        b.onclick = () => swipe(app, b.dataset.act);
      });
      deckEl.querySelectorAll('[data-why]').forEach((b) => (b.onclick = (e) => {
        e.stopPropagation();
        showWhy(app, b.dataset.why);
      }));
    }

    async function showWhy(app, uid) {
      const r = await api.why(uid);
      if (!r.ok) return toast(r.msg);
      sheet(`<div style="font-weight:700;margin-bottom:8px">为什么推荐 TA</div>
        <div style="text-align:center;padding:10px 0 16px">
          <div style="font-size:38px;font-weight:800;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent">${r.score}</div>
          <div style="color:var(--sub);font-size:12.5px">综合匹配度</div></div>
        ${r.reasons.length ? r.reasons.map((x) => `<div class="cell" style="cursor:default"><span class="ci">${x.icon}</span>${esc(x.text)}</div>`).join('')
          : '<div style="color:var(--dim);text-align:center;padding:10px">系统根据距离和资料推荐</div>'}
        <div style="color:var(--dim);font-size:11.5px;margin-top:10px;line-height:1.7">
          打分构成：距离 ${r.detail.distance}/30 · 兴趣 ${r.detail.tags}/25 · 年龄 ${r.detail.age}/15 · 问答 ${r.detail.qa}/15 · 活跃 ${r.detail.active}/10 · 资料 ${r.detail.profile}/5</div>
        <button class="btn btn-ghost btn-block" data-close>知道了</button>`,
        (s, close) => (s.querySelector('[data-close]').onclick = close));
    }

    function bindDrag(root, app) {
      const top = deckEl.querySelector('.card');
      if (!top) return;
      const like = top.querySelector('.card-stamp.like');
      const nope = top.querySelector('.card-stamp.nope');
      const sup = top.querySelector('.card-stamp.super');
      let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false;

      const start = (x, y) => { dragging = true; sx = x; sy = y; top.classList.add('dragging'); };
      const move = (x, y) => {
        if (!dragging) return;
        dx = x - sx; dy = y - sy;
        const rot = dx / 14;
        top.style.transform = `translate(${dx}px,${dy}px) rotate(${rot}deg)`;
        const p = Math.min(1, Math.abs(dx) / 110);
        [like, nope, sup].forEach((el) => (el.style.opacity = 0));
        if (dy < -90) sup.style.opacity = Math.min(1, (-dy - 90) / 60);
        else if (dx > 20) like.style.opacity = p;
        else if (dx < -20) nope.style.opacity = p;
      };
      const end = () => {
        if (!dragging) return;
        dragging = false;
        top.classList.remove('dragging');
        [like, nope, sup].forEach((el) => (el.style.opacity = 0));
        if (dy < -110) return swipe(app, 'super');
        if (dx > 90) return swipe(app, 'like');
        if (dx < -90) return swipe(app, 'pass');
        top.style.transform = '';
      };

      top.addEventListener('pointerdown', (e) => start(e.clientX, e.clientY));
      top.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
      top.addEventListener('pointerup', end);
      top.addEventListener('pointercancel', end);
      top.addEventListener('pointerleave', end);
      top.onclick = (e) => {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) app.go('profile', { id: top.dataset.id });
      };
    }

    async function swipe(app, type) {
      const u = cards[index];
      if (!u) return;
      const top = deckEl.querySelector('.card');
      if (top && type !== 'pass') {
        top.style.transition = 'transform .35s,opacity .35s';
        top.style.transform = `translate(${type === 'super' ? 0 : 460}px,${type === 'super' ? -560 : 120}px) rotate(24deg)`;
        top.style.opacity = 0;
      } else if (top) {
        top.style.transition = 'transform .35s,opacity .35s';
        top.style.transform = 'translate(-460px,120px) rotate(-24deg)';
        top.style.opacity = 0;
      }
      index++;
      setTimeout(() => render(app.root, app), 260);
      const r = await api.swipe(u.id, type);
      if (!r.ok) { toast(r.msg); if (r.quota) quota = r.quota; return; }
      if (r.quota) quota = r.quota;
      if (r.matched) app.onMatched(u, r.matchId);
      if (index >= cards.length) {
        setTimeout(async () => { await load(app, true); }, 400);
      }
    }

    async function load(app, silent) {
      if (!silent) {
        const w = document.querySelector('.deck-wrap');
        if (w) w.innerHTML = '<div class="loader"><div class="spinner"></div>寻找附近的人…</div>';
      }
      const g = localStorage.getItem('tianruo_filter_gender') || '';
      let r = await api.recommend(g);
      if (!r.ok || !r.list || !r.list.length) r = await api.cards(g);
      if (!r.ok) {
        const w = document.querySelector('.deck-wrap');
        if (w) w.innerHTML = `<div class="empty"><div class="ei">📡</div>${esc(r.msg)}<br><button class="btn btn-primary" style="margin-top:16px" onclick="openServerSettings(()=>location.reload())">设置服务器</button></div>`;
        return;
      }
      cards = r.list; index = 0; quota = r.quota;
      render(app.root, app);
    }

    return {
      tab: 'deck',
      html: `<div class="page"><div class="nav"><h1>⚡ 火花</h1>
          <button class="nav-r" id="filterBtn" style="right:8px">筛选</button></div>
        <div class="body no-tab" style="overflow:hidden"><div class="deck"><div class="deck-wrap"></div></div></div></div>`,
      mount(root, app) { load(app); root.querySelector('#filterBtn').onclick = () => app.filterSheet(() => load(app)); },
      onShow(root, app) { if (!cards.length) load(app); },
    };
  };

  /* ================= 广场 ================= */
  P.square = function () {
    let tab = 'latest';
    let topics = [];
    return {
      tab: 'square',
      html: `<div class="page"><div class="nav"><h1>🌍 广场</h1>
          <button class="nav-r" id="searchBtn" style="right:8px">🔍</button></div>
        <div class="mom-tabs" id="tabs"></div>
        <div class="body" id="feed" style="padding-bottom:calc(80px + var(--safe-b))"></div>
        <button class="fab" id="publish">＋</button></div>`,
      async mount(root, app) {
        const tabsEl = root.querySelector('#tabs');
        const renderTabs = () => {
          tabsEl.innerHTML = [{ name: '', label: '推荐' }, { name: 'hot', label: '🔥 热门' }]
            .concat(topics.map((t) => ({ name: t.name, label: t.name })))
            .map((t) => `<button class="mom-tab ${tab === t.name ? 'on' : ''}" data-t="${esc(t.name)}">${esc(t.label)}</button>`).join('');
          tabsEl.querySelectorAll('.mom-tab').forEach((b) => (b.onclick = () => { tab = b.dataset.t; renderTabs(); load(app); }));
        };
        const tr = await api.topics();
        if (tr.ok) topics = tr.list.slice(0, 6);
        renderTabs();
        root.querySelector('#publish').onclick = () => app.publishSheet(() => load(app));
        root.querySelector('#searchBtn').onclick = () => app.go('search');
        load(app);
      },
      onShow(root, app) { load(app, true); },
      _load: () => load,
    };

    async function load(app, silent) {
      const feed = document.getElementById('feed');
      if (!feed) return;
      if (!silent) feed.innerHTML = '<div class="loader"><div class="spinner"></div>加载中…</div>';
      const params = tab === 'hot' ? 'type=hot' : tab ? 'topic=' + encodeURIComponent(tab) : '';
      const r = await api.feed(params);
      if (!r.ok) return (feed.innerHTML = `<div class="empty"><div class="ei">🛰</div>${esc(r.msg)}</div>`);
      if (!r.list.length) return (feed.innerHTML = `<div class="empty"><div class="ei">🌱</div>这里还很安静，来发第一条动态吧</div>`);
      feed.innerHTML = r.list.map(momHtml).join('');
      feed.querySelectorAll('[data-like]').forEach((b) => (b.onclick = async () => {
        const id = b.dataset.like;
        const r2 = await api.likeMoment(id);
        if (r2.ok) { b.classList.toggle('on', r2.liked); b.innerHTML = (r2.liked ? '❤️' : '🤍') + ' ' + r2.likes; }
      }));
      feed.querySelectorAll('[data-cmt]').forEach((b) => (b.onclick = () => {
        const id = b.dataset.cmt;
        const text = prompt('写评论');
        if (!text) return;
        api.comment(id, text).then((r2) => { if (r2.ok) { toast('评论成功'); load(app, true); } else toast(r2.msg); });
      }));
      feed.querySelectorAll('[data-user]').forEach((b) => (b.onclick = () => app.go('profile', { id: b.dataset.user })));
      feed.querySelectorAll('.mom-imgs img').forEach((img) => {
        img.onclick = () => previewImages(JSON.parse(img.dataset.urls), +img.dataset.idx);
      });
    }

    function momHtml(m) {
      const imgs = m.images || [];
      return `<div class="mom">
        <div class="mom-head">
          <img class="avatar" src="${esc(m.user && m.user.avatar)}" data-user="${esc(m.user && m.user.id)}" style="cursor:pointer">
          <div style="flex:1;min-width:0">
            <div class="mom-name">${esc(m.user && m.user.nickname)}${m.user && m.user.vip ? '<span class="badge-vip">VIP</span>' : ''}</div>
            <div class="mom-sub">${esc(timeAgo(m.createdAt))}${m.user && m.user.city ? ' · ' + esc(m.user.city) : ''}${m.user && m.user.distance != null ? ' · ' + esc(distText(m.user.distance)) : ''}</div>
          </div>
        </div>
        <div class="mom-text">${m.topic ? `<span class="mom-topic">${esc(m.topic)}</span>` : ''}${esc(m.text)}</div>
        ${imgs.length ? `<div class="mom-imgs">${imgs.map((s, i) => `<img src="${esc(s)}" data-urls='${esc(JSON.stringify(imgs))}' data-idx="${i}" loading="lazy">`).join('')}</div>` : ''}
        <div class="mom-foot">
          <button data-like="${esc(m.id)}" class="${m.liked ? 'on' : ''}">${m.liked ? '❤️' : '🤍'} ${m.likes}</button>
          <button data-cmt="${esc(m.id)}">💬 ${(m.comments || []).length}</button>
        </div>
        ${(m.comments || []).length ? `<div class="mom-cmts">${m.comments.slice(0, 4).map((c) => `<div><b>${esc(c.user ? c.user.nickname : '匿名')}：</b>${esc(c.text)}</div>`).join('')}</div>` : ''}
      </div>`;
    }
  };
})();
