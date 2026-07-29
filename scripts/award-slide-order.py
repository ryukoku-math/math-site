#!/usr/bin/env python3
"""One-off migration helper: recover true slide order for each 優秀プレゼンテーション賞
entry from the ORIGINAL export zip's namelist() (= Notion API child-block order),
since post-extraction directory listing order is scrambled by the filesystem.

Run: python3 scripts/award-slide-order.py > /tmp/.../award-slide-order.json
"""
import json
import sys
import zipfile

ZIP_PATH = (
    "/tmp/claude-1004/-home-sano-blume-math/8498e8ec-7cc0-4128-be66-8ce8d315b67c/"
    "scratchpad/notion-export/ExportBlock-c490dcf4-da7d-401a-8492-6b327c996387-Part-1.zip"
)
PREFIX = "プライベート、シェア/数理・情報科学課程/優秀プレゼンテーション賞/"

def main():
    z = zipfile.ZipFile(ZIP_PATH)
    names = z.namelist()

    # entries[top_entry_folder] = [image relpaths in original order]
    entries = {}
    for name in names:
        if not name.startswith(PREFIX):
            continue
        if not name.lower().endswith((".png", ".jpg", ".jpeg")):
            continue
        rest = name[len(PREFIX):]  # "<entry>/<entry>/<subpage>/Untitled.png"
        parts = rest.split("/")
        if len(parts) < 2:
            continue
        top_entry = parts[0]
        entries.setdefault(top_entry, []).append(rest)

    json.dump(entries, sys.stdout, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
