#!/bin/bash
cd "$(dirname "$0")"

# 先把所有 iOS 工程文件整理好（确保 ios/ 目录完整，build_ipa.py 在根目录）
echo "=== 当前目录结构（要上传的部分）==="
ls -la ios/天弱/ 2>/dev/null
echo "--- workflow ---"
ls -la .github/workflows/ 2>/dev/null
echo "--- 根目录脚本 ---"
ls -la build_ipa.py build-ipa.sh build_ipa.py 2>/dev/null

echo ""
echo "=== 生成离线 www/ (若没有 build-web.sh 则用 public/ 内容) ==="
# 确保 build_ipa.py 能找到 public/
[ -d public ] && echo "public/ 存在，build_ipa.py 会用它" || echo "WARNING: public/ 不存在"
