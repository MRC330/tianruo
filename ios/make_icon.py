#!/usr/bin/env python3
"""为 .app 生成最小合规的 AppIcon（无图标会导致安装警告）。
若系统无 PIL 则跳过（不影响 .ipa 生成）。"""
import sys, os
app = sys.argv[1] if len(sys.argv) > 1 else "."
iconset = os.path.join(app, "AppIcon.appiconset")
os.makedirs(iconset, exist_ok=True)

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception:
    sys.exit(0)  # 无 PIL 直接跳过

img = Image.new("RGB", (1024, 1024), (26, 18, 40))
d = ImageDraw.Draw(img)
try:
    f = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", 460)
except Exception:
    f = ImageFont.load_default()
d.text((512, 470), "天弱", font=f, fill=(255, 255, 255), anchor="mm")
img.save(os.path.join(iconset, "Icon-1024.png"))

with open(os.path.join(iconset, "Contents.json"), "w") as fp:
    fp.write('{"images":[{"idiom":"universal","platform":"ios","size":"1024x1024","filename":"Icon-1024.png"}],"info":{"version":1,"author":"xcode"}}')

# 同时放一份到根目录供老 Xcode 读取
img.save(os.path.join(app, "AppIcon.png"))
print("[OK] AppIcon generated")
