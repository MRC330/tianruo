#!/usr/bin/env bash
# ============================================================
#  生成文件下载直链（用你自己的服务器当临时文件服务）
#
#  前提：已把 Spark交付资料.zip 上传到服务器（比如 /root/ 下）
#
#  用法：
#      bash file-link.sh                      # 默认 8000 端口，服务 /root 目录
#      bash file-link.sh 8888                 # 指定端口
#
#  会输出一个形如 http://120.26.34.215:8000/Spark交付资料.zip 的直链
# ============================================================
set -eo pipefail

PORT="${1:-8000}"
DIR="${2:-/root}"
G=$'\033[32m'; Y=$'\033[33m'; C=$'\033[36m'; R=$'\033[31m'; N=$'\033[0m'

echo ""
echo "  🔗 生成文件下载直链"
echo ""

# ---------- 1. 找文件 ----------
FILE=""
for f in "$DIR/Spark交付资料.zip" "$DIR/spark-deploy.zip" "$PWD/Spark交付资料.zip" "$PWD"/*.zip; do
  if [[ -f "$f" ]]; then FILE="$f"; break; fi
done

if [[ -z "$FILE" ]]; then
  printf "${Y}⚠ 在 $DIR 和当前目录都没找到 zip 文件${N}\n"
  echo ""
  echo "  当前目录的 zip 文件："
  ls -lh "$PWD"/*.zip 2>/dev/null || echo "    （无）"
  echo ""
  echo "  请指定目录：bash file-link.sh $PORT /文件所在目录"
  exit 1
fi

FDIR=$(dirname "$FILE")
FNAME=$(basename "$FILE")
FSIZE=$(du -h "$FILE" | cut -f1)
printf "  ${G}✔ 找到文件：${N}$FILE ($FSIZE)\n"

# 中文文件名在链接里需 URL 编码，否则浏览器/下载工具可能 404。
# 为保险，额外生成一个纯英文名的副本，两个链接都能用。
SAFE_NAME="Spark-Handover-Package.zip"
if [[ "$FNAME" == *[!a-zA-Z0-9._-]* ]]; then
  cp -f "$FILE" "$FDIR/$SAFE_NAME" 2>/dev/null && \
    printf "  ${G}✔ 已生成英文副本：${N}$SAFE_NAME（推荐用这个链接，兼容性更好）\n"
fi

# ---------- 2. 停掉旧服务 ----------
pkill -f "http.server.*$PORT" 2>/dev/null || true
sleep 1

# ---------- 3. 启动 HTTP 服务 ----------
cd "$FDIR"
nohup python3 -m http.server "$PORT" --bind 0.0.0.0 > /tmp/filelink.log 2>&1 &
SRV_PID=$!
sleep 2

if ! kill -0 "$SRV_PID" 2>/dev/null; then
  printf "${R}✘ 服务启动失败${N}\n"; cat /tmp/filelink.log; exit 1
fi
printf "  ${G}✔ 文件服务已启动${N}（PID $SRV_PID）\n"

# ---------- 4. 本机防火墙 ----------
if command -v ufw >/dev/null 2>&1; then
  ufw allow "$PORT"/tcp >/dev/null 2>&1 && echo "  ✔ ufw 已放行 $PORT"
elif command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$PORT"/tcp >/dev/null 2>&1
  firewall-cmd --reload >/dev/null 2>&1
  echo "  ✔ firewalld 已放行 $PORT"
fi

# ---------- 5. 公网 IP ----------
# 加 --connect-timeout 防止 DNS 卡死；阿里云内网元数据服务优先（最快最准）
IP=$(timeout 6 curl -s --connect-timeout 3 -m 5 \
     http://100.100.100.200/latest/meta-data/public-ipv4 2>/dev/null | tr -d ' \n' || true)
[[ -z "$IP" ]] && IP=$(timeout 6 curl -s --connect-timeout 3 -m 5 ifconfig.me 2>/dev/null | tr -d ' \n' || true)
[[ -z "$IP" ]] && IP=$(timeout 6 curl -s --connect-timeout 3 -m 5 icanhazip.com 2>/dev/null | tr -d ' \n' || true)
[[ -z "$IP" ]] && IP="你的公网IP"

# ---------- 6. 输出 ----------
echo ""
echo "════════════════════════════════════════"
echo "  🔗 下载直链（复制发给对方）"
echo "════════════════════════════════════════"
echo ""
if [[ -f "$FDIR/$SAFE_NAME" ]]; then
  echo "  推荐（英文文件名）："
  echo "  http://$IP:$PORT/$SAFE_NAME"
  echo ""
  echo "  备选（中文文件名）："
fi
echo "  http://$IP:$PORT/$FNAME"
echo ""
echo "════════════════════════════════════════"
echo ""
printf "  ${Y}⚠ 如果链接打不开，去阿里云控制台放行端口：${N}\n"
echo ""
echo "     ECS 控制台 → 安全组 → 配置规则 → 入方向"
echo "     协议 TCP，端口 $PORT/$PORT，授权对象 0.0.0.0/0"
echo ""
echo "────────────────────────────────────────"
echo "  停止服务（用完建议关掉，避免文件被随意下载）："
echo "     pkill -f 'http.server.*$PORT'"
echo ""
echo "  查看当前分享目录的所有文件："
echo "     浏览器打开 http://$IP:$PORT/"
echo ""
