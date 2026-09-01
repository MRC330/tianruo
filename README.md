# ⚡ 天弱 v10.0

面向 **25 岁以下年轻人**的交友社交 App，对标 陌陌 / Soul / 火花 / Solo。
服务端 + 移动端 H5 + 管理后台一体交付，**填入服务器地址即可联网使用**。

---

## 快速开始

```bash
cd /data/workspace/tianruo
npm install          # 仅需 express / ws / multer，3 秒装完
node server/index.js # 默认 3000 端口
```

打开 `http://localhost:3000`（手机与电脑同 WiFi 时用启动日志里的局域网地址）。
管理后台：`http://localhost:3000/admin.html`

> **演示账号**：`13800000000` / 密码 `123456`
> **验证码登录**：任意 11 位手机号 + 验证码 `1234`（演示模式）
> **管理密钥**：`tianruo-admin-2024`
> 内置 33 个虚拟用户、25+ 条动态、若干预置匹配，登录后即可体验完整流程。

## 服务器地址怎么填（联网核心）

1. **App 内设置**：我的 → 设置 → 服务器地址，填 `http://你的IP:3000`
2. **首次打开自动弹窗**：前端检测 `/api/health` 不通时自动提示
3. **代码默认值**：改 `public/js/config.js`

所有请求在 `public/js/api.js` 统一走 `TIANRUO_CONFIG.server`，**换地址即换后端，不改业务代码**。
WebSocket 自动从 `http(s)://` 推导 `ws(s)://`。

## 部署到公网

```bash
chmod +x deploy.sh && ./deploy.sh   # 交互式：systemd / pm2 / docker 三选一
```

- **systemd**：自动写 service，开机自启，`journalctl -u tianruo -f` 看日志
- **pm2**：`pm2 start server/index.js --name tianruo`
- **Docker**：`docker build -t tianruo . && docker run -d -p 3000:3000 -v ./data:/app/data tianruo`

生产环境建议：
```bash
TIANRUO_SECRET=随机长字符串 SPARK_DEMO_SMS=false TIANRUO_ADMIN_TOKEN=自定义密钥 PORT=3000 node server/index.js
```

---

## 功能一览（v10.0）

| 模块 | 能力 |
|---|---|
| **账号** | 验证码登录/注册、密码登录、Token 30 天、邀请码绑定 |
| **匹配** | 推荐卡片、左右滑、超级喜欢、每日额度、谁喜欢我、匹配弹层、解除匹配 |
| **智能推荐** | 六维打分（距离/兴趣/年龄/问答/活跃/资料）、"为什么推荐 TA"、契合度百分比 |
| **聊天** | 实时推送、分页、语音消息、表情包、图片、消息搜索、置顶/免打扰/备注、长按菜单、撤回 |
| **火花值** | 每会话火花值 + 6 级等级、连续聊天 streak、礼物加成 |
| **玩法** | 每日任务（6 个）、签到、心动问答（8 题）、随机闪聊（匿名 5 分钟） |
| **社区** | 兴趣圈子（8 个）群聊、楼中楼评论、热榜、活跃达人榜 |
| **广场** | 动态流、发布九图、点赞、评论、话题榜单 |
| **商业化** | 火花币钱包、充值、虚拟礼物（6 款）、VIP 三档、邀请裂变 |
| **安全** | 敏感词（60+，变体归一化）、联系方式检测、举报、屏蔽、风控限流 |
| **后台** | 数据看板、用户管理、内容审核、举报处理、系统广播 |
| **系统** | SVG 头像、图片/语音上传、在线状态、访客、PWA 离线、响应式 |

---

## 接口文档

全部以 `/api` 开头，除登录外需 `Authorization: Bearer <token>`；管理后台需 `x-admin-token`。

### 账号 `/api/auth`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/send-code` | `{phone}` → 验证码（演示模式返回 `devCode`） |
| POST | `/login` | `{phone,code}` 或 `{phone,password}` → `{token,user,isNew}` |
| GET | `/me` | 当前用户 |

