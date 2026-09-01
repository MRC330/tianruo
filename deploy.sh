#!/usr/bin/env bash
# 天弱 一键部署脚本
# 用法: chmod +x deploy.sh && ./deploy.sh
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-3000}"
SERVICE="tianruo"

echo ""
echo "  ⚡ 天弱 交友服务端 · 一键部署"
echo "  目录: $APP_DIR   端口: $PORT"
echo ""

# 1. 检查 node
if ! command -v node >/dev/null 2>&1; then
  echo "  未检测到 Node.js，尝试安装…"
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && yum install -y nodejs
  else
    echo "  请手动安装 Node.js 18+ 后重试"; exit 1
  fi
fi
echo "  Node: $(node -v)  npm: $(npm -v)"

# 2. 安装依赖
cd "$APP_DIR"
[ -d node_modules ] || npm install --omit=dev --no-audit --no-fund

# 3. 生产密钥
if [ -z "$TIANRUO_SECRET" ]; then
  TIANRUO_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
fi

# 4. 选择部署方式
echo ""
echo "  请选择部署方式："
echo "    1) systemd （推荐，开机自启）"
echo "    2) pm2     （进程守护，便于多实例）"
echo "    3) docker  （容器化）"
echo "    4) 仅前台启动（测试用）"
read -rp "  输入 1/2/3/4 [默认 1]: " MODE
MODE="${MODE:-1}"

case "$MODE" in
  1)
    cat > /etc/systemd/system/${SERVICE}.service <<EOF
[Unit]
Description=天弱 Social Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=PORT=${PORT}
Environment=HOST=0.0.0.0
Environment=TIANRUO_SECRET=${TIANRUO_SECRET}
Environment=SPARK_DEMO_SMS=${SPARK_DEMO_SMS:-true}
ExecStart=$(command -v node) ${APP_DIR}/server/index.js
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable ${SERVICE} >/dev/null 2>&1
    systemctl restart ${SERVICE}
    sleep 2
    systemctl status ${SERVICE} --no-pager | head -8
    echo "  ✅ 已部署为 systemd 服务"
    echo "     启动: systemctl start ${SERVICE}"
    echo "     停止: systemctl stop ${SERVICE}"
    echo "     日志: journalctl -u ${SERVICE} -f"
    ;;
  2)
    command -v pm2 >/dev/null 2>&1 || npm i -g pm2
    PORT=${PORT} HOST=0.0.0.0 TIANRUO_SECRET=${TIANRUO_SECRET} pm2 start ${APP_DIR}/server/index.js --name ${SERVICE} --update-env
    pm2 save
    pm2 startup | tail -2 || true
    echo "  ✅ 已用 pm2 启动"
    echo "     日志: pm2 logs ${SERVICE}"
    ;;
  3)
    command -v docker >/dev/null 2>&1 || { echo "  请先安装 Docker"; exit 1; }
    docker build -t ${SERVICE} "${APP_DIR}"
    docker rm -f ${SERVICE} >/dev/null 2>&1 || true
    docker run -d --name ${SERVICE} -p ${PORT}:3000 \
      -e TIANRUO_SECRET="${TIANRUO_SECRET}" \
      -v "${APP_DIR}/data:/app/data" \
      --restart unless-stopped ${SERVICE}
    sleep 2
    docker logs ${SERVICE} --tail 12
    echo "  ✅ 已用 Docker 启动: docker logs -f ${SERVICE}"
    ;;
  4)
    echo "  前台启动中（Ctrl+C 停止）…"
    PORT=${PORT} HOST=0.0.0.0 TIANRUO_SECRET="${TIANRUO_SECRET}" node "${APP_DIR}/server/index.js"
    exit 0
    ;;
  *) echo "  无效选择"; exit 1 ;;
esac

# 5. 输出访问信息
IP="$(curl -s -m 3 ifconfig.me || curl -s -m 3 ip.sb || echo '服务器IP')"
echo ""
echo "  ─────────────────────────────"
echo "  🌐 本机访问:    http://127.0.0.1:${PORT}"
echo "  🌍 公网访问:    http://${IP}:${PORT}   （需放行防火墙 ${PORT} 端口）"
echo "  📱 在 App 里填: http://${IP}:${PORT}"
echo "  🔑 管理密钥:    ${TIANRUO_SECRET:0:12}…（已写入服务配置）"
echo "  ─────────────────────────────"
echo ""
