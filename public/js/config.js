/* 天弱 前端配置：服务器地址可随时切换，填入即用
 * 构建 APK 时，下面这行会被 set-server.sh 替换为真实地址。
 */
(function () {
  const KEY_SERVER = 'tianruo_server';
  const KEY_TOKEN = 'tianruo_token';
  const KEY_PROFILE = 'tianruo_profile';

  // 打包时注入的默认服务器地址（为空则首次启动弹窗让用户填）
  const DEFAULT_SERVER = '__TIANRUO_SERVER__';

  function normalize(u) {
    u = String(u || '').trim().replace(/\/+$/, '');
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    return u;
  }

  /** 是否运行在 Capacitor / Cordova 原生容器里 */
  function isNative() {
    try {
      if (window.Capacitor && window.Capacitor.isNativePlatform) {
        return window.Capacitor.isNativePlatform() === true;
      }
    } catch (e) { /* ignore */ }
    // TianRuoAndroid：原生 WebView 壳注入的 UA 标记
    var ua = navigator.userAgent || '';
    if (/TianRuoAndroid|TianRuoiOS|CapacitorAndroid|CapacitoriOS/i.test(ua)) return true;
    // 兜底：原生桥存在即视为 App 环境
    return typeof window.TianRuoBridge !== 'undefined';
  }

  function detect() {
    // 1) 用户手动设置的地址，优先级最高
    const saved = normalize(localStorage.getItem(KEY_SERVER));
    if (saved) return saved;

    // 2) 原生容器（APK / iOS）：WebView 自身的源是 http://localhost，
    //    绝不能当成"后端同源"，否则请求会打到 WebView 自己身上而永远 404。
    //    必须使用注入的默认地址；为空则返回空串，交给前端弹出服务器设置。
    if (isNative()) return normalize(DEFAULT_SERVER);

    // 3) 浏览器 + 服务端同源托管（server 直接托管 public）→ 留空，走相对路径
    if (location.protocol === 'http:' || location.protocol === 'https:') return '';

    // 4) 本地 file:// 打开
    return 'http://localhost:3000';
  }

  window.TIANRUO_CONFIG = {
    KEY_SERVER, KEY_TOKEN, KEY_PROFILE,
    normalize,
    isNative,
    get isApp() { return isNative(); },
    get server() { return detect(); },
    setServer(v) { localStorage.setItem(KEY_SERVER, normalize(v)); },
    clearServer() { localStorage.removeItem(KEY_SERVER); },
    get token() { return localStorage.getItem(KEY_TOKEN) || ''; },
    setToken(v) { v ? localStorage.setItem(KEY_TOKEN, v) : localStorage.removeItem(KEY_TOKEN); },
    get profile() { try { return JSON.parse(localStorage.getItem(KEY_PROFILE) || 'null'); } catch (e) { return null; } },
    setProfile(v) { localStorage.setItem(KEY_PROFILE, JSON.stringify(v)); },
    wsUrl() {
      const s = detect();
      if (!s) return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
      return s.replace(/^http/, 'ws') + '/ws';
    },
  };
})();