### 用户 `/api/user`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/profile/:id` | 资料（自动记录访客） |
| POST | `/update` | 更新资料 |
| POST | `/location` | 上报经纬度 |
| GET | `/nearby?gender=&minAge=&maxAge=&limit=` | 附近的人 |
| GET | `/likes-me` `/visitors` `/search?kw=` | 谁喜欢我 / 访客 / 搜索 |
| POST | `/block` `/report` | 屏蔽 / 举报 |

### 匹配 `/api/match`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/cards?gender=` | 推荐卡片（按距离） |
| POST | `/swipe` | `{toId,type:'like'|'pass'|'super'}` → `{matched,matchId,quota}` |
| GET | `/list` `/quota` | 匹配列表 / 今日额度 |
| DELETE | `/:matchId` | 解除匹配 |

### 聊天 `/api/chat`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/list` | 会话列表（含火花值、streak、置顶、备注） |
| GET | `/stickers` | 表情包列表 |
| GET | `/:matchId?limit=&before=` | 聊天记录（分页） |
| GET | `/:matchId/search?kw=` | 消息搜索 |
| POST | `/:matchId/send` | `{type:'text'|'image'|'voice'|'sticker'|'gift',content,extra,replyTo}` |
| POST | `/:matchId/read` `/typing` | 已读 / 正在输入 |
| POST | `/:matchId/settings` | `{pinned,muted,remark}` |
| POST | `/revoke` | 撤回（5 分钟内） |

### 动态 `/api/moment`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/feed?topic=&userId=&type=hot` | 动态流 |
| POST | `/publish` | `{text,images[],topic}` |
| POST | `/:id/like` `/:id/comment` | 点赞 / 评论 |
| DELETE | `/:id` | 删除 |

### 玩法 `/api/game`（v3）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/tianruo` `/tianruo/:matchId` | 火花值总额/等级、单会话火花值与 streak |
| GET | `/tasks` POST `/task/claim` | 每日任务 / 领奖 |
| GET | `/checkin` POST `/checkin` | 签到状态 / 签到 |
| GET | `/questions` POST `/answers` | 心动问答题目 / 保存答案 |
| GET | `/compat/:userId` | 与某人的契合度百分比 |
| POST | `/flash/enter` GET `/flash/:id` | 随机闪聊：进入 / 拉取 |
| POST | `/flash/:id/send` `/reveal` `/leave` | 发言 / 申请解锁 / 离开 |

### 社区 `/api/group`（v4）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/circles` | 8 个兴趣圈子 |
| POST | `/join` `/send` | 加入圈子 / 群聊发言 |
| GET | `/messages?groupId=&limit=` | 圈子消息 |
| POST | `/moment/:id/reply` | 楼中楼评论（`parentId` 二级回复） |
| POST | `/comment/:cid/like` | 评论点赞 |
| GET | `/hot` `/rank` | 热榜 / 活跃达人榜 |

### 推荐与商业化 `/api/extra`（v5+v7）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/recommend?gender=` | 智能打分推荐（`matchScore`、`scoreDetail`） |
| GET | `/why/:userId` | 推荐理由 + 打分构成 |
| GET | `/invite` POST `/invite/use` | 邀请码 / 使用邀请码 |
| GET | `/gifts` POST `/gift/send` | 礼物列表 / 送礼物 |
| GET | `/vip/plans` POST `/vip/buy` | VIP 套餐 / 开通 |
| POST | `/coins/recharge` | 充值火花币（演示） |

