#!/usr/bin/env bash
# ============================================================
#  天弱 · 域名 + 网页版一键部署
#
#  在服务器上执行（把脚本放在 tianruo 项目目录里）：
#     bash setup-web.sh aha666.cn
#
#  自动完成：
#    - 启动 天弱 服务（3000 端口，仅本机监听）
#    - 安装 Nginx，配置 80 端口反代到 3000
#    - 域名解析检测 + HTTP 访问验证
#    - 可选：Let's Encrypt 免费 HTTPS 证书
#
#  完成后手机浏览器直接访问 http://aha666.cn 即可使用
# ============================================================
set -eo pipefail

DOMAIN="${1:-}"
APP_DIR="${APP_DIR:-/opt/tianruo}"
PORT=3000
SERVICE=tianruo

G=$'\033[32m'; Y=$'\033[33m'; C=$'\033[36m'; R=$'\033[31m'; N=$'\033[0m'
say()  { printf "${C}▶ %s${N}\n" "$1"; }
ok()   { printf "${G}✔ %s${N}\n" "$1"; }
warn() { printf "${Y}⚠ %s${N}\n" "$1"; }
die()  { printf "${R}✘ %s${N}\n" "$1"; exit 1; }

echo ""
echo "  ⚡ 天弱 · 网页版部署"
echo "  域名: ${DOMAIN:-（未指定，将只用 IP 访问）}"
echo ""

[[ $EUID -eq 0 ]] || die "请用 root 执行：sudo bash setup-web.sh $DOMAIN"

# ---------- 1. 定位源码 ----------
say "定位源码"
SRC=""
for d in "$(pwd)" "$(pwd)/tianruo" "$HOME/tianruo" "/root/tianruo"; do
  if [[ -f "$d/server/index.js" && -d "$d/public" ]]; then SRC="$d"; break; fi
done
[[ -n "$SRC" ]] || die "找不到 天弱 源码（需含 server/index.js 与 public/）。请先 cd 到解压后的 tianruo 目录。"
ok "源码：$SRC"

# ---------- 2. 部署到 /opt/tianruo ----------
say "部署到 $APP_DIR"
if [[ -d "$APP_DIR/data" ]]; then
  rm -rf /tmp/tianruo-data-bak
  cp -r "$APP_DIR/data" /tmp/tianruo-data-bak
  echo "   已备份现有数据"
fi
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
cp -r "$SRC"/. "$APP_DIR"/
rm -rf "$APP_DIR/node_modules"
if [[ -d /tmp/tianruo-data-bak ]]; then
  rm -rf "$APP_DIR/data"
  mv /tmp/tianruo-data-bak "$APP_DIR/data"
  echo "   已恢复数据"
fi
mkdir -p "$APP_DIR/data/uploads"
cd "$APP_DIR"

# ---------- 3. 依赖 ----------
say "安装依赖"
npm install --omit=dev --no-audit --no-fund 2>&1 | tail -2
ok "依赖就绪"

# ---------- 4. 生产配置 ----------
say "写入配置"
if [[ ! -f "$APP_DIR/.env" ]]; then
  SECRET="tianruo-$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)"
  ATOKEN="adm-$(head -c 12 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 16)"
  cat > "$APP_DIR/.env" <<EOF
PORT=$PORT
NODE_ENV=production
TIANRUO_SECRET=$SECRET
TIANRUO_ADMIN_TOKEN=$ATOKEN
EOF
  echo "   已生成随机密钥"
fi
chmod 600 "$APP_DIR/.env"
ATOKEN=$(grep TIANRUO_ADMIN_TOKEN "$APP_DIR/.env" | cut -d= -f2)
ok "配置就绪"

# ---------- 5. systemd 服务 ----------
say "启动服务（开机自启）"
cat > /etc/systemd/system/$SERVICE.service <<EOF
[Unit]
Description=天弱交友服务端
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$(command -v node) $APP_DIR/server/index.js
Restart=always
RestartSec=5
StandardOutput=append:/var/log/tianruo.log
StandardError=append:/var/log/tianruo.log

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable $SERVICE >/dev/null 2>&1
systemctl restart $SERVICE
sleep 3

if systemctl is-active --quiet $SERVICE; then
  ok "服务运行中"
else
  warn "服务未启动，日志：tail -50 /var/log/tianruo.log"
fi

# 本地自检
if curl -s -m 5 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  ok "本地自检通过"
else
  warn "本地 3000 端口无响应，请查日志后重试"
fi

