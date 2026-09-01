/* 页面 v3-v7：闪聊 / 心动问答 / 任务签到 / 火花值 / 圈子 / 热榜 / 邀请 / 钱包 */
(function () {
  const P = (window.PAGES = window.PAGES || {});

  /* ================= 随机闪聊 ================= */
  P.flash = function () {
    let roomId = null, timer = null, expires = 0, revealed = false;
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>⚡ 随机闪聊</h1>
          <button class="nav-r" id="leave" style="right:8px;color:var(--sub)">离开</button></div>
        <div class="body no-tab" id="fb" style="display:flex;flex-direction:column;padding:16px">
          <div id="flashTip" style="text-align:center;color:var(--sub);padding:40px 20px">
            <div style="font-size:56px;margin-bottom:14px">🎲</div>
            <div style="font-size:16px;color:var(--text);margin-bottom:8px">匿名 · 5 分钟 · 限时聊天</div>
            <div style="font-size:13px;line-height:1.7">系统随机为你匹配一个陌生人<br>聊得来可互相申请解锁身份</div>
            <button class="btn btn-primary" style="margin-top:24px;width:200px" id="enter">开始匹配</button>
          </div>
        </div></div>`,
      mount(root, app) {
        root.querySelector('[data-back]').onclick = () => { leave(app); history.back(); };
        root.querySelector('#leave').onclick = () => { leave(app); history.back(); };
        root.querySelector('#enter').onclick = () => enter(app);
      },
      onLeave: leave,
    };

    async function enter(app) {
      const tip = document.getElementById('flashTip');
      tip.innerHTML = '<div class="spinner" style="margin:0 auto 10px"></div>正在寻找有缘人…';
      const r = await api.post('/api/game/flash/enter');
      if (!r.ok) return (tip.innerHTML = `<div class="empty">${esc(r.msg)}</div>`);
      roomId = r.roomId; expires = r.expires;
      renderChat(app);
      poll(app);
      app.onWs('flash_matched', () => { toast('⚡ 配对成功！'); loadMsgs(app); });
      app.onWs('flash_message', (d) => { if (d.roomId === roomId) loadMsgs(app); });
      app.onWs('flash_reveal_request', () => toast('对方申请解锁身份 👀'));
      app.onWs('flash_revealed', (d) => {
        revealed = true;
        toast('🎉 双方同意，已解锁身份！');
        setTimeout(() => app.go('chat', { matchId: d.matchId, uid: '' }), 800);
      });
      app.onWs('flash_leave', () => toast('对方已离开'));
    }

    function renderChat(app) {
      const box = document.getElementById('fb');
      box.innerHTML = `
        <div style="text-align:center;color:var(--sub);font-size:13px;margin-bottom:10px">
          匿名聊天 · 剩余 <b id="countdown" style="color:var(--pink)">5:00</b>
        </div>
        <div id="fmsgs" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:10px 0;min-height:200px"></div>
        <div style="display:flex;gap:8px;padding-top:10px;border-top:1px solid var(--line)">
          <input class="input" id="fin" placeholder="说点什么…" style="flex:1">
          <button class="btn btn-primary" id="fsend">发送</button>
        </div>
        <button class="btn btn-block" id="freveal" style="margin-top:10px">🔓 申请解锁身份</button>`;
      const send = async () => {
        const v = box.querySelector('#fin').value.trim();
        if (!v) return;
        box.querySelector('#fin').value = '';
        const r = await api.post('/api/game/flash/' + roomId + '/send', { content: v });
        if (r.ok) loadMsgs(app); else toast(r.msg);
      };
      box.querySelector('#fsend').onclick = send;
      box.querySelector('#fin').onkeydown = (e) => e.key === 'Enter' && send();
      box.querySelector('#freveal').onclick = async () => {
        const r = await api.post('/api/game/flash/' + roomId + '/reveal');
        if (!r.ok) return toast(r.msg);
        toast(r.both ? '🎉 双方同意，已解锁！' : '已申请，等待对方回应…');
        if (r.both) setTimeout(() => app.go('messages'), 900);
      };
      tick();
      timer = setInterval(tick, 1000);
    }

    function tick() {
      const el = document.getElementById('countdown');
      if (!el) return;
      const left = Math.max(0, expires - Date.now());
      const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      el.textContent = `${m}:${String(s).padStart(2, '0')}`;
      if (left <= 0) { clearInterval(timer); toast('闪聊时间到，本次对话已结束'); }
    }

    async function loadMsgs(app) {
      const r = await api.get('/api/game/flash/' + roomId);
      if (!r.ok) return;
      const box = document.getElementById('fmsgs');
      if (!box) return;
      const meId = app.me && app.me.id;
      box.innerHTML = r.msgs.length ? r.msgs.map((m) => {
        if (m.type === 'system') return `<div class="sys-msg">${esc(m.content)}</div>`;
        const mine = m.fromId === meId;
        return `<div class="msg-row ${mine ? 'mine' : ''}"><div class="bubble">${esc(m.content)}</div></div>`;
      }).join('') : '<div style="text-align:center;color:var(--dim);padding:40px 0">等待对方加入…</div>';
      box.scrollTop = box.scrollHeight;
    }

    function poll(app) {
      if (timer) clearInterval(timer);
      loadMsgs(app);
      const t = setInterval(() => { if (roomId) loadMsgs(app); else clearInterval(t); }, 2500);
      setTimeout(() => clearInterval(t), 6 * 60 * 1000);
    }

    function leave() {
      if (roomId) api.post('/api/game/flash/' + roomId + '/leave');
      if (timer) clearInterval(timer);
      roomId = null;
    }
  };

  /* ================= 心动问答 ================= */
  P.questions = function () {
    let cur = 0, answers = {};
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>💭 心动问答</h1></div>
        <div class="body no-tab" id="qb" style="padding:22px 20px"><div class="spinner" style="margin:40px auto"></div></div></div>`,
      async mount(root, app) {
        root.querySelector('[data-back]').onclick = () => history.back();
        const r = await api.get('/api/game/questions');
        if (!r.ok) return (root.querySelector('#qb').innerHTML = `<div class="empty">${esc(r.msg)}</div>`);
        const qs = r.list;
        answers = (app.me && app.me.answers) || {};
        cur = 0;
        const box = root.querySelector('#qb');
        const render = () => {
          if (cur >= qs.length) return finish(app);
          const q = qs[cur];
          box.innerHTML = `
            <div style="color:var(--sub);font-size:13px;margin-bottom:10px">${cur + 1} / ${qs.length}</div>
            <div style="height:4px;background:var(--card2);border-radius:2px;margin-bottom:26px">
              <div style="height:4px;width:${((cur + 1) / qs.length) * 100}%;background:var(--grad);border-radius:2px;transition:.3s"></div></div>
            <div style="font-size:22px;font-weight:700;line-height:1.5;margin-bottom:28px">${esc(q.q)}</div>
            ${q.options.map((o, i) => `<button class="btn btn-block" style="text-align:left;padding:16px 18px;background:var(--card2)"
              data-opt="${esc(o)}">${esc(o)}</button>`).join('')}
            <button class="btn btn-ghost btn-block" data-skip>跳过这题</button>`;
          box.querySelectorAll('[data-opt]').forEach((b) => (b.onclick = () => {
            answers[q.id] = b.dataset.opt; cur++; render();
          }));
          box.querySelector('[data-skip]').onclick = () => { cur++; render(); };
        };
        render();
      },
    };
    async function finish(app) {
      const box = document.getElementById('qb');
      box.innerHTML = '<div style="text-align:center;padding:30px 0"><div class="spinner" style="margin:0 auto 12px"></div>保存中…</div>';
      const r = await api.post('/api/game/answers', { answers });
      if (!r.ok) return (box.innerHTML = `<div class="empty">${esc(r.msg)}</div>`);
      box.innerHTML = `<div style="text-align:center;padding:30px 10px">
        <div style="font-size:56px;margin-bottom:14px">🎉</div>
        <div style="font-size:19px;font-weight:700;margin-bottom:8px">答题完成！</div>
        <div style="color:var(--sub);font-size:13.5px;line-height:1.7">你的答案会用于计算契合度<br>在资料页可以看到与 TA 的心动匹配度</div>
        <button class="btn btn-primary" style="margin-top:26px;width:200px" data-back>完成</button></div>`;
      box.querySelector('[data-back]').onclick = () => history.back();
    }
  };

  /* ================= 任务 & 签到 ================= */
  P.tasks = function () {
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>🎯 每日任务</h1></div>
        <div class="body no-tab" id="tkb"><div class="spinner" style="margin:40px auto"></div></div></div>`,
      async mount(root, app) {
        root.querySelector('[data-back]').onclick = () => history.back();
        await load(app);
      },
      onShow(root, app) { load(app, true); },
    };
    async function load(app, silent) {
      const box = document.getElementById('tkb');
      if (!box) return;
      const [tr, cr] = await Promise.all([api.get('/api/game/tasks'), api.get('/api/game/checkin')]);
      if (!tr.ok) return (box.innerHTML = `<div class="empty">${esc(tr.msg)}</div>`);
      const c = cr.ok ? cr : {};
      box.innerHTML = `
        <div style="padding:18px 16px;background:linear-gradient(160deg,rgba(255,201,77,.16),transparent);text-align:center">
          <div style="font-size:15px;color:var(--sub)">我的火花币</div>
          <div style="font-size:34px;font-weight:800;color:var(--gold);margin:6px 0">${tr.coins || 0}</div>
          <button class="btn ${c.today ? '' : 'btn-primary'}" style="width:200px;margin-top:8px" id="ck">
            ${c.today ? '今日已签到 ✓' : '📅 签到领币'}
          </button>
          <div style="color:var(--dim);font-size:12px;margin-top:8px">连续签到 ${c.streak || 0} 天</div>
        </div>
        <div class="section-title">今日任务</div>
        ${tr.list.map((t) => `<div class="cell" style="cursor:default">
          <span class="ci">${t.icon}</span>
          <div style="flex:1">
            <div style="font-size:14.5px">${esc(t.name)}</div>
            <div style="height:3px;background:var(--card2);border-radius:2px;margin-top:6px">
              <div style="height:3px;width:${(t.progress / (t.target || 1)) * 100}%;background:var(--grad);border-radius:2px"></div></div>
            <div style="color:var(--dim);font-size:11.5px;margin-top:4px">${t.target ? `${t.progress}/${t.target}` : t.done ? '已完成' : '未完成'} · 奖励 ${t.reward} 火花币</div>
          </div>
          <button class="btn btn-sm ${t.done ? '' : 'btn-primary'}" data-claim="${esc(t.id)}" ${t.done ? 'disabled style="opacity:.4"' : ''}>
            ${t.done ? '已领' : '领取'}</button>
        </div>`).join('')}
        <div class="section-title">更多玩法</div>
        <button class="cell" data-go="flash"><span class="ci">⚡</span>随机闪聊<span class="cv">匿名 5 分钟 ›</span></button>
        <button class="cell" data-go="questions"><span class="ci">💭</span>心动问答<span class="cv">测契合度 ›</span></button>
        <button class="cell" data-go="wallet"><span class="ci">💰</span>我的钱包<span class="cv">充值 ›</span></button>
        <button class="cell" data-go="invite"><span class="ci">🎁</span>邀请好友<span class="cv">各得 30 币 ›</span></button>`;
      const ck = box.querySelector('#ck');
      if (ck && !c.today) ck.onclick = async () => {
        const r = await api.post('/api/game/checkin');
        if (r.ok) { toast(`签到成功 +${r.reward} 火花币 🎉`); load(app); } else toast(r.msg);
      };
      box.querySelectorAll('[data-claim]').forEach((b) => (b.onclick = async () => {
        const r = await api.post('/api/game/task/claim', { id: b.dataset.claim });
        if (r.ok) { toast(`领取成功 +${r.reward} 🎉`); load(app); } else toast(r.msg);
      }));
      box.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => app.go(b.dataset.go)));
    }
  };

  /* ================= 火花值详情 ================= */
  P.tianruoDetail = function () {
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>🔥 火花值</h1></div>
        <div class="body no-tab" id="spb"><div class="spinner" style="margin:40px auto"></div></div></div>`,
      async mount(root, app) {
        root.querySelector('[data-back]').onclick = () => history.back();
        const r = await api.get('/api/game/tianruo');
        if (!r.ok) return (root.querySelector('#spb').innerHTML = `<div class="empty">${esc(r.msg)}</div>`);
        const box = root.querySelector('#spb');
        const pct = Math.round((r.progress || 0) * 100);
        box.innerHTML = `
          <div style="padding:30px 20px;text-align:center;background:radial-gradient(circle at 50% 30%,rgba(255,77,141,.2),transparent)">
            <div style="font-size:64px">🔥</div>
            <div style="font-size:15px;color:var(--sub);margin-top:8px">当前等级</div>
            <div style="font-size:26px;font-weight:800;margin:4px 0">Lv.${r.level} ${esc(r.name)}</div>
            <div style="font-size:13px;color:var(--sub)">火花值 ${r.total}</div>
            <div style="max-width:260px;margin:20px auto 0">
              <div style="height:8px;background:var(--card2);border-radius:4px;overflow:hidden">
                <div style="height:8px;width:${pct}%;background:var(--grad);border-radius:4px"></div></div>
              <div style="color:var(--dim);font-size:11.5px;margin-top:8px">
                ${r.next ? `距离下一级还需 ${r.next - r.total} 火花值` : '已达最高等级 👑'}</div>
            </div>
          </div>
          <div class="section-title">火花值怎么涨</div>
          ${[['💬 聊天消息', '每条 +1'], ['⚡ 连续聊天', '每日首聊 streak +1'], ['🎁 赠送礼物', '按价值折算'], ['💖 互相点赞', '每日 +2']]
            .map((x) => `<div class="cell" style="cursor:default"><span class="ci">${x[0].split(' ')[0]}</span>
              <div><div style="font-size:14.5px">${esc(x[0].split(' ')[1])}</div></div>
              <span class="cv">${esc(x[1])}</span></div>`).join('')}
          <div class="section-title">等级特权</div>
          ${[['Lv.1 小火苗', '基础功能'], ['Lv.3 火花', '解锁超级喜欢 x2'], ['Lv.4 烈焰', '推荐优先曝光'], ['Lv.6 永恒之火', '专属标识 + 无限喜欢']]
            .map((x) => `<div class="cell" style="cursor:default"><span class="ci">🏅</span>
              <div style="font-size:14px">${esc(x[0])}</div><span class="cv">${esc(x[1])}</span></div>`).join('')}`;
      },
    };
  };

  /* ================= 兴趣圈子 ================= */
  P.circles = function () {
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>🎪 兴趣圈子</h1></div>
        <div class="body no-tab" id="cb"><div class="spinner" style="margin:40px auto"></div></div></div>`,
      async mount(root, app) {
        root.querySelector('[data-back]').onclick = () => history.back();
        const r = await api.get('/api/group/circles');
        const box = root.querySelector('#cb');
        if (!r.ok) return (box.innerHTML = `<div class="empty">${esc(r.msg)}</div>`);
        box.innerHTML = `<div style="padding:14px 14px 4px;color:var(--sub);font-size:13px">
            找到同好，聊起来 ⚡</div>` +
          r.list.map((c) => `<div class="list-item" data-id="${esc(c.id)}" style="border-radius:14px;margin:8px 10px;background:var(--card)">
            <div class="avatar" style="background:${esc(c.color)}22;color:${esc(c.color)};display:flex;align-items:center;
              justify-content:center;font-size:24px">${esc(c.icon)}</div>
            <div class="li-main"><div class="li-title">${esc(c.name)}</div>
              <div class="li-sub">${esc(c.desc)} · ${c.posts || 0} 条动态</div></div>
            <button class="btn btn-sm" style="border:1px solid ${esc(c.color)};color:${esc(c.color)};background:transparent">进入</button>
          </div>`).join('') +
          `<div class="section-title">广场热榜</div>
           <button class="cell" data-go="hot"><span class="ci">🔥</span>今日热榜<span class="cv">TOP 20 ›</span></button>
           <button class="cell" data-go="rank"><span class="ci">🏆</span>活跃达人榜<span class="cv">›</span></button>`;
        box.querySelectorAll('[data-id]').forEach((row) => (row.onclick = () => app.go('circleChat', { id: row.dataset.id })));
        box.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => app.go(b.dataset.go)));
      },
    };
  };

  /* ================= 圈子群聊 ================= */
  P.circleChat = function () {
    let gid = null, name = '';
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1 id="ct">圈子</h1></div>
        <div class="chat-wrap">
          <div class="chat-body" id="gmsgs"><div class="spinner" style="margin:30px auto"></div></div>
          <div class="chat-input">
            <input class="input" id="gin" placeholder="和圈友们聊聊…">
            <button class="send-btn" id="gsend">发送</button>
          </div>
        </div></div>`,
      async mount(root, app, params) {
        gid = params.id;
        root.querySelector('[data-back]').onclick = () => history.back();
        const cr = await api.get('/api/group/circles');
        if (cr.ok) {
          const c = cr.list.find((x) => x.id === gid);
          if (c) { name = c.name; root.querySelector('#ct').textContent = c.icon + ' ' + c.name; }
        }
        await api.post('/api/group/join', { groupId: gid });
        const send = async () => {
          const v = root.querySelector('#gin').value.trim();
          if (!v) return;
          root.querySelector('#gin').value = '';
          const r = await api.post('/api/group/send', { groupId: gid, content: v });
          if (r.ok) load(); else toast(r.msg);
        };
        root.querySelector('#gsend').onclick = send;
        root.querySelector('#gin').onkeydown = (e) => e.key === 'Enter' && send();
        app.onWs('group_message', (d) => { if (d.groupId === gid) load(); });
        load();
        setInterval(() => { if (gid) load(); }, 4000);
      },
    };
    async function load() {
      const r = await api.get('/api/group/messages?groupId=' + gid + '&limit=60');
      const box = document.getElementById('gmsgs');
      if (!box || !r.ok) return;
      box.innerHTML = r.list.length ? r.list.map((m) => {
        if (m.type === 'join') return `<div class="sys-msg">${esc(m.content)}</div>`;
        return `<div class="msg-row ${m.mine ? 'mine' : ''}">
          ${m.mine ? '' : `<img class="avatar sm" src="${esc(m.avatar)}">`}
          <div class="bubble">
            ${m.mine ? '' : `<div style="font-size:11.5px;color:rgba(255,255,255,.7);margin-bottom:3px">${esc(m.nickname)}</div>`}
            ${esc(m.content)}</div></div>`;
      }).join('') : '<div style="text-align:center;color:var(--dim);padding:40px 0">还没有人发言，来说第一句吧</div>';
      box.scrollTop = box.scrollHeight;
    }
  };

  /* ================= 热榜 / 活跃榜 ================= */
  function rankPage(title, fetcher, key) {
    return function () {
      return {
        tab: null,
        html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>${esc(title)}</h1></div>
          <div class="body no-tab" id="hb"><div class="spinner" style="margin:40px auto"></div></div></div>`,
        async mount(root, app) {
          root.querySelector('[data-back]').onclick = () => history.back();
          const r = await fetcher();
          const box = root.querySelector('#hb');
          if (!r.ok) return (box.innerHTML = `<div class="empty">${esc(r.msg)}</div>`);
          if (!r.list.length) return (box.innerHTML = `<div class="empty"><div class="ei">🌱</div>暂无数据</div>`);
          const medal = ['🥇', '🥈', '🥉'];
          box.innerHTML = r.list.map((x, i) => key === 'hot'
            ? `<div class="list-item" data-m="${esc(x.id)}">
                <div style="width:28px;text-align:center;font-size:17px;font-weight:800;color:${i < 3 ? 'var(--gold)' : 'var(--dim)'}">${medal[i] || i + 1}</div>
                <div class="li-main"><div class="li-title" style="font-size:14px;font-weight:500">${esc(x.text)}</div>
                <div class="li-sub">${x.topic ? esc(x.topic) + ' · ' : ''}❤️ ${x.likes} · 💬 ${x.comments}</div></div>
              </div>`
            : `<div class="list-item" data-id="${esc(x.user.id)}">
                <div style="width:28px;text-align:center;font-size:17px;font-weight:800;color:${i < 3 ? 'var(--gold)' : 'var(--dim)'}">${medal[i] || i + 1}</div>
                <img class="avatar" src="${esc(x.user.avatar)}">
                <div class="li-main"><div class="li-title">${esc(x.user.nickname)}${x.user.vip ? '<span class="badge-vip">VIP</span>' : ''}</div>
                <div class="li-sub">${x.moments} 条动态 · 获赞 ${x.likes}</div></div>
                <div class="li-time" style="color:var(--pink)">${x.score} 分</div>
              </div>`).join('');
          box.querySelectorAll('[data-id]').forEach((row) => (row.onclick = () => app.go('profile', { id: row.dataset.id })));
          box.querySelectorAll('[data-m]').forEach((row) => (row.onclick = () => toast('打开广场查看这条动态')));
        },
      };
    };
  }
  P.hot = rankPage('🔥 今日热榜', () => api.get('/api/group/hot'), 'hot');
  P.rank = rankPage('🏆 活跃达人榜', () => api.get('/api/group/rank'), 'rank');

  /* ================= 邀请 ================= */
  P.invite = function () {
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>🎁 邀请好友</h1></div>
        <div class="body no-tab" id="ib"><div class="spinner" style="margin:40px auto"></div></div></div>`,
      async mount(root, app) {
        root.querySelector('[data-back]').onclick = () => history.back();
        const r = await api.get('/api/extra/invite');
        const box = root.querySelector('#ib');
        if (!r.ok) return (box.innerHTML = `<div class="empty">${esc(r.msg)}</div>`);
        box.innerHTML = `
          <div style="padding:26px 20px;text-align:center;background:linear-gradient(160deg,rgba(124,92,255,.2),transparent)">
            <div style="font-size:52px">🎁</div>
            <div style="font-size:17px;font-weight:700;margin:10px 0 6px">邀请好友，各得 30 火花币</div>
            <div style="color:var(--sub);font-size:13px">好友用你的邀请码注册，双方都有奖励</div>
            <div style="margin:22px auto;padding:14px;background:var(--card);border-radius:14px;max-width:220px;
              border:1px dashed var(--purple)">
              <div style="font-size:28px;font-weight:800;letter-spacing:6px;color:var(--purple)">${esc(r.code)}</div>
            </div>
            <button class="btn btn-primary" style="width:200px" id="copy">📋 复制邀请码</button>
          </div>
          <div class="section-title">我邀请的人（${r.invited.length}）</div>
          ${r.invited.length ? r.invited.map((u) => `<div class="list-item" data-id="${esc(u.id)}">
            <img class="avatar" src="${esc(u.avatar)}">
            <div class="li-main"><div class="li-title">${esc(u.nickname)}</div>
            <div class="li-sub">${esc(u.city || '神秘城市')}</div></div></div>`).join('')
            : '<div style="color:var(--dim);text-align:center;padding:24px">还没有邀请到好友</div>'}
          <div class="section-title">填写好友邀请码</div>
          <div style="padding:0 16px;display:flex;gap:8px">
            <input class="input" id="icode" placeholder="输入邀请码" style="flex:1">
            <button class="btn btn-primary" id="iuse">使用</button>
          </div>
          <div style="color:var(--dim);font-size:11.5px;text-align:center;padding:16px">已累计获得 ${r.reward} 火花币</div>`;
        box.querySelector('#copy').onclick = () => {
          const t = r.code;
          if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('邀请码已复制'));
          else toast('邀请码：' + t);
        };
        box.querySelector('#iuse').onclick = async () => {
          const v = box.querySelector('#icode').value.trim();
          if (!v) return toast('请输入邀请码');
          const r2 = await api.post('/api/extra/invite/use', { code: v });
          toast(r2.msg || '使用成功');
          if (r2.ok) mount(root, app);
        };
        box.querySelectorAll('[data-id]').forEach((row) => (row.onclick = () => app.go('profile', { id: row.dataset.id })));
      },
    };
  };

  /* ================= 钱包 ================= */
  P.wallet = function () {
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>💰 我的钱包</h1></div>
        <div class="body no-tab" id="wb"><div class="spinner" style="margin:40px auto"></div></div></div>`,
      async mount(root, app) {
        root.querySelector('[data-back]').onclick = () => history.back();
        await load(app);
      },
    };
    async function load(app) {
      const r = await api.get('/api/extra/gifts');
      const box = document.getElementById('wb');
      if (!r.ok) return (box.innerHTML = `<div class="empty">${esc(r.msg)}</div>`);
      box.innerHTML = `
        <div style="padding:26px 20px;text-align:center;background:linear-gradient(160deg,rgba(255,201,77,.16),transparent)">
          <div style="color:var(--sub);font-size:13px">火花币余额</div>
          <div style="font-size:38px;font-weight:800;color:var(--gold);margin:6px 0">${r.coins}</div>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:14px">
            ${[100, 500, 1000].map((n) => `<button class="btn btn-sm" data-r="${n}">充 ${n}</button>`).join('')}
          </div>
          <div style="color:var(--dim);font-size:11.5px;margin-top:10px">演示环境，点击直接到账</div>
        </div>
        <div class="section-title">礼物清单</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0 14px">
          ${r.list.map((g) => `<div style="background:var(--card);border-radius:14px;padding:14px 8px;text-align:center">
            <div style="font-size:32px">${g.icon}</div>
            <div style="font-size:13px;margin-top:6px;font-weight:600">${esc(g.name)}</div>
            <div style="color:var(--gold);font-size:12px;margin-top:3px">${g.price} 币</div>
          </div>`).join('')}
        </div>
        <div style="color:var(--dim);font-size:12px;text-align:center;padding:18px">
          在聊天页点击 🎁 可以给好友送礼物</div>`;
      box.querySelectorAll('[data-r]').forEach((b) => (b.onclick = async () => {
        const r2 = await api.post('/api/extra/coins/recharge', { amount: +b.dataset.r });
        if (r2.ok) { toast(`充值成功，余额 ${r2.coins}`); load(app); } else toast(r2.msg);
      }));
    }
  };
})();
