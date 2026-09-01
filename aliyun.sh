#!/usr/bin/env bash
# ============================================================
#  天弱 · 阿里云一键部署（全自动，无需交互）
#
#  用法:  bash aliyun.sh
#
#  会自动完成：装 Node → 装依赖 → 配防火墙 → 后台启动 → 开机自启
#  最后打印出「App 引导页要填的地址」
# ============================================================
set -eo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-3000}"
SERVICE="tianruo"
G='\033[32m'; Y='\033[33m'; C='\033[36m'; R='\033[31m'; N='\033[0m'

say(){ printf "${C}▶ %s${N}\n" "$1"; }
ok(){ printf "${G}✔ %s${N}\n" "$1"; }
warn() { printf "${Y}⚠ %s${N}\n" "$1"; }

echo ""
echo "  ⚡ 天弱 · 阿里云一键部署"
echo "  目录: $APP_DIR"
echo "  端口: $PORT"
echo ""

# ---------- 1. Node.js ----------
say "检查 Node.js"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  echo "  安装 Node.js 20…"
  if command -v apt-get >/dev/null 2>&1; then
    # Ubuntu/Debian：优先阿里云镜像
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1 \
        || curl -fsSL https://mirrors.aliyun.com/nodesource/deb/setup_20.x | bash - >/dev/null 2>&1 || true
    fi
    apt-get install -y nodejs >/dev/null 2>&1 || true
  fi
  if ! command -v node >/dev/null 2>&1; then
    if command -v yum >/dev/null 2>&1 || command -v dnf >/dev/null 2>&1; then
      PM=$(command -v dnf || command -v yum)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - >/dev/null 2>&1 || true
      $PM install -y nodejs >/dev/null 2>&1 || true
    fi
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "  走二进制免安装方式…"
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64) NA="linux-x64";;
    aarch64) NA="linux-arm64";;
    *) NA="linux-x64";;
  esac
  V=v20.18.1
  curl -fsSL -o /tmp/node.tar.xz "https://mirrors.aliyun.com/nodejs-release/$V/node-$V-$NA.tar.xz" \
    || curl -fsSL -o /tmp/node.tar.xz "https://nodejs.org/dist/$V/node-$V-$NA.tar.xz"
  mkdir -p /usr/local/node
  tar -xJf /tmp/node.tar.xz -C /usr/local/node --strip-components=1
  ln -sf /usr/local/node/bin/node /usr/local/bin/node
  ln -sf /usr/local/node/bin/npm  /usr/local/bin/npm
  rm -f /tmp/node.tar.xz
fi

command -v node >/dev/null 2>&1 || { printf "${R}✘ Node.js 安装失败，请手动安装 Node 18+ 后重试${N}\n"; exit 1; }
ok "Node $(node -v) / npm $(npm -v)"

# ---------- 2. 依赖 ----------
say "安装依赖"
cd "$APP_DIR"
if [ ! -d node_modules ]; then
  npm config set registry https://registry.npmmirror.com 2>/dev/null || true
  npm install --omit=dev --no-audit --no-fund 2>&1 | tail -3
fi
ok "依赖就绪"

# ---------- 3. 生成密钥 ----------
say "生成安全密钥"
if ! grep -q "^TIANRUO_SECRET=" "$APP_DIR/.env" 2>/dev/null; then
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  ATOKEN=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
  cat > "$APP_DIR/.env" <<EOF
PORT=$PORT
TIANRUO_SECRET=$SECRET
TIANRUO_ADMIN_TOKEN=$ATOKEN
TIANRUO_SMS_PROVIDER=console
EOF
  echo "  .env 已生成"
else
  echo "  .env 已存在，保留"
fi
chmod 600 "$APP_DIR/.env"
ok "密钥就绪"

# ---------- 4. 启动服务 ----------
say "启动服务"
# 先停掉旧进程
pkill -f "node.*server/index.js" 2>/dev/null || true
sleep 1

STARTUP="none"
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  cat > /etc/systemd/system/$SERVICE.service <<EOF
[Unit]
Description=天弱 Dating App Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$(command -v node) $APP_DIR/server/index.js
Restart=always
RestartSec=3
StandardOutput=journalctl
StandardError=journalctl

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload >/dev/null 2>&1
  systemctl enable $SERVICE >/dev/null 2>&1
  systemctl restart $SERVICE >/dev/null 2>&1
  sleep 2
  if systemctl is-active --quiet $SERVICE; then
    STARTUP="systemd"
    ok "systemd 服务已启动（开机自启）"
  fi
