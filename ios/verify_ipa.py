#!/usr/bin/env python3
"""校验 天弱.ipa 结构合规性（被导入工具接受的最低要求）"""
import sys, zipfile, os

def check(ipa):
    assert os.path.exists(ipa), f"文件不存在: {ipa}"
    with zipfile.ZipFile(ipa) as z:
        names = z.namelist()
        errors = []
        must = ["Payload/", ".app/Info.plist", "/天弱", "www/index.html"]
        for m in must:
            if not any(m in n for n in names):
                errors.append(f"缺少: {m}")
        # Info.plist 基本字段
        plist = [n for n in names if n.endswith(".app/Info.plist")][0]
        data = z.read(plist).decode("utf-8", "ignore")
        for key in ["CFBundleIdentifier", "CFBundleExecutable", "CFBundleVersion"]:
            if key not in data:
                errors.append(f"Info.plist 缺 {key}")
        print(f"条目数: {len(names)}")
        for n in sorted(names):
            print("  ", n)
        if errors:
            print("\n❌ 校验失败:")
            for e in errors:
                print("  -", e)
            sys.exit(1)
        print("\n✅ IPA 结构合规：可被 AltStore / Sideloadly / 爱思助手 导入")

if __name__ == "__main__":
    check(sys.argv[1] if len(sys.argv) > 1 else "天弱.ipa")
