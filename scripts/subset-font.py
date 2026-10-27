"""Subset Ma Shan Zheng to the CJK glyphs used in src/.

Usage: python scripts/subset-font.py path/to/MaShanZheng-Regular.ttf
(needs: pip install fonttools brotli; font from github.com/google/fonts, OFL)
"""
import pathlib, re, sys
from fontTools import subset

root = pathlib.Path(__file__).resolve().parent.parent
chars = set()
for f in (root / "src").rglob("*"):
    if f.suffix in {".ts", ".svelte"}:
        chars |= set(re.findall(r"[\u3400-\u9fff]", f.read_text(encoding="utf8")))
text = "".join(sorted(chars))
print(f"{len(text)} glyphs: {text}")
out = root / "public" / "fonts" / "mashanzheng-subset.woff2"
subset.main([sys.argv[1], f"--text={text}", "--flavor=woff2", f"--output-file={out}", "--layout-features=*"])
print(out, out.stat().st_size, "bytes")
