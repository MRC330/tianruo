# 天弱 · iOS 客户端

> 基于 **WKWebView** 的原生壳，加载 `tianruo` 仓库里的 `public/` 前端（或远端服务器）。
> 逻辑与 Android App 完全对齐：`public/js/config.js` 识别 UA 标记 `TianRuoiOS`，行为一致。

## 目录

```
ios/
├── 天弱.xcodeproj/        Xcode 工程
├── 天弱/                  Swift 源码 + 资源
│   ├── AppDelegate.swift
│   ├── ViewController.swift   WKWebView 容器、原生桥
│   ├── Info.plist
│   ├── LaunchScreen.storyboard
│   └── www/                  （打包时由 public/ 拷入）离线资源
├── build-ipa.sh             【本地一键出包】Mac + Xcode 运行
├── make_icon.py             生成 AppIcon（无 PIL 自动跳过）
├── verify_ipa.py            IPA 结构校验
└── ../.github/workflows/build-ipa.yml   【云端自动出包】GitHub Actions
```

## 三种出包方式

### ① 本地一键（推荐，最快）

要求：**Mac + Xcode 15+**

```bash
cd ios
./build-ipa.sh
# 产物：build/天弱.ipa
```

脚本会自动：`public/` → `www/` → `xcodebuild archive`（免签名）→ 打包 `.ipa` → 校验。

### ② Xcode 图形界面

1. 双击 `天弱.xcodeproj`
2. 选真机或 Generic iOS Device 为目标
3. ⌘R 运行 / `Product → Archive`
4. 导出 `.ipa`

### ③ 云端自动（CI，本仓库已配好）

推送到 `main` / `master`，或手动 `Actions → Build 天弱 IPA → Run workflow`，
GitHub Actions 用 macOS runner + Xcode 15.4 自动构建，完成后在 **Artifacts** 下载 `天弱-ipa`。

## 签名说明（重要）

| 产物 | 适用场景 | 有效期 |
|---|---|---|
| **免签名 `.ipa`**（默认，本仓库直接产出） | **AltStore / Sideloadly / 爱思助手** 侧载到越狱或非越狱设备 | 免费 Apple ID 签名 **7 天**需重签 |
| **签名 `.ipa`**（`signed` job） | **App Store / TestFlight / 企业分发** | 长期 |

> 🔑 **上架必须 $99/年 Apple Developer Program**。开启方式：
> 1. 取消 `.github/workflows/build-ipa.yml` 中 `signed` job 的 `if: false`
> 2. 仓库 `Settings → Secrets` 配置 `APPLE_CERT_P12` / `APPLE_CERT_PASSWORD` / `APPLE_PROVISIONING_PROFILE`（均为 base64）
> 3. 在 Xcode `Signing & Capabilities` 选你的 Team

## 服务器地址

首次启动会弹框让你填后端地址（如 `http://your-server:3000`），与原 Android App 一致。
若已把后端部署好，把地址填进 `public/js/config.js` 的 `__TIANRUO_SERVER__` 占位再打包即可固化。

后端启动（本仓库根目录）：

```bash
npm install
node server/index.js   # http://localhost:3000
```

## 验证后端可用（本地冒烟）

```bash
curl http://localhost:3000/api/health
# {"ok":true,"name":"天弱交友服务端","version":"10.0.0",...}

curl -X POST http://localhost:3000/api/auth/send-code -H "Content-Type: application/json" -d '{"phone":"13800138000"}'
curl -X POST http://localhost:3000/api/auth/login   -H "Content-Type: application/json" -d '{"phone":"13800138000","code":"1234"}'
```

## 常见问题

- **`xcodebuild: command not found`** → 必须在 macOS + Xcode 环境，Linux 无法编译 iOS。
- **Archive 成功但 `.ipa` 装不上** → 免签名包只能侧载（AltStore 等），不能直接点安装。
- **WebView 白屏** → 检查服务器地址、确认 `NSAllowsArbitraryLoads` 已开（Info.plist 已配置）。
- **想改 Bundle ID** → 改 `Info.plist` 的 `CFBundleIdentifier`（默认 `com.tianruo.app`）。
