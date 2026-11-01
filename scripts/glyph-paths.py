"""Trace the disc piece set's brush glyphs from Ma Shan Zheng into SVG path data.

Usage: python scripts/glyph-paths.py path/to/MaShanZheng-Regular.ttf
(needs: pip install fonttools; font from github.com/google/fonts, OFL)

Writes src/lib/glyphs.ts. Each glyph is centred in a 1000-unit box with y pointing down,
so the pieces need no web font and look the same on every device.
"""
import pathlib, sys
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

CHARS = "王后车象马兵卒"

root = pathlib.Path(__file__).resolve().parent.parent
font = TTFont(sys.argv[1])
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
scale = 1000 / font["head"].unitsPerEm

lines = []
for ch in CHARS:
    name = cmap[ord(ch)]
    bp = BoundsPen(glyphs)
    glyphs[name].draw(bp)
    x0, y0, x1, y1 = bp.bounds
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    sp = SVGPathPen(glyphs, ntos=lambda v: str(round(v)))
    # Flip y and centre the ink on (500, 500).
    glyphs[name].draw(TransformPen(sp, (scale, 0, 0, -scale, 500 - cx * scale, 500 + cy * scale)))
    lines.append(f"  '{ch}': '{sp.getCommands()}',")

out = root / "src" / "lib" / "glyphs.ts"
out.write_text(
    "// Brush glyphs for the disc piece set, traced from Ma Shan Zheng (SIL OFL) by scripts/glyph-paths.py.\n"
    "// Each path is centred in a 1000-unit box, y pointing down.\n"
    "export const GLYPHS: Record<string, string> = {\n" + "\n".join(lines) + "\n};\n",
    encoding="utf8",
)
print(out, out.stat().st_size, "bytes")
