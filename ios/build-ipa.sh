#!/bin/bash
# 天弱 · 本地一键出 IPA（Mac + Xcode 环境运行）
#  用法:  cd ios && ./build-ipa.sh
#  产物:  天弱.ipa（默认免签名，可用于 AltStore / Sideloadly / 爱思 侧载）
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

PROJECT="$SCRIPT_DIR/天弱.xcodeproj"
SCHEME="天弱"
CONFIGURATION="Release"
BUILD_DIR="$SCRIPT_DIR/build"
ARCHIVE_PATH="$BUILD_DIR/天弱.xcarchive"
APP_NAME="天弱"

echo "=========================================="
echo "  天弱 iOS 打包  v10.0.0"
echo "=========================================="

# 0) 前置检查
if ! command -v xcodebuild >/dev/null 2>&1; then
    echo "[FATAL] 需要 macOS + Xcode。当前环境无法运行 xcodebuild。" >&2
    echo "        请在 Mac 上执行，或使用 .github/workflows/build-ipa.yml（GitHub Actions 云端 macOS）。" >&2
    exit 127
fi

# 1) 准备离线 www（把 public/ 拷进 App 资源目录，供无服务器时单机使用）
echo "[1/5] 准备离线资源 www/ ..."
mkdir -p "$SCRIPT_DIR/天弱/www"
cp -R public/. "$SCRIPT_DIR/天弱/www/"
# 注入默认服务器占位（首次启动弹框让用户填，与原 Android 行为一致）
if [ -f "$SCRIPT_DIR/天弱/www/js/config.js" ]; then
    : # config.js 已处理 __TIANRUO_SERVER__ 占位
fi
echo "      www/ 文件数: $(find "$SCRIPT_DIR/天弱/www" -type f | wc -l)"

# 2) 清理
echo "[2/5] 清理旧构建..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# 3) Archive（免签名）
echo "[3/5] xcodebuild archive（CODE_SIGNING_ALLOWED=NO）..."
xcodebuild archive \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -configuration "$CONFIGURATION" \
    -archivePath "$ARCHIVE_PATH" \
    -sdk iphoneos \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGN_IDENTITY="" \
    | tee "$BUILD_DIR/build.log" | grep -E "^\*\*( |Compile|Archive|error:|warning:)" || true

if [ ! -d "$ARCHIVE_PATH/Products/Applications/$APP_NAME.app" ]; then
    echo "[FATAL] Archive 未产出 .app，查看 $BUILD_DIR/build.log" >&2
    exit 1
fi
echo "      ✅ .app 已生成"

# 4) 打包 IPA
echo "[4/5] 打包 IPA..."
APP_PATH="$ARCHIVE_PATH/Products/Applications/$APP_NAME.app"
mkdir -p "$BUILD_DIR/Payload"
cp -R "$APP_PATH" "$BUILD_DIR/Payload/$APP_NAME.app"
# 若 Info.plist 里没声明 AppIcon，补一个最小 icon 避免安装警告（不影响功能）
python3 "$SCRIPT_DIR/make_icon.py" "$BUILD_DIR/Payload/$APP_NAME.app" 2>/dev/null || true
( cd "$BUILD_DIR" && zip -r -q "$APP_NAME.ipa" Payload )
IPA="$BUILD_DIR/$APP_NAME.ipa"

# 5) 校验
echo "[5/5] 校验 IPA..."
ls -lh "$IPA"
python3 "$SCRIPT_DIR/verify_ipa.py" "$IPA"

echo ""
echo "=========================================="
echo "  ✅ 打包完成: $IPA"
echo "=========================================="
echo "  安装方式（免签名，7天需重签）:"
echo "    • AltStore / Sideloadly / 爱思助手 侧载"
echo "    • 上架 App Store / TestFlight 需 \$99/年开发者账号，"
echo "      在 Xcode Signing & Capabilities 选 Team 后重跑即可自动签名"
echo "=========================================="
