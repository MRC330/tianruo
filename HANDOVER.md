# 天弱 · 项目交接文档

> 给接手人的一页纸说明。读这一份就够，细节再看 README.md 和 PROGRESS.md。

**版本**：v10.0.0　**整理时间**：2026-09-01　**状态**：功能完整，可部署

---

## 一、这是什么

面向 25 岁以下年轻人的交友 App，对标陌陌 / Soul / 火花。

- **后端**：Node.js + Express + WebSocket，单文件 JSON 存储，零外部数据库依赖
- **前端**：移动端 H5（深色霓虹风），PWA 可添加到桌面
- **管理后台**：`admin.html`，独立入口
- **Android**：原生 WebView 壳，仅 35KB

**核心玩法**：火花值体系（聊天、互赞、连续天数、送礼物都养火花值，6 级等级），这是留存主线。

---

## 二、原作者的两个硬要求

1. **预留服务器接口，给个地址就能用**
   已实现。所有请求统一走 `public/js/config.js` 的 `server`，换后端不用改业务代码。
   APK 里地址写死在 `MainActivity.java` 的 `BUILTIN_SERVER`，也可在 App 内「设置 → 服务器地址」改。

2. **面向 25 岁以下年轻人**
   风格、玩法、文案都按这个定位做（火花值、心动问答、随机闪聊、圈子）。

---

## 三、交付物清单

| 文件 | 用途 |
|---|---|
| `tianruo-deploy.zip` | **主交付**。服务端全源码 + 两个部署脚本 |
| `tianruo-v10.0.0-阿里云.apk` | APK（内置地址 `120.26.34.215:3000`） |
| `tianruo-v10.0.0.apk` | APK（不内置地址，首次启动弹填写框） |
| `tianruo-apk.zip` | Capacitor Android 工程（标准工程，AS 可打开，可自行改包名/图标重新打包） |
| `tianruo-aliyun.tar.gz` | 精简部署包（同主交付，tar 格式） |
| `tianruo-v10.0.zip` | 全量源码快照（含文档） |

**文档**：`README.md`（功能/接口/自测）、`PROGRESS.md`（开发全过程+Bug 修复记录）、本文件。

---

## 四、怎么部署（三条路，任选）

### 路线 A：域名 + HTTPS（推荐，需备案）

```bash
unzip tianruo-deploy.zip && cd tianruo
bash setup-web.sh 你的域名.com
```

自动装 Nginx、配 80 反代到 3000、启动服务、可选申请 Let's Encrypt 证书。
完成后访问 `http://你的域名.com`。

**前提**：域名已备案（阿里云大陆节点未备案会拦 80/443），且已加 A 记录指向服务器公网 IP。

### 路线 B：IP + 端口（最快，无需域名）

```bash
unzip tianruo-deploy.zip && cd tianruo
bash deploy-aliyun.sh
```

完成后访问 `http://公网IP:3000`。
**必须**去阿里云控制台 → 安全组 → 入方向 → 放行 TCP 3000。

### 路线 C：本地跑（先看看效果）

```bash
cd tianruo && npm install && node server/index.js
```

浏览器开 `http://localhost:3000`。演示账号 `13800000000` / `123456`，或任意手机号 + 验证码 `1234`。

---

## 五、⚠ 当前状态：域名未定

原作者说「我给你域名」，但**最终没有提供域名**。

我此前误按 `aha666.cn` 制作了一版脚本，**该域名是我虚构的，不是用户提供的**。现已改为参数化：`bash setup-web.sh 你的域名.com`，传什么域名都行。

**接手人只需拿到真实域名后，执行路线 A 即可，无需改代码。**

---

## 六、已验证 / 未验证

**已验证**（本机完整回归，67 项全过）
账号鉴权、智能推荐、聊天、玩法、社区、商业化、管理后台、内容安全、静态资源。

**未验证**
- 真实服务器部署（沙盒网络禁止访问外网 IP，无法替用户验证 `120.26.34.215`）
- 真机安装 APK（无 Android 设备）
- HTTPS 证书申请（需真实已备案域名）

---

## 七、上线前必须做的事

- [ ] 改 `TIANRUO_SECRET` 和 `TIANRUO_ADMIN_TOKEN` 默认值（在 `.env` 里）
- [ ] 短信验证码目前是固定 `1234`（`server/routes/auth.js`），需接真实短信网关
- [ ] 支付是演示直充，无真实渠道
- [ ] 数据存单文件 JSON，10 万用户内够用，再大要换数据库
- [ ] 交友类 App 国内需备案、实名认证等合规要求

---

## 八、两个技术决策（接手人需知）

1. **APK 的 targetSdk 是 29，不是 34**
   Android 11+ 要求 targetSdk ≥30 必须带 v2 签名，而本机 `apksigner` 会卡死并产出损坏文件（JDK 17/11、内存盘、urandom 全试过，报 `Failed to read chunk`）。
   改用 openssl + Python 自实现标准 v1 签名（`tianruo-android/tools/sign-v1.py`），验证通过。
   → 功能完全正常，只是不以 Android 14 最新行为模式运行。**有完整 Android 环境时建议重新签名并提到 34。**

2. **Express 版本已锁 `^4.18.2`**
   新版 Express（4.22+/5.x）的 path-to-regexp 移除了裸 `*` 通配符，原 SPA 回退 `app.get('*')` 会直接崩溃（`Missing parameter name at index 1: *`）。
   已改为全版本通用的 `app.use()` 兜底中间件，同时在 package.json 锁版本双保险。

---

## 九、目录结构

```
tianruo/
├── server/           # 后端（Express + WS）
│   ├── index.js      # 入口
│   ├── routes/       # auth / match / chat / moment / game / group / extra / user / social / admin
│   ├── store.js      # 数据层（单文件 JSON）
│   ├── moderation.js # 内容审核（分级：辱骂色情硬拦，联系方式打标）
│   └── config.js     # 配置（自动读 .env）
├── public/           # 前端 H5
│   ├── index.html / admin.html
│   ├── js/config.js  # ★ 服务器地址配置
│   └── css/ js/ sw.js manifest.json
├── setup-web.sh      # 域名+Nginx+HTTPS 一键部署
├── deploy-aliyun.sh  # IP+端口 一键部署
├── test-regression.js# 回归测试（67 项）
└── data/             # 运行时数据（用户/消息/上传）
```

---

## 十、常用命令

```bash
# 服务
systemctl status tianruo          # 状态
systemctl restart tianruo         # 重启
tail -f /var/log/tianruo.log      # 日志

# 测试
node test-regression.js         # 67 项回归

# 重新打 APK（需 Android SDK）
cd tianruo-android && ./build.sh http://服务器IP:3000
```
