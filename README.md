# 天弱 (TianRuo) iOS

将天弱网页端（Node.js + 前端 v10.0.0）包装为 iOS App，通过 GitHub Actions 云端 macOS 编译出 **可安装的 IPA**。

## 架构
- `public/` 网页前端 → 打包进 App 的 `www/`（离线可用）
- `ios/天弱.xcodeproj` Swift + WKWebView 原生壳
- `.github/workflows/build-ipa.yml` 云端 CI：push 后自动 `xcodebuild archive` 出 IPA

## 一键本地打包（需 Mac + Xcode）
```bash
chmod +x build-ipa.sh
./build-ipa.sh
# 产出 天弱.ipa
```

## 云端构建（推荐，免配置出真包）
```bash
git remote add origin https://github.com/MRC330/tianruo.git
git add .
git commit -m "ci: add iOS workflow"
git push origin main
```
之后打开 **Actions → Build 天弱 IPA → Run workflow**，跑完下载 Artifact `天弱-ipa` 即为**真正可安装的 IPA**（含真实 arm64 Mach-O）。

## 安装到手机（免签名侧载，免费 Apple ID 即可）
下载 `天弱.ipa` 后用以下工具之一安装（每 7 天用同一 Apple ID 重签即可）：
- **AltStore** / **Sideloadly**（Windows / macOS）
- **爱思助手**（Windows）

> ⚠️ 若要长期免重签 / 上架 App Store，需加入 [Apple Developer Program](https://developer.apple.com/programs/)（$99/年），并在 Xcode `Signing & Capabilities` 选择 Team。

## 联调
- 前端默认走 `config.js` 自动识别 UA（`TianRuoiOS`），离线资源优先
- 后端接口：`/api/*`（如 `https://你的服务器/api/health`），改 `ViewController.swift` 里的 `baseURL`
