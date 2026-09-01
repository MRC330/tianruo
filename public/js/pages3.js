/* 页面：编辑资料 / 设置 / 相册 / 标签 / 会员 / 搜索 */
(function () {
  const P = (window.PAGES = window.PAGES || {});

  const TAG_POOL = ['摄影','旅行','美食','健身','音乐','电影','游戏','动漫','穿搭','美妆','宠物','阅读','咖啡','手帐','滑板','篮球','说唱','舞蹈','绘画','编程','露营','骑行','潜水','汉服','塔罗','星座','做饭','追剧','小说','电竞','livehouse','瑜伽'];

  /* ================= 编辑资料 ================= */
  P.edit = function () {
    let photos = [];
    let tags = [];
    return {
      tab: null,
      html: `<div class="page"><div class="nav">
          <button class="nav-l" data-back>${'‹ 返回'}</button><h1>编辑资料</h1>
          <button class="nav-r primary" id="save">保存</button></div>
        <div class="body no-tab" id="editBody"><div class="loader"><div class="spinner"></div>加载中…</div></div></div>`,
      async mount(root, app, params) {
        const mr = await api.me();
        if (!mr.ok) return toast(mr.msg);
        const u = mr.user;
        photos = (u.photos || []).slice();
        tags = (u.tags || []).slice();
        const el = root.querySelector('#editBody');
        root.querySelector('[data-back]').onclick = () => (params && params.first ? app.replace('deck') : history.back());
        el.innerHTML = `
          <div style="padding:20px 18px">
            <div style="text-align:center;margin-bottom:18px">
              <img id="av" src="${esc(u.avatar)}" style="width:96px;height:96px;border-radius:50%;object-fit:cover;margin:0 auto;border:3px solid var(--pink)">
              <div style="color:var(--sub);font-size:12.5px;margin-top:8px">点击头像更换</div>
              <input type="file" id="avFile" accept="image/*" style="display:none">
            </div>
            <div class="section-title" style="padding-left:0">基本信息</div>
            <input class="input" id="nickname" placeholder="昵称" value="${esc(u.nickname || '')}" style="margin-bottom:10px">
            <div style="display:flex;gap:10px;margin-bottom:10px">
              <select class="input" id="gender" style="flex:1">
                <option value="">性别</option>
                <option value="女" ${u.gender === '女' ? 'selected' : ''}>女生</option>
                <option value="男" ${u.gender === '男' ? 'selected' : ''}>男生</option>
              </select>
              <input class="input" id="birthday" type="date" style="flex:1.4" value="${esc(u.birthday || '2003-01-01')}">
            </div>
            <input class="input" id="city" placeholder="城市" value="${esc(u.city || '')}" style="margin-bottom:10px">
            <input class="input" id="school" placeholder="学校 / 公司" value="${esc(u.school || '')}" style="margin-bottom:10px">
            <input class="input" id="job" placeholder="职业" value="${esc(u.job || '')}" style="margin-bottom:10px">
            <div class="section-title" style="padding-left:0">个性签名</div>
            <input class="input" id="signature" placeholder="一句话介绍自己" value="${esc(u.signature || '')}" style="margin-bottom:10px">
            <div class="section-title" style="padding-left:0">关于我</div>
            <textarea class="input" id="bio" rows="3" placeholder="详细说说你的故事…" style="resize:none;margin-bottom:10px">${esc(u.bio || '')}</textarea>
            <div class="section-title" style="padding-left:0">兴趣标签 <span style="color:var(--dim)">（最多 8 个）</span></div>
            <div id="tagBox" style="margin-bottom:10px"></div>
            <div class="section-title" style="padding-left:0">相册 <span style="color:var(--dim)">（最多 6 张）</span></div>
            <div id="photoBox" style="display:flex;gap:8px;flex-wrap:wrap"></div>
            <input type="file" id="pFile" accept="image/*" multiple style="display:none">
          </div>`;

        // 头像
        el.querySelector('#av').onclick = () => el.querySelector('#avFile').click();
        el.querySelector('#avFile').onchange = async (e) => {
          const f = e.target.files[0]; if (!f) return;
          toast('上传中…');
          const r = await api.upload(f);
          if (!r.ok) return toast(r.msg);
          el.querySelector('#av').src = r.url;
          el.querySelector('#av').dataset.url = r.url;
        };

        const renderTags = () => {
          el.querySelector('#tagBox').innerHTML = TAG_POOL.map((t) => `<span class="tag ${tags.includes(t) ? 'on' : ''}" data-t="${esc(t)}">${esc(t)}</span>`).join('');
          el.querySelectorAll('#tagBox .tag').forEach((x) => (x.onclick = () => {
            const t = x.dataset.t;
            if (tags.includes(t)) tags = tags.filter((y) => y !== t);
            else if (tags.length >= 8) return toast('最多选择 8 个标签');
            else tags.push(t);
            renderTags();
          }));
        };
        renderTags();

        const renderPhotos = () => {
          el.querySelector('#photoBox').innerHTML =
            photos.map((p, i) => `<div style="position:relative">
              <img src="${esc(p)}" style="width:76px;height:76px;object-fit:cover;border-radius:12px">
              <button data-i="${i}" style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;
                background:var(--pink);border:none;color:#fff;font-size:13px;line-height:1">×</button></div>`).join('') +
            (photos.length < 6 ? `<button id="addPhoto" style="width:76px;height:76px;border-radius:12px;border:1px dashed var(--line);
              background:var(--card2);color:var(--sub);font-size:26px">＋</button>` : '');
          const add = el.querySelector('#addPhoto');
          if (add) add.onclick = () => el.querySelector('#pFile').click();
          el.querySelectorAll('#photoBox button[data-i]').forEach((b) => (b.onclick = () => { photos.splice(+b.dataset.i, 1); renderPhotos(); }));
        };
        renderPhotos();
        el.querySelector('#pFile').onchange = async (e) => {
          for (const f of Array.from(e.target.files).slice(0, 6 - photos.length)) {
            const r = await api.upload(f);
            if (r.ok) photos.push(r.url);
          }
          renderPhotos();
        };

        root.querySelector('#save').onclick = async () => {
          const data = {
            nickname: el.querySelector('#nickname').value.trim(),
            gender: el.querySelector('#gender').value,
            birthday: el.querySelector('#birthday').value,
            city: el.querySelector('#city').value.trim(),
            school: el.querySelector('#school').value.trim(),
            job: el.querySelector('#job').value.trim(),
            signature: el.querySelector('#signature').value.trim(),
            bio: el.querySelector('#bio').value.trim(),
            tags, photos,
          };
          const av = el.querySelector('#av').dataset.url;
          if (av) data.avatar = av;
          if (!data.nickname) return toast('请填写昵称');
          const r = await api.update(data);
          if (!r.ok) return toast(r.msg);
          app.me = r.user;
          window.TIANRUO_CONFIG.setProfile(r.user);
          toast('保存成功 ✨');
          if (params && params.first) app.replace('deck');
          else history.back();
        };
      },
    };
  };

  /* ================= 设置 ================= */
  P.settings = function () {
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>设置</h1></div>
        <div class="body no-tab" id="setBody"></div></div>`,
      mount(root, app) {
        root.querySelector('[data-back]').onclick = () => history.back();
        const el = root.querySelector('#setBody');
        el.innerHTML = `
          <div class="section-title">连接</div>
          <button class="cell" data-a="server"><span class="ci">🌐</span>服务器地址<span class="cv">${esc(window.TIANRUO_CONFIG.server || '同源')} ›</span></button>
          <button class="cell" data-a="health"><span class="ci">📡</span>连接测试<span class="cv">点击测试 ›</span></button>
          <button class="cell" data-a="locate"><span class="ci">📍</span>更新我的位置<span class="cv">›</span></button>
          <div class="section-title">隐私</div>
          <button class="cell" data-a="privacy"><span class="ci">🔒</span>隐私设置<span class="cv">›</span></button>
          <button class="cell" data-a="notify"><span class="ci">🔔</span>消息通知<span class="cv">${Notification.permission === 'granted' ? '已开启' : '未开启'} ›</span></button>
          <div class="section-title">关于</div>
          <button class="cell" data-a="about"><span class="ci">ℹ️</span>关于 天弱<span class="cv">v1.0 ›</span></button>
          <button class="cell" data-a="clear"><span class="ci">🧹</span>清除缓存数据<span class="cv">›</span></button>
          <button class="cell" data-a="logout"><span class="ci">🚪</span>退出登录<span class="cv">›</span></button>
          <div style="text-align:center;color:var(--dim);font-size:11.5px;padding:24px 12px">
            天弱 · 年轻人的交友社区<br>本产品为演示项目，请遵守法律法规与社区规范</div>`;
        el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
          const a = b.dataset.a;
          if (a === 'server') openServerSettings(() => location.reload());
          if (a === 'health') api.health().then((r) => toast(r.ok ? `连接正常 · 用户 ${r.users} · 动态 ${r.moments}` : '连接失败：' + r.msg, 2600));
          if (a === 'locate' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (p) => api.location(p.coords.latitude, p.coords.longitude).then((r) => toast(r.ok ? '位置已更新' : r.msg)),
              () => toast('无法获取位置')
            );
          }
          if (a === 'privacy') window.modal('隐私设置', '你可以在「我的 → 编辑资料」中控制展示内容；屏蔽与举报记录不会被对方看到。');
          if (a === 'notify' && window.Notification) Notification.requestPermission().then((p) => toast(p === 'granted' ? '通知已开启' : '未开启通知'));
          if (a === 'about') window.modal('关于 天弱', '天弱 · 面向 25 岁以下年轻人的交友 App<br>版本 1.0<br>支持匹配、聊天、动态广场、附近的人与实时互动。');
          if (a === 'clear') window.modal('清除缓存', '将清除本地登录信息（服务器数据保留）。', () => { window.TIANRUO_CONFIG.clearServer(); localStorage.clear(); location.reload(); }, '清除');
          if (a === 'logout') window.modal('退出登录', '确定退出吗？', () => { window.TIANRUO_CONFIG.setToken(''); location.reload(); }, '退出');
        }));
      },
    };
  };

  /* ================= 相册 / 标签 快捷页 ================= */
  P.photos = function () {
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>我的相册</h1></div>
        <div class="body no-tab" id="pb"><div class="loader"><div class="spinner"></div></div></div></div>`,
      async mount(root, app) {
        root.querySelector('[data-back]').onclick = () => history.back();
        const r = await api.me();
        const el = root.querySelector('#pb');
        const list = (r.ok && r.user.photos) || [];
        el.innerHTML = list.length
          ? `<div class="detail-photos" style="padding:14px">${list.map((p, i) => `<img src="${esc(p)}" data-i="${i}">`).join('')}</div>
             <div style="color:var(--dim);font-size:12px;text-align:center;padding:10px">点击图片可放大，长按可保存</div>`
          : `<div class="empty"><div class="ei">🖼</div>还没有照片<br><button class="btn btn-primary" style="margin-top:14px" data-edit>去上传</button></div>`;
        el.querySelectorAll('img[data-i]').forEach((img) => (img.onclick = () => previewImages(list, +img.dataset.i)));
        const eb = el.querySelector('[data-edit]');
        if (eb) eb.onclick = () => app.go('edit');
      },
    };
  };

  P.tags = function () {
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>兴趣标签</h1>
        <button class="nav-r primary" id="saveTags">保存</button></div>
        <div class="body no-tab" id="tb"><div class="loader"><div class="spinner"></div></div></div></div>`,
      async mount(root, app) {
        root.querySelector('[data-back]').onclick = () => history.back();
        const r = await api.me();
        let tags = (r.ok && r.user.tags) || [];
        const el = root.querySelector('#tb');
        const render = () => {
          el.innerHTML = `<div style="padding:14px 16px">${TAG_POOL.map((t) => `<span class="tag ${tags.includes(t) ? 'on' : ''}" data-t="${esc(t)}">${esc(t)}</span>`).join('')}</div>`;
          el.querySelectorAll('.tag').forEach((x) => (x.onclick = () => {
            const t = x.dataset.t;
            if (tags.includes(t)) tags = tags.filter((y) => y !== t);
            else if (tags.length >= 8) return toast('最多 8 个');
            else tags.push(t);
            render();
          }));
        };
        render();
        root.querySelector('#saveTags').onclick = async () => {
          const r2 = await api.update({ tags });
          if (r2.ok) { toast('已保存'); history.back(); } else toast(r2.msg);
        };
      },
    };
  };

  /* ================= 会员 ================= */
  P.vip = function () {
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button><h1>天弱 会员</h1></div>
        <div class="body no-tab" id="vb"></div></div>`,
      async mount(root, app) {
        root.querySelector('[data-back]').onclick = () => history.back();
        const r = await api.me();
        const isVip = r.ok && r.user.vip;
        root.querySelector('#vb').innerHTML = `
          <div style="padding:26px 20px;text-align:center;background:linear-gradient(160deg,rgba(255,201,77,.18),transparent)">
            <div style="font-size:52px">👑</div>
            <div style="font-size:22px;font-weight:800;margin-top:8px">${isVip ? '你已是 天弱 会员' : '解锁 天弱 会员'}</div>
            <div style="color:var(--sub);font-size:13.5px;margin-top:8px">无限喜欢 · 查看谁喜欢你 · 超级曝光</div>
          </div>
          <div style="padding:14px 16px">
            ${[['⚡ 无限喜欢', '每天喜欢次数不限'], ['👀 谁喜欢我', '查看全部喜欢你的人'], ['🚀 超级曝光', '让你的资料被更多人看到'], ['🎯 精准推荐', '按兴趣标签优先匹配']]
              .map((x) => `<div class="cell" style="cursor:default"><span class="ci" style="font-size:22px">${x[0].split(' ')[0]}</span>
                <div><div style="font-size:14.5px">${esc(x[0].split(' ')[1])}</div><div style="color:var(--dim);font-size:12px">${esc(x[1])}</div></div></div>`).join('')}
          </div>
          <div style="padding:0 20px">
            <button class="btn btn-primary btn-block" id="vipBtn">${isVip ? '你已开通会员 ✓' : '立即开通（演示：直接激活）'}</button>
            <div style="color:var(--dim);font-size:11.5px;text-align:center;margin-top:12px">演示环境无需支付，点击即可激活</div>
          </div>`;
        root.querySelector('#vipBtn').onclick = async () => {
          const r2 = await api.update({ vip: true });
          if (r2.ok) { toast('会员已激活 👑'); app.me = r2.user; mount(root, app); } else toast(r2.msg);
        };
      },
    };
  };

  /* ================= 搜索 ================= */
  P.search = function () {
    return {
      tab: null,
      html: `<div class="page"><div class="nav"><button class="nav-l" data-back>‹ 返回</button>
          <div style="flex:1;padding:0 60px"><input class="input" id="kw" placeholder="搜索昵称 / 城市 / 学校 / 兴趣" style="padding:8px 14px;font-size:14px"></div></div>
        <div class="body no-tab" id="sb"><div style="color:var(--dim);text-align:center;padding:40px">输入关键词开始搜索</div></div></div>`,
      mount(root, app) {
        root.querySelector('[data-back]').onclick = () => history.back();
        const input = root.querySelector('#kw');
        const el = root.querySelector('#sb');
        input.focus();
        let timer = null;
        input.oninput = () => {
          clearTimeout(timer);
          timer = setTimeout(async () => {
            const kw = input.value.trim();
            if (!kw) return (el.innerHTML = '<div style="color:var(--dim);text-align:center;padding:40px">输入关键词开始搜索</div>');
            el.innerHTML = '<div class="loader"><div class="spinner"></div>搜索中…</div>';
            const r = await api.search(kw);
            if (!r.ok) return (el.innerHTML = `<div class="empty">${esc(r.msg)}</div>`);
            if (!r.list.length) return (el.innerHTML = `<div class="empty"><div class="ei">🔍</div>没有找到相关的人</div>`);
            el.innerHTML = r.list.map((u) => `<div class="list-item" data-id="${esc(u.id)}">
              <div class="av-wrap"><img class="avatar" src="${esc(u.avatar)}"><span class="online-dot ${u.online ? 'on' : ''}"></span></div>
              <div class="li-main"><div class="li-title">${esc(u.nickname)}${u.vip ? '<span class="badge-vip">VIP</span>' : ''}</div>
              <div class="li-sub">${u.age ? esc(u.age + '岁 · ') : ''}${esc([u.city, u.school].filter(Boolean).join(' · '))}</div></div>
            </div>`).join('');
            el.querySelectorAll('[data-id]').forEach((row) => (row.onclick = () => app.go('profile', { id: row.dataset.id })));
          }, 350);
        };
      },
    };
  };
})();