### 管理后台 `/api/admin`（v10）
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/login` | 管理密钥登录 |
| GET | `/dashboard` | 数据看板（概览 + 7 日趋势 + 性别/城市分布） |
| GET | `/users?kw=&page=&size=` | 用户列表 |
| POST | `/user/:id/ban` | 封禁 / 解封 |
| GET | `/moments` POST `/moment/:id/delete` | 内容审核（含风险标记） |
| GET | `/reports` POST `/report/:id/resolve` | 举报列表 / 处理（可连带封禁） |
| POST | `/broadcast` | 系统广播给全体用户 |

### 其他
- `GET /api/social/notifications`、`POST /api/social/read`、`GET /api/social/badge`、`GET /api/social/hellos`
- `POST /api/upload`（form-data `file`）→ `{url}`，图片与语音共用
- `GET /api/health` → 服务状态（前端连通性检测）
- `GET /avatar/:seed?size=` → SVG 头像；`GET /sticker/:id.svg` → 表情包
- WebSocket：`ws://host/ws?token=xxx`
  事件：`hello / message / like / match / typing / read / revoke / online / gift / group_message / flash_* / ping`

---

## 自测

```bash
cd /data/workspace/tianruo
node server/index.js &
curl -s http://127.0.0.1:3000/api/health
```

完整回归脚本 `57 项全部通过`，覆盖：
账号 → 匹配 → 聊天 v2 → 玩法 v3 → 社区 v4 → 商业化 v7 → 后台 v10 → 安全风控。

| 测试脚本 | 内容 |
|---|---|
| `/tmp/final_test.js` | 全模块回归（47 项主体） |
| `/tmp/clean_test.js` | 全新账号链路（10 项，避免数据残留） |
| `/tmp/t4.js` | 双用户 WebSocket 实时推送验证 |

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 3000 | 端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `TIANRUO_SECRET` | 内置 | Token 签名密钥，**生产必改** |
| `TIANRUO_ADMIN_TOKEN` | tianruo-admin-2024 | 管理后台密钥，**生产必改** |
| `SPARK_DEMO_SMS` | true | 演示短信（关闭后需接真实网关） |
| `SPARK_DAILY_LIKE` | 50 | 免费用户每日喜欢上限 |
| `SPARK_DATA` | ./data | 数据目录 |

## 项目结构

详见 `PROGRESS.md`（含目录树、版本演进、Bug 修复记录、已知限制）。

## 免责声明

本项目为技术演示产品，内置数据均为虚构。请勿用于任何违法违规用途；实际上线需完成实名认证、内容审核、未成年人保护等合规要求。


---

## 部署到阿里云 / 云服务器

### 生成部署包（在本机）

```bash
bash deploy-aliyun.sh
# 产出 /data/workspace/tianruo-aliyun.tar.gz
```

### 上传并在服务器上部署

```bash
scp tianruo-aliyun.tar.gz root@你的公网IP:/root/
ssh root@你的公网IP

tar -xzf tianruo-aliyun.tar.gz && cd tianruo && bash aliyun.sh
```

脚本全自动：装 Node.js → 装依赖 → 生成随机密钥 → 后台启动 → 开机自启 → 放行防火墙 → 打印访问地址。

### ⚠ 必须手动做的一步：安全组放行端口

脚本无法操作阿里云控制台层面的安全组，务必手动加规则：

> ECS 控制台 → 实例 → 安全组 → 配置规则 → 入方向 → 手动添加
> 协议 TCP，端口 `3000/3000`，授权对象 `0.0.0.0/0`

没做这步手机连不上。

### 部署后

- App 引导页填：`http://你的公网IP:3000`
- 管理后台：`http://你的公网IP:3000/admin.html`，密钥在 `tianruo/.env` 的 `TIANRUO_ADMIN_TOKEN`
- 自检：`curl http://127.0.0.1:3000/api/health` 返回 `ok:true`
- 日志：`journalctl -u tianruo -f`
- 重启：`systemctl restart tianruo`

### 生产建议

1. 所有用户数据在 `tianruo/data/`，定期备份
2. 正式用建议套 Nginx + 免费 SSL 证书，走 HTTPS
3. 修改 `.env` 里的 `TIANRUO_ADMIN_TOKEN`
