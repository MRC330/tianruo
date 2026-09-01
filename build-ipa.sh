#!/bin/bash
# 天弱 iOS 一键打包（本地 Mac / CI 通用）
# 产物：天弱.ipa（Payload/天弱.app/ + 真实 Mach-O + 离线 www）
set -e
cd "$(dirname "$0")"

echo "== 1/3 校验工程 =="
[ -d "ios/天弱.xcodeproj" ] || { echo "❌ 缺少 ios/天弱.xcodeproj"; exit 1; }

echo "== 2/3 打包 IPA =="
rm -rf Payload 天弱.ipa
python3 build_ipa.py

echo "== 3/3 验证 =="
python3 ios/verify_ipa.py "天弱.ipa" || true

echo ""
echo "✅ 完成：$(pwd)/天弱.ipa"
echo "   推送到 GitHub 后，Actions 会在 macOS 上用 xcodebuild 产出真正可运行的 IPA"