# ---------- 6. Nginx ----------
if [[ -n "$DOMAIN" ]]; then
  say "安装配置 Nginx"
  if ! command -v nginx >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq >/dev/null 2>&1 || true
      DEBIAN_FRONTEND=noninteractive apt-get install -y nginx >/dev/null 2>&1
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y nginx >/dev/null 2>&1
    elif command -v yum >/dev/null 2>&1; then
      yum install -y nginx >/dev/null 2>&1
    fi
  fi
  command -v nginx >/dev/null 2>&1 || { warn "Nginx 安装失败，可用 IP:3000 直接访问"; exit 0; }
  ok "Nginx $(nginx -v 2>&1 | cut -d/ -f2)"

  CONF="/etc/nginx/sites-available/tianruo"
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  cat > "$CONF" <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF
  ln -sf "$CONF" /etc/nginx/sites-enabled/tianruo
  rm -f /etc/nginx/sites-enabled/default
  nginx -t >/dev/null 2>&1 || { warn "Nginx 配置有误：nginx -t"; exit 1; }
  systemctl enable nginx >/dev/null 2>&1
  systemctl restart nginx
  sleep 2
  ok "Nginx 反代已配置（80 → 3000）"

  # ---------- 7. 域名解析检测 ----------
  say "检测域名解析"
  PUB_IP=$(curl -s -m 5 ifconfig.me 2>/dev/null || curl -s -m 5 icanhazip.com 2>/dev/null || echo "")
  DOM_IP=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1)
  [[ -z "$DOM_IP" ]] && DOM_IP=$(nslookup "$DOMAIN" 2>/dev/null | awk '/^Address: /{print $2}' | tail -1)

  if [[ -z "$DOM_IP" ]]; then
    warn "域名 $DOMAIN 暂未解析到 IP"
    echo "     请在域名服务商处添加 A 记录："
    echo "       主机记录  @      记录值  ${PUB_IP:-你的公网IP}"
    echo "       主机记录  www    记录值  ${PUB_IP:-你的公网IP}"
    echo "     解析生效后（通常 1-10 分钟）重新运行本脚本即可"
  elif [[ -n "$PUB_IP" && "$DOM_IP" != "$PUB_IP" ]]; then
    warn "域名解析到 $DOM_IP，但本机公网 IP 是 $PUB_IP（不一致）"
  else
    ok "域名已解析：$DOMAIN → $DOM_IP"
  fi

  # ---------- 8. HTTPS（可选）----------
  echo ""
  printf "  ${C}是否申请免费 HTTPS 证书？(y/n)${N} "
  read -r -t 30 ANS || ANS="n"
  if [[ "$ANS" =~ ^[Yy]$ ]]; then
    say "申请 Let's Encrypt 证书"
    if ! command -v certbot >/dev/null 2>&1; then
      if command -v apt-get >/dev/null 2>&1; then
        DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1
      elif command -v dnf >/dev/null 2>&1; then
        dnf install -y certbot python3-certbot-nginx >/dev/null 2>&1
      elif command -v yum >/dev/null 2>&1; then
        yum install -y certbot python3-certbot-nginx >/dev/null 2>&1
      fi
    fi
    if command -v certbot >/dev/null 2>&1; then
      certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos \
        --register-unsafely-without-email --redirect 2>&1 | tail -5
      if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
        ok "HTTPS 已启用"
      else
        warn "证书申请失败（域名未生效或 80 端口不通），可稍后重试："
        echo "     certbot --nginx -d $DOMAIN -d www.$DOMAIN"
      fi
    else
      warn "certbot 安装失败，跳过 HTTPS（HTTP 可正常使用）"
    fi
  else
    echo "   跳过 HTTPS，当前用 HTTP 访问"
  fi
fi

# ---------- 9. 输出 ----------
echo ""
echo "════════════════════════════════════════"
printf "  ${G}✔ 部署完成${N}\n"
echo "════════════════════════════════════════"
echo ""
if [[ -n "$DOMAIN" ]]; then
  echo "  手机浏览器打开："
  echo ""
  echo "     http://$DOMAIN"
  echo ""
  echo "  添加到桌面即可当 App 用（Chrome：菜单 → 添加到主屏幕）"
else
  PUB_IP=$(curl -s -m 5 ifconfig.me 2>/dev/null || echo "你的公网IP")
  echo "  浏览器打开：http://$PUB_IP:3000"
  echo "  （需先在阿里云安全组放行 3000 端口）"
fi
echo ""
echo "────────────────────────────────────────"
echo "  管理后台   http://${DOMAIN:-你的IP:3000}/admin.html"
echo "  后台密钥   $ATOKEN"
echo ""
echo "  常用命令"
echo "    查看状态   systemctl status tianruo"
echo "    重启服务   systemctl restart tianruo"
echo "    查看日志   tail -f /var/log/tianruo.log"
echo "    重启 Nginx systemctl restart nginx"
echo ""
echo "  数据安全：所有用户数据在 $APP_DIR/data，定期备份"
echo ""
