/* 页面：消息列表 / 聊天（v2.0 增强：语音·表情包·搜索·置顶·火花值·礼物） */
(function () {
  const P = (window.PAGES = window.PAGES || {});

  /* ================= 消息列表 ================= */
  P.messages = function () {
    return {
      tab: 'messages',
      html: `<div class="page"><div class="nav"><h1>💬 消息</h1>
          <button class="nav-r" id="notifyBtn" style="right:8px">🔔<span id="nDot" style="color:var(--pink)"></span></button></div>
        <div class="body" id="chatList"><div class="loader"><div class="spinner"></div>加载中…</div></div></div>`,
      mount(root, app) {
        root.querySelector('#notifyBtn').onclick = () => app.go('notifications');
        load(app);
      },
      onShow(root, app) { load(app, true); },
    };

    async function load(app, silent) {
      const el = document.getElementById('chatList');
      if (!el) return;
      if (!silent) el.innerHTML = '<div class="loader"><div class="spinner"></div>加载中…</div>';
      const [mr, nr, br] = await Promise.all([api.chatList(), api.notifications(), api.badge()]);
      const nd = document.getElementById('nDot');
      if (nd && nr.ok) nd.textContent = nr.unread ? ' ' + nr.unread : '';
      app.setBadge(br.ok ? br : { message: 0, notification: 0 });
      if (!mr.ok) return (el.innerHTML = `<div class="empty"><div class="ei">📡</div>${esc(mr.msg)}</div>`);
      const list = mr.list || [];
      const sysRow = `<div class="list-item" data-sys>
        <div class="av-wrap"><div class="avatar" style="background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:22px">🔔</div></div>
        <div class="li-main"><div class="li-title">互动通知</div>
        <div class="li-sub">${nr.ok && nr.list.length ? esc((nr.list[0].from ? nr.list[0].from.nickname + ' ' : '') + nr.list[0].text) : '还没有新的互动'}</div></div>
        ${nr.ok && nr.unread ? `<span class="li-badge" style="position:static">${nr.unread}</span>` : ''}
      </div>
      <div class="list-item" data-flash>
        <div class="av-wrap"><div class="avatar" style="background:var(--grad2);display:flex;align-items:center;justify-content:center;font-size:22px">⚡</div></div>
        <div class="li-main"><div class="li-title">随机闪聊</div><div class="li-sub">匿名匹配一个陌生人，聊 5 分钟</div></div>
        <span class="cv" style="color:var(--cyan);font-size:12px">进入 ›</span>
      </div>`;
      if (!list.length) {
        el.innerHTML = sysRow + `<div class="empty"><div class="ei">💫</div>还没有匹配的人<br>去「火花」滑一滑，遇见第一个 TA</div>`;
      } else {
        el.innerHTML = sysRow + list.map((c) => {
          const u = c.user || {};
          const last = c.lastMessage;
          let txt = '还没有聊天，打个招呼吧';
          if (last) txt = { image: '[图片]', voice: '[语音]', gift: '[礼物]', sticker: '[表情]' }[last.type] || last.content;
          const tianruo = c.tianruo || 0;
          return `<div class="list-item" data-chat="${esc(c.matchId)}" data-uid="${esc(u.id)}"
              style="${c.pinned ? 'background:rgba(124,92,255,.08)' : ''}">
            <div class="av-wrap">
              <img class="avatar" src="${esc(u.avatar)}">
              <span class="online-dot ${u.online ? 'on' : ''}"></span>
            </div>
            <div class="li-main">
              <div class="li-title">${c.pinned ? '📌 ' : ''}${esc(c.remark || u.nickname)}${u.vip ? '<span class="badge-vip">VIP</span>' : ''}
                ${c.streak > 1 ? `<span style="color:var(--gold);font-size:11px">🔥${c.streak}天</span>` : ''}
                ${c.muted ? '<span style="color:var(--dim);font-size:11px">🔇</span>' : ''}</div>
              <div class="li-sub">${esc(txt)}</div>
            </div>
            <div class="li-time">${tianruo ? `<span style="color:var(--pink);font-size:10.5px">🔥${tianruo}</span><br>` : ''}${last ? esc(timeAgo(last.createdAt)) : ''}</div>
            ${c.unread ? `<span class="li-badge">${c.unread}</span>` : ''}
          </div>`;
        }).join('');
      }
      el.querySelectorAll('[data-chat]').forEach((row) => (row.onclick = () => app.go('chat', { matchId: row.dataset.chat, uid: row.dataset.uid })));
      const sys = el.querySelector('[data-sys]');
      if (sys) sys.onclick = () => app.go('notifications');
      const fl = el.querySelector('[data-flash]');
      if (fl) fl.onclick = () => app.go('flash');
    }
  };

  /* ================= 聊天 ================= */
  P.chat = function () {
    let matchId = null, other = null, lastTime = 0, tianruo = 0, streak = 0;
    let mediaRecorder = null, audioChunks = [], recording = false, recStart = 0;
    let replyTo = null;
    return {
      tab: 'chat',
      html: `<div class="page"><div class="nav">
          <button class="nav-l" data-back>‹ 返回</button>
          <div style="text-align:center">
            <div id="chatTitle" style="font-size:16px;font-weight:700">聊天</div>
            <div id="chatSub" style="font-size:10.5px;color:var(--dim);font-weight:400"></div>
          </div>
          <button class="nav-r" id="moreBtn" style="right:8px">⋯</button></div>
        <div class="chat-wrap">
          <div class="chat-body" id="chatBody"><div class="loader"><div class="spinner"></div>加载中…</div></div>
          <div class="typing" id="typingTip"></div>
          <div id="replyBar" class="hidden" style="padding:6px 14px;background:var(--card2);font-size:12px;color:var(--sub);display:flex">
            <span id="replyText" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
            <span data-cancel-reply style="color:var(--pink);cursor:pointer">取消</span></div>
          <div class="hellos" id="hellos"></div>
          <div class="emoji-panel" id="emoji"></div>
          <div id="stickerPanel" class="emoji-panel" style="grid-template-columns:repeat(4,1fr)"></div>
          <div class="chat-input">
            <button class="icon-btn" id="voiceBtn">🎤</button>
            <input class="input" id="msgInput" placeholder="说点什么…" autocomplete="off">
            <button class="icon-btn" id="picBtn">🖼</button>
            <button class="icon-btn" id="emojiBtn">😊</button>
            <button class="icon-btn" id="giftBtn">🎁</button>
            <button class="send-btn" id="sendBtn">发送</button>
            <input type="file" id="picFile" accept="image/*" style="display:none">
          </div>
        </div></div>`,
      async mount(root, app, params) {
        matchId = params.matchId;
        replyTo = null; lastTime = 0;
        const body = root.querySelector('#chatBody');
        const input = root.querySelector('#msgInput');
        root.querySelector('[data-back]').onclick = () => app.go('messages');
        root.querySelector('#moreBtn').onclick = () => app.chatMore(other, matchId, () => load(app));

        const pr = await api.profile(params.uid);
        if (pr.ok) {
          other = pr.user;
          root.querySelector('#chatTitle').innerHTML = esc(other.nickname) + (other.online ? ' <span style="color:#4ade80;font-size:11px">在线</span>' : '');
          root.querySelector('#chatSub').textContent = [other.age ? other.age + '岁' : '', other.city, distText(other.distance)].filter(Boolean).join(' · ');
        }

        // 火花值
        const sr = await api.tianruoOf(matchId);
        if (sr.ok) {
          tianruo = sr.tianruo; streak = sr.streak;
          root.querySelector('#chatSub').textContent += ` · 🔥${tianruo}${streak > 1 ? ' 连续' + streak + '天' : ''}`;
        }

        // 快捷打招呼
        const hr = await api.hellos();
        const hellosEl = root.querySelector('#hellos');
        if (hr.ok) {
          hellosEl.innerHTML = hr.list.map((h) => `<button>${esc(h)}</button>`).join('');
          hellosEl.querySelectorAll('button').forEach((b) => (b.onclick = () => send(app, b.textContent)));
        }

        // 表情
        const emojis = ['😊','😂','🥰','😍','😘','🤔','😅','😭','😡','🥺','✨','🔥','💕','❤️','👍','🙏','🎉','🌙','☀️','🍰','🎧','⚡','💫','🌈','😎','🤗','😴','🤡','👀','💪','🌸','🍀'];
        root.querySelector('#emoji').innerHTML = emojis.map((e) => `<button>${e}</button>`).join('');
        root.querySelector('#emojiBtn').onclick = () => {
          root.querySelector('#emoji').classList.toggle('on');
          root.querySelector('#stickerPanel').classList.remove('on');
        };
        root.querySelectorAll('#emoji button').forEach((b) => (b.onclick = () => { input.value += b.textContent; input.focus(); }));

        // 表情包
        const skr = await api.stickers();
        if (skr.ok) {
          const panel = root.querySelector('#stickerPanel');
          panel.innerHTML = skr.list.map((s) => `<button data-s="${esc(s.id)}" data-url="${esc(s.url)}" data-name="${esc(s.name)}">
            <img src="${esc(s.url)}" style="width:52px;height:52px"></button>`).join('');
          panel.querySelectorAll('button').forEach((b) => (b.onclick = () => {
            panel.classList.remove('on');
            send(app, b.dataset.url, 'sticker', { name: b.dataset.name });
          }));
          // 长按输入框旁的表情按钮切表情包（双击 emoji 按钮）
          let lastTap = 0;
          root.querySelector('#emojiBtn').addEventListener('dblclick', () => panel.classList.toggle('on'));
        }

        // 发送
        const doSend = () => { const v = input.value.trim(); if (!v) return; input.value = ''; send(app, v); };
        root.querySelector('#sendBtn').onclick = doSend;
        input.onkeydown = (e) => { if (e.key === 'Enter') doSend(); else api.typing(matchId); };
        root.querySelector('#picBtn').onclick = () => root.querySelector('#picFile').click();
        root.querySelector('#picFile').onchange = async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          toast('上传中…');
          const r = await api.upload(f);
          if (!r.ok) return toast(r.msg);
          send(app, r.url, 'image');
        };

        // 撤回引用条
        root.querySelector('[data-cancel-reply]').onclick = () => {
          replyTo = null;
          root.querySelector('#replyBar').classList.add('hidden');
        };

        // 语音
        const voiceBtn = root.querySelector('#voiceBtn');
        voiceBtn.onclick = () => toggleRecord(app);

        // 礼物
        root.querySelector('#giftBtn').onclick = () => app.giftSheet(other, () => load(app));

        await load(app);
        api.read(matchId);
        app.setBadge(await app.refreshBadge());

        // 上滑加载更多
        body.onscroll = () => {
          if (body.scrollTop < 30 && body.dataset.loading !== '1' && body.dataset.hasmore === '1') {
            loadMore(app);
          }
        };

        // 实时
        app.onWs('message', (d) => {
          if (d.matchId !== matchId) return;
          append(d.message, app);
          if (d.tianruo) { tianruo = d.tianruo; streak = d.streak || streak; }
          api.read(matchId);
        });
        app.onWs('typing', (d) => {
          if (d.matchId !== matchId) return;
          const tip = document.getElementById('typingTip');
          if (tip) { tip.textContent = '对方正在输入…'; clearTimeout(tip._t); tip._t = setTimeout(() => (tip.textContent = ''), 2200); }
        });
        app.onWs('revoke', (d) => {
          if (d.matchId !== matchId) return;
          const el = document.querySelector(`[data-mid="${d.messageId}"] .bubble`);
          if (el) el.innerHTML = '<span class="msg-revoked">消息已撤回</span>';
        });
        app.onWs('gift', (d) => {
          if (d.matchId !== matchId) { toast(`${d.from.nickname} 送你 ${d.gift.icon}${d.gift.name}`); return; }
          load(app);
        });
      },
      _getState: () => ({ matchId, other, replyTo, setReply: (m) => { replyTo = m; } }),
    };

    async function load(app) {
      const body = document.getElementById('chatBody');
      if (!body) return;
      const r = await api.chatPage(matchId, null, 40);
      if (!r.ok) return (body.innerHTML = `<div class="empty">${esc(r.msg)}</div>`);
      lastTime = 0;
      body.innerHTML = r.list.map((m) => bubbleHtml(m, app)).join('');
      body.dataset.hasmore = r.hasMore ? '1' : '0';
      body.dataset.oldest = r.list.length ? r.list[0].createdAt : '';
      if (r.tianruo) tianruo = r.tianruo;
      scrollBottom();
      bindLongPress(app);
    }

    async function loadMore(app) {
      const body = document.getElementById('chatBody');
      if (!body || body.dataset.loading === '1') return;
      body.dataset.loading = '1';
      const oldest = body.dataset.oldest;
      const r = await api.chatPage(matchId, oldest, 30);
      body.dataset.loading = '0';
      if (!r.ok || !r.list.length) { body.dataset.hasmore = '0'; return; }
      const html = r.list.map((m) => bubbleHtml(m, app)).join('');
      const prevH = body.scrollHeight;
      body.insertAdjacentHTML('afterbegin', html);
      body.scrollTop = body.scrollHeight - prevH;
      body.dataset.oldest = r.list[0].createdAt;
      body.dataset.hasmore = r.hasMore ? '1' : '0';
      bindLongPress(app);
    }

    function scrollBottom() {
      const b = document.getElementById('chatBody');
      if (b) b.scrollTop = b.scrollHeight;
    }

    function bubbleHtml(m, app) {
      if (m.fromId === 'system') return `<div class="sys-msg">${esc(m.content)}</div>`;
      const mine = m.mine || (app.me && m.fromId === app.me.id);
      let inner = '';
      if (m.revoked) inner = `<span class="msg-revoked">消息已撤回</span>`;
      else if (m.type === 'image') inner = `<img src="${esc(m.content)}" onclick="previewImages(['${esc(m.content)}'],0)">`;
      else if (m.type === 'voice') {
        const dur = (m.extra && m.extra.duration) || 0;
        inner = `<div class="voice" data-voice="${esc(m.content)}" style="cursor:pointer">
          ▶️ <span style="min-width:60px">${dur ? dur + '"' : '语音'}</span>
          <span style="opacity:.6;font-size:11px">点击播放</span></div>`;
      } else if (m.type === 'sticker') {
        inner = `<img src="${esc(m.content)}" style="width:96px;height:96px">`;
      } else if (m.type === 'gift') {
        inner = `<div style="text-align:center;padding:6px">
          <div style="font-size:42px">${esc((m.extra && m.extra.icon) || '🎁')}</div>
          <div style="font-size:12.5px;margin-top:4px">${esc(m.content)}</div>
          <div style="font-size:10.5px;opacity:.7;margin-top:2px">火花值 +${Math.ceil(((m.extra && m.extra.price) || 10) / 10)}</div></div>`;
      } else inner = esc(m.content).replace(/\n/g, '<br>');

      const t = m.createdAt - lastTime > 5 * 60000 ? `<div class="msg-time">${esc(timeAgo(m.createdAt))}</div>` : '';
      lastTime = m.createdAt;
      const av = mine ? (app.me && app.me.avatar) : (other && other.avatar);
      return `${t}<div class="msg-row ${mine ? 'mine' : ''}" data-mid="${esc(m.id)}">
        ${mine ? '' : `<img class="avatar sm" src="${esc(av || '/avatar/x')}">`}
        <div class="bubble">${inner}</div></div>`;
    }

    function bindLongPress(app) {
      document.querySelectorAll('#chatBody .msg-row').forEach((row) => {
        const mid = row.dataset.mid;
        let timer = null;
        const start = () => { timer = setTimeout(() => showActions(app, mid, row), 520); };
        const end = () => clearTimeout(timer);
        row.addEventListener('touchstart', start, { passive: true });
        row.addEventListener('touchend', end);
        row.addEventListener('touchmove', end);
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); showActions(app, mid, row); });
      });
      // 语音播放
      document.querySelectorAll('[data-voice]').forEach((el) => {
        el.onclick = () => {
          const url = el.dataset.voice;
          try {
            const a = new Audio(url.startsWith('/') ? (window.TIANRUO_CONFIG.server || '') + url : url);
            a.play();
            el.style.opacity = .6;
            a.onended = () => (el.style.opacity = 1);
          } catch (e) { toast('播放失败'); }
        };
      });
    }

    function showActions(app, mid, row) {
      const mine = row.classList.contains('mine');
      const opts = ['📋 复制', '↩️ 引用'];
      if (mine) opts.push('🗑 撤回');
      sheet(`<div style="font-weight:700;margin-bottom:10px">消息操作</div>
        ${opts.map((o, i) => `<button class="btn btn-block" data-i="${i}">${o}</button>`).join('')}
        <button class="btn btn-ghost btn-block" data-close>取消</button>`, (s, close) => {
        s.querySelectorAll('[data-i]').forEach((b) => (b.onclick = async () => {
          const i = +b.dataset.i;
          const txt = row.querySelector('.bubble').innerText;
          if (i === 0) {
            if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('已复制'));
          } else if (i === 1) {
            replyTo = { id: mid, text: txt.slice(0, 30) };
            const bar = document.getElementById('replyBar');
            if (bar) { bar.classList.remove('hidden'); document.getElementById('replyText').textContent = '回复：' + replyTo.text; }
          } else if (i === 2) {
            const r = await api.revoke(mid);
            toast(r.ok ? '已撤回' : r.msg);
            if (r.ok) { const b2 = row.querySelector('.bubble'); if (b2) b2.innerHTML = '<span class="msg-revoked">消息已撤回</span>'; }
          }
          close();
        }));
        s.querySelector('[data-close]').onclick = close;
      });
    }

    function append(msg, app) {
      const body = document.getElementById('chatBody');
      if (!body) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = bubbleHtml({ ...msg, createdAt: msg.createdAt || Date.now() }, app);
      while (wrap.firstChild) body.appendChild(wrap.firstChild);
      scrollBottom();
      bindLongPress(app);
    }

    async function send(app, content, type, extra) {
      const st = (app.page && app.page._getState) ? app.page._getState() : null;
      const r = await api.send(matchId, content, type || 'text', extra, st ? st.replyTo : null);
      if (!r.ok) return toast(r.msg);
      if (r.tianruo) tianruo = r.tianruo;
      append(r.message, app);
      // 清空引用
      const bar = document.getElementById('replyBar');
      if (bar) bar.classList.add('hidden');
    }

    /* ---- 录音 ---- */
    async function toggleRecord(app) {
      const btn = document.getElementById('voiceBtn');
      if (recording) return stopRecord(app);
      if (!navigator.mediaDevices || !window.MediaRecorder) return toast('当前浏览器不支持录音');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const dur = Math.round((Date.now() - recStart) / 1000);
          const blob = new Blob(audioChunks, { type: 'audio/webm' });
          if (blob.size < 500) return toast('录音太短');
          // 上传（转成 file）
          const fd = new FormData();
          const file = new File([blob], 'voice.webm', { type: 'audio/webm' });
          // 复用 upload 接口，但后端 multer 只收字段名 file
          const up = await api.upload(file);
          if (!up.ok) return toast('发送失败：' + up.msg);
          send(app, up.url, 'voice', { duration: dur });
        };
        mediaRecorder.start();
        recording = true;
        recStart = Date.now();
        btn.textContent = '⏹';
        btn.style.background = 'var(--pink)';
        toast('正在录音…点击停止发送');
      } catch (e) {
        toast('无法访问麦克风');
      }
    }
    function stopRecord(app) {
      if (mediaRecorder && recording) {
        mediaRecorder.stop();
        recording = false;
        const btn = document.getElementById('voiceBtn');
        if (btn) { btn.textContent = '🎤'; btn.style.background = ''; }
      }
    }
  };

  /* ================= 我的 ================= */
  P.me = function () {
    return {
      tab: 'me',
      html: `<div class="page"><div class="nav"><h1>我的</h1>
          <button class="nav-r" id="setBtn" style="right:8px">⚙️</button></div>
        <div class="body" id="meBody"><div class="loader"><div class="spinner"></div>加载中…</div></div></div>`,
      mount(root, app) {
        root.querySelector('#setBtn').onclick = () => app.go('settings');
        load(app);
      },
      onShow(root, app) { load(app, true); },
    };

    async function load(app, silent) {
      const el = document.getElementById('meBody');
      if (!el) return;
      if (!silent) el.innerHTML = '<div class="loader"><div class="spinner"></div>加载中…</div>';
      const [mr, lr, vr, mcr, sr] = await Promise.all([
        api.me(), api.likesMe(), api.visitors(), api.feed('userId=' + (app.me && app.me.id)), api.tianruo(),
      ]);
      if (!mr.ok) return (el.innerHTML = `<div class="empty"><div class="ei">📡</div>${esc(mr.msg)}</div>`);
      const u = mr.user;
      app.me = u;
      window.TIANRUO_CONFIG.setProfile(u);
      const likes = lr.ok ? lr.list.length : 0;
      const visits = vr.ok ? vr.list.length : 0;
      const moments = mcr.ok ? mcr.list.length : 0;
      const sp = sr.ok ? sr : { level: 1, name: '小火苗', total: 0 };
      el.innerHTML = `
        <div class="profile-hero">
          <img src="${esc(u.avatar)}" onclick="app.go('edit')">
          <div class="profile-name">${esc(u.nickname)}${u.vip ? '<span class="badge-vip">VIP</span>' : ''}${u.verified ? '<span class="badge-verified">✔</span>' : ''}</div>
          <div class="profile-sub">${u.age ? esc(u.age + '岁') : ''}${u.city ? ' · ' + esc(u.city) : ''}${u.school ? ' · ' + esc(u.school) : ''}</div>
          <div class="profile-sub" style="margin-top:6px">${esc(u.signature || u.bio || '还没有签名，点开头像设置一下～')}</div>
          <div class="profile-stats">
            <div><b>${likes}</b><span>喜欢我</span></div>
            <div><b>${visits}</b><span>访客</span></div>
            <div><b>${moments}</b><span>动态</span></div>
          </div>
          <div style="margin-top:14px;display:inline-block;background:rgba(255,77,141,.14);border:1px solid rgba(255,77,141,.3);
            padding:6px 14px;border-radius:999px;font-size:12.5px;color:var(--pink);cursor:pointer" data-go="tianruoDetail">
            🔥 Lv.${sp.level} ${esc(sp.name)} · 火花值 ${sp.total}</div>
        </div>
        <div class="grid-menu">
          <button data-go="likesMe"><span class="gi">💖</span>喜欢我</button>
          <button data-go="visitors"><span class="gi">👀</span>谁看过我</button>
          <button data-go="myMoments"><span class="gi">🖼</span>我的动态</button>
          <button data-go="nearby"><span class="gi">📍</span>附近的人</button>
        </div>
        <div class="section-title">玩法</div>
        <button class="cell" data-go="tasks"><span class="ci">🎯</span>每日任务 & 签到<span class="cv">领火花币 ›</span></button>
        <button class="cell" data-go="flash"><span class="ci">⚡</span>随机闪聊<span class="cv">匿名 5 分钟 ›</span></button>
        <button class="cell" data-go="questions"><span class="ci">💭</span>心动问答<span class="cv">测契合度 ›</span></button>
        <button class="cell" data-go="circles"><span class="ci">🎪</span>兴趣圈子<span class="cv">群聊 ›</span></button>
        <div class="section-title">我的资料</div>
        <button class="cell" data-go="edit"><span class="ci">✏️</span>编辑资料<span class="cv">›</span></button>
        <button class="cell" data-go="photos"><span class="ci">🖼</span>我的相册<span class="cv">${(u.photos || []).length} 张 ›</span></button>
        <button class="cell" data-go="tags"><span class="ci">🏷</span>兴趣标签<span class="cv">${(u.tags || []).length} 个 ›</span></button>
        <button class="cell" data-go="vip"><span class="ci">👑</span>天弱 会员<span class="cv">${u.vip ? '已开通' : '去开通'} ›</span></button>
        <div class="section-title">其他</div>
        <button class="cell" data-go="wallet"><span class="ci">💰</span>我的钱包<span class="cv">${u.coins || 0} 币 ›</span></button>
        <button class="cell" data-go="invite"><span class="ci">🎁</span>邀请好友<span class="cv">得火花币 ›</span></button>
        <button class="cell" data-go="settings"><span class="ci">⚙️</span>设置<span class="cv">›</span></button>
        <button class="cell" data-act="logout"><span class="ci">🚪</span>退出登录<span class="cv">›</span></button>
        <div style="text-align:center;color:var(--dim);font-size:11.5px;padding:22px 0 8px">
          天弱 v10.0 · 服务器 ${esc(window.TIANRUO_CONFIG.server || '同源')}</div>`;
      el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => app.go(b.dataset.go)));
      el.querySelector('[data-act=logout]').onclick = () => {
        window.modal('退出登录', '确定要退出吗？', () => {
          window.TIANRUO_CONFIG.setToken('');
          location.reload();
        }, '退出');
      };
    }
  };

  /* ================= 资料详情 ================= */
  P.profile = function () {
    return {
      tab: null,
      html: `<div class="detail" id="detail"><div class="loader" style="padding-top:120px"><div class="spinner"></div>加载中…</div></div>`,
      async mount(root, app, params) {
        const r = await api.profile(params.id);
        const box = document.getElementById('detail');
        if (!r.ok) return (box.innerHTML = `<div class="empty"><div class="ei">👻</div>${esc(r.msg)}</div>`);
        const u = r.user;
        const cover = (u.photos && u.photos[0]) || u.avatar;
        // 契合度
        let compatHtml = '';
        const cr = await api.compat(u.id);
        if (cr.ok && cr.rate != null) {
          compatHtml = `<div class="section-title" style="padding-left:0">心动契合度</div>
            <div style="display:flex;align-items:center;gap:12px">
              <div style="font-size:30px;font-weight:800;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent">${cr.rate}%</div>
              <div style="font-size:12.5px;color:var(--sub);flex:1">你们在 ${cr.total} 道题中，有 ${cr.same} 道答案一致</div>
            </div>`;
        }
        box.innerHTML = `
          <div class="detail-cover" style="background-image:url('${esc(cover)}'),linear-gradient(160deg,#3b2f52,#1c1c28)">
            <button class="detail-back" data-back>‹</button>
          </div>
          <div class="detail-body">
            <div style="font-size:23px;font-weight:800">${esc(u.nickname)}${u.vip ? '<span class="badge-vip">VIP</span>' : ''}${u.verified ? '<span class="badge-verified">✔</span>' : ''}</div>
            <div style="color:var(--sub);font-size:13.5px;margin-top:7px">
              ${u.age ? esc(u.age + '岁') : ''} ${esc(u.gender || '')} ${u.city ? '· ' + esc(u.city) : ''}
              ${u.distance != null ? '· ' + esc(distText(u.distance)) : ''} ${u.online ? '· <span style="color:#4ade80">在线</span>' : '· ' + esc(timeAgo(u.lastActive)) + '活跃'}
            </div>
            ${u.school ? `<div style="color:var(--sub);font-size:13px;margin-top:5px">🎓 ${esc(u.school)}${u.job ? ' · ' + esc(u.job) : ''}</div>` : ''}
            ${u.tags && u.tags.length ? `<div style="margin-top:12px">${u.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
            ${compatHtml}
            ${u.bio ? `<div class="section-title" style="padding-left:0">关于我</div><div style="font-size:14px;line-height:1.7;color:#dcdcea">${esc(u.bio)}</div>` : ''}
            ${u.signature ? `<div class="section-title" style="padding-left:0">个性签名</div><div style="font-size:14px;line-height:1.7;color:#dcdcea">${esc(u.signature)}</div>` : ''}
            ${u.photos && u.photos.length ? `<div class="section-title" style="padding-left:0">相册 ${u.photos.length}</div>
              <div class="detail-photos">${u.photos.map((p, i) => `<img src="${esc(p)}" data-i="${i}">`).join('')}</div>` : ''}
            <div class="section-title" style="padding-left:0">TA 的动态</div>
            <div id="uMoments"><div class="loader"><div class="spinner"></div></div></div>
          </div>
          <div class="detail-actions">
            <button class="btn" style="flex:0 0 56px;font-size:20px" data-act="report">🚩</button>
            <button class="btn" style="flex:1" data-act="like">💖 喜欢</button>
            <button class="btn" style="flex:0 0 56px;font-size:20px" data-act="gift">🎁</button>
            <button class="btn btn-primary" style="flex:1.2" data-act="chat" ${u.liked ? '' : 'disabled style="flex:1.2;opacity:.5"'}>💬 打招呼</button>
          </div>`;
        box.querySelector('[data-back]').onclick = () => history.back();
        box.querySelectorAll('.detail-photos img').forEach((img) => (img.onclick = () => previewImages(u.photos, +img.dataset.i)));
        box.querySelector('[data-act=report]').onclick = () => {
          const reason = prompt('举报原因');
          if (reason) api.report(u.id, reason).then((r2) => toast(r2.msg));
        };
        box.querySelector('[data-act=gift]').onclick = () => app.giftSheet(u);
        box.querySelector('[data-act=like]').onclick = async () => {
          const r2 = await api.swipe(u.id, 'like');
          if (!r2.ok) return toast(r2.msg);
          toast(r2.matched ? '匹配成功！' : '已喜欢 ❤️');
          if (r2.matched) app.onMatched(u, r2.matchId);
          box.querySelector('[data-act=chat]').disabled = false;
        };
        box.querySelector('[data-act=chat]').onclick = async () => {
          const mr = await api.matchList();
          if (!mr.ok) return toast(mr.msg);
          const m = mr.list.find((x) => x.user.id === u.id);
          if (m) return app.go('chat', { matchId: m.matchId, uid: u.id });
          const r2 = await api.swipe(u.id, 'like');
          if (!r2.ok) return toast(r2.msg);
          if (r2.matched) app.onMatched(u, r2.matchId, true);
          else toast('已喜欢，等 TA 回应就可以聊天啦');
        };
        const fm = await api.feed('userId=' + u.id);
        const mc = document.getElementById('uMoments');
        if (mc) mc.innerHTML = fm.ok && fm.list.length
          ? fm.list.map((m) => `<div style="padding:10px 0;border-bottom:1px solid var(--line)">
              <div style="font-size:13.5px;line-height:1.6">${esc(m.text)}</div>
              <div style="color:var(--dim);font-size:11.5px;margin-top:5px">${esc(timeAgo(m.createdAt))} · ❤️ ${m.likes}</div></div>`).join('')
          : '<div style="color:var(--dim);font-size:13px">TA 还没有发过动态</div>';
      },
    };
  };

  /* ================= 通用用户列表页 ================= */
  function userListPage(title, fetcher, emptyText) {
    return function () {
      return {
        tab: null,
        html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>${esc(title)}</h1></div>
          <div class="body no-tab" id="ul"><div class="loader"><div class="spinner"></div>加载中…</div></div></div>`,
        async mount(root, app) {
          root.querySelector('[data-back]').onclick = () => history.back();
          const el = root.querySelector('#ul');
          const r = await fetcher();
          if (!r.ok) return (el.innerHTML = `<div class="empty"><div class="ei">📡</div>${esc(r.msg)}</div>`);
          if (!r.list.length) return (el.innerHTML = `<div class="empty"><div class="ei">🌙</div>${esc(emptyText)}</div>`);
          el.innerHTML = r.list.map((u) => `<div class="list-item" data-id="${esc(u.id)}">
            <div class="av-wrap"><img class="avatar" src="${esc(u.avatar)}"><span class="online-dot ${u.online ? 'on' : ''}"></span></div>
            <div class="li-main"><div class="li-title">${esc(u.nickname)}${u.vip ? '<span class="badge-vip">VIP</span>' : ''}</div>
            <div class="li-sub">${u.age ? esc(u.age + '岁 · ') : ''}${esc([u.city, u.school].filter(Boolean).join(' · '))}${u.distance != null ? ' · ' + esc(distText(u.distance)) : ''}${u.signature ? ' · ' + esc(u.signature) : ''}</div></div>
            <div class="li-time">${esc(timeAgo(u.lastActive || Date.now()))}</div>
          </div>`).join('');
          el.querySelectorAll('[data-id]').forEach((row) => (row.onclick = () => app.go('profile', { id: row.dataset.id })));
        },
      };
    };
  }
  P.likesMe = userListPage('💖 喜欢我', () => api.likesMe(), '还没有人喜欢你，去完善资料吧');
  P.visitors = userListPage('👀 谁看过我', () => api.visitors(), '还没有访客，多发动态吸引关注');
  P.nearby = userListPage('📍 附近的人', () => api.nearby('limit=40'), '附近还没有人');

  /* ================= 我的动态 ================= */
  P.myMoments = function () {
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>我的动态</h1>
        <button class="nav-r primary" id="add" style="right:8px">发布</button></div>
        <div class="body no-tab" id="mm"><div class="loader"><div class="spinner"></div>加载中…</div></div></div>`,
      async mount(root, app) {
        root.querySelector('[data-back]').onclick = () => history.back();
        root.querySelector('#add').onclick = () => app.publishSheet(() => load(app));
        await load(app);
      },
    };
    async function load(app) {
      const el = document.getElementById('mm');
      if (!el) return;
      const r = await api.feed('userId=' + app.me.id);
      if (!r.ok) return (el.innerHTML = `<div class="empty">${esc(r.msg)}</div>`);
      if (!r.list.length) return (el.innerHTML = `<div class="empty"><div class="ei">📝</div>还没有动态，点右上角发布</div>`);
      el.innerHTML = r.list.map((m) => `<div class="mom">
        <div class="mom-text">${m.topic ? `<span class="mom-topic">${esc(m.topic)}</span>` : ''}${esc(m.text)}</div>
        ${(m.images || []).length ? `<div class="mom-imgs">${m.images.map((s) => `<img src="${esc(s)}">`).join('')}</div>` : ''}
        <div class="mom-foot"><span>❤️ ${m.likes}</span><span>💬 ${(m.comments || []).length}</span>
        <button style="margin-left:auto;color:var(--dim)" data-del="${esc(m.id)}">删除</button></div></div>`).join('');
      el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
        const r2 = await api.delMoment(b.dataset.del);
        if (r2.ok) { toast('已删除'); load(app); } else toast(r2.msg);
      }));
    }
  };

  /* ================= 通知 ================= */
  P.notifications = function () {
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>🔔 互动通知</h1>
        <button class="nav-r primary" id="readAll" style="right:8px">全部已读</button></div>
        <div class="body no-tab" id="nl"><div class="loader"><div class="spinner"></div>加载中…</div></div></div>`,
      async mount(root, app) {
        root.querySelector('[data-back]').onclick = () => history.back();
        root.querySelector('#readAll').onclick = async () => { await api.readNotify(); toast('已全部标记已读'); load(app); };
        await load(app);
      },
    };
    async function load(app) {
      const el = document.getElementById('nl');
      if (!el) return;
      const r = await api.notifications();
      if (!r.ok) return (el.innerHTML = `<div class="empty">${esc(r.msg)}</div>`);
      if (!r.list.length) return (el.innerHTML = `<div class="empty"><div class="ei">🔕</div>还没有新的互动</div>`);
      const icon = { like: '💖', superlike: '⚡', match: '🎉', visit: '👀', moment_like: '❤️', moment_comment: '💬', moment_reply: '↩️', gift: '🎁', invite: '🎁', system: '📢' };
      el.innerHTML = r.list.map((n) => `<div class="list-item" data-id="${esc(n.id)}">
        <div class="av-wrap"><img class="avatar" src="${esc(n.from ? n.from.avatar : '/avatar/system')}"></div>
        <div class="li-main"><div class="li-title">${esc(n.from ? n.from.nickname : '系统')}${n.type === 'superlike' ? ' <span style="color:var(--cyan);font-size:11px">超级喜欢</span>' : ''}</div>
        <div class="li-sub">${esc(n.text)}</div></div>
        <div class="li-time">${icon[n.type] || '🔔'}<br><span style="font-size:10px">${esc(timeAgo(n.createdAt))}</span></div>
        ${n.read ? '' : '<span class="li-badge" style="background:var(--purple)">新</span>'}
      </div>`).join('');
      el.querySelectorAll('[data-id]').forEach((row) => (row.onclick = async () => {
        const n = r.list.find((x) => x.id === row.dataset.id);
        await api.readNotify(n.id);
        if (n.fromId) app.go('profile', { id: n.fromId });
      }));
    }
  };
})();
