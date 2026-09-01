#!/usr/bin/env bash
# ============================================================
#  天弱 · 部署包生成器（阿里云/任意云服务器）
#
#  在本机运行：  bash deploy-aliyun.sh
#  产出：       /data/workspace/tianruo-aliyun.tar.gz
#
#  上传到服务器后只需两条命令：
#      tar -xzf tianruo-aliyun.tar.gz && cd tianruo && bash aliyun.sh
# ============================================================
set -eo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
OUT="/data/workspace/tianruo-aliyun.tar.gz"
NAME="tianruo"

G='\033[32m'; C='\033[36m'; N='\033[0m'
say(){ printf "${C}▶ %s${N}\n" "$1"; }
ok(){ printf "${G}✔ %s${N}\n" "$1"; }

say "准备部署包"
STAGE=/tmp/tianruo-stage
rm -rf "$STAGE"; mkdir -p "$STAGE/$NAME"

# 只打包运行必需内容
cp -r "$SRC/server" "$STAGE/$NAME/"
cp -r "$SRC/public" "$STAGE/$NAME/"
cp "$SRC/package.json" "$STAGE/$NAME/"
cp "$SRC/aliyun.sh"    "$STAGE/$NAME/"

# 空数据目录（服务端会自动初始化种子数据）
mkdir -p "$STAGE/$NAME/data/uploads"

# 部署说明
cat > "$STAGE/$NAME/部署说明.txt" <<'EOF'
========================================
 天弱 · 服务端部署说明
========================================

【两条命令完成部署】

  tar -xzf tianruo-aliyun.tar.gz
  cd tianruo && bash aliyun.sh

脚本会自动：装 Node.js → 装依赖 → 生成密钥 → 后台启动
          → 配开机自启 → 放行防火墙 → 打印你要填的地址

========================================
 重要：阿里云安全组必须手动放行
========================================

脚本管不了安全组（那是阿里云控制台层面的），必须手动加一次：

  1. 打开 https://ecs.console.aliyun.com/
  2. 找到你的实例 → 点实例名进入详情
  3. 点「安全组」标签页 → 点安全组名称
  4. 点「配置规则」→ 「入方向」→ 「手动添加」
  5. 填写：
       协议类型：TCP
       端口范围：3000/3000
       授权对象：0.0.0.0/0
       优先级：  1（默认即可）
  6. 保存

没做这步 → 手机连不上，这是最常见的原因。

========================================
 部署完成后
========================================

脚本会打印类似这样的地址，填进 App 引导页：

  http://123.45.67.89:3000

测试：手机浏览器打开这个地址，能看到 天弱 界面就说明通了。

========================================
 常用命令
========================================

  查看状态   systemctl status tianruo
  查看日志   journalctl -u tianruo -f
  重启服务   systemctl restart tianruo
  停止服务   systemctl stop tianruo
  重新部署   bash aliyun.sh

  本地自检   curl http://127.0.0.1:3000/api/health
             （返回 JSON 且 ok:true 即为正常）

========================================
 管理后台
========================================

  地址：http://你的IP:3000/admin.html
  密钥：部署时随机生成，在 tianruo/.env 文件里
        查看：cat tianruo/.env

========================================
 后续建议
========================================

  1. 绑定域名 + 配置 HTTPS（Nginx + 免费证书）
     安卓对明文 HTTP 有诸多限制，正式用建议上 HTTPS
  2. 修改 .env 里的 TIANRUO_ADMIN_TOKEN
  3. 备份 tianruo/data 目录（所有用户数据都在这里）
EOF

say "压缩"
tar -czf "$OUT" -C "$STAGE" "$NAME"
rm -rf "$STAGE"

SIZE=$(du -h "$OUT" | cut -f1)
ok "已生成: $OUT ($SIZE)"

echo ""
echo "  上传到服务器（在本机执行，换成你的IP）："
echo "    scp $OUT root@你的IP:/root/"
echo ""
echo "  然后在服务器上执行："
echo "    ssh root@你的IP"
echo "    tar -xzf tianruo-aliyun.tar.gz && cd tianruo && bash aliyun.sh"
echo ""