fi

if [ "$STARTUP" = "none" ]; then
  # 无 systemd：用 nohup + 开机脚本兜底
  cd "$APP_DIR"
  set -a; . ./.env; set +a
  nohup node server/index.js > "$APP_DIR/tianruo.log" 2>&1 &
  echo $! > "$APP_DIR/tianruo.pid"
  grep -q "server/index.js" /etc/rc.local 2>/dev/null || {
    echo "cd $APP_DIR && set -a && . ./.env && set +a && nohup node server/index.js > tianruo.log 2>&1 &" >> /etc/rc.local
    chmod +x /etc/rc.local 2>/dev/null || true
  }
  sleep 2
  STARTUP="nohup"
  ok "已后台启动（进程 $(cat "$APP_DIR/tianruo.pid")）"
fi

# ---------- 5. 防火墙 ----------
say "放行端口 $PORT"
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
  firewall-cmd --permanent --add-port=${PORT}/tcp >/dev/null 2>&1
  firewall-cmd --reload >/dev/null 2>&1
  ok "firewalld 已放行"
elif command -v ufw >/dev/null 2>&1; then
  ufw allow ${PORT}/tcp >/dev/null 2>&1
  ok "ufw 已放行"
elif command -v iptables >/dev/null 2>&1; then
  iptables -I INPUT -p tcp --dport $PORT -j ACCEPT 2>/dev/null || true
  ok "iptables 已放行"
else
  warn "未找到防火墙工具，请确认端口 $PORT 可访问"
fi

# ---------- 6. 健康检查 ----------
say "健康检查"
sleep 2
LOCAL_OK=""
for i in 1 2 3 4 5; do
  if curl -s -m 3 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    LOCAL_OK="yes"; break
  fi
  sleep 2
done

if [ -z "$LOCAL_OK" ]; then
  printf "${R}✘ 服务未响应，查看日志:${N}\n"
  if [ "$STARTUP" = "systemd" ]; then journalctl -u $SERVICE -n 20 --no-pager
  else tail -20 "$APP_DIR/tianruo.log" 2>/dev/null; fi
  exit 1
fi
ok "服务已响应"

# ---------- 7. 公网 IP ----------
say "探测公网 IP"
PUB_IP=""
for src in "http://100.100.100.200/latest/meta-data/public-ipv4" \
           "https://myip.ipip.net" \
           "https://api.ipify.org" \
           "http://ifconfig.me/ip"; do
  IP=$(curl -s -m 4 "$src" 2>/dev/null | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -1)
  if [ -n "$IP" ]; then PUB_IP="$IP"; break; fi
done

echo ""
echo "════════════════════════════════════════════"
printf "  ${G}✔ 部署完成${N}\n"
echo "════════════════════════════════════════════"
echo ""
if [ -n "$PUB_IP" ]; then
  echo "  ┌────────────────────────────────────────┐"
  echo "  │  App 引导页填这个：                     │"
  printf "  │  ${G}http://%s:%s${N}\n" "$PUB_IP" "$PORT"
  echo "  └────────────────────────────────────────┘"
else
  echo "  未探测到公网 IP，请用你的阿里云公网 IP："
  echo "  http://你的公网IP:$PORT"
fi
echo ""
echo "  ⚠ 若连不上，90% 是阿里云安全组没放行："
echo "     阿里云控制台 → 实例 → 安全组 → 配置规则"
echo "     → 入方向 → 手动添加"
echo "       协议类型: TCP   端口范围: $PORT/$PORT"
echo "       授权对象: 0.0.0.0/0"
echo ""
echo "  本机自检: curl http://127.0.0.1:$PORT/api/health"
echo "  查看日志: $([ "$STARTUP" = "systemd" ] && echo "journalctl -u $SERVICE -f" || echo "tail -f $APP_DIR/tianruo.log")"
echo "  重启服务: $([ "$STARTUP" = "systemd" ] && echo "systemctl restart $SERVICE" || echo "bash $APP_DIR/aliyun.sh")"
echo ""
