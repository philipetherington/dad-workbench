#!/bin/bash
# Build Workbench's .icns files from the SVG masters.
#
#   ./build/make-icons.sh
#
# Produces, next to the SVGs:
#   icon.png        1024x1024 RGBA, the app mark (electron-builder likes having it)
#   icon.icns       the app icon
#   document.icns   the .workbench project document icon
#
# Rasterising SVG on a stock Mac is the only interesting part, and there are two
# traps in it. Both are handled below; please read before "simplifying" this.
#
#   1. `sips` cannot read SVG at all. So we look for a real renderer, and fall
#      back to Quick Look, which ships with macOS and renders SVG properly
#      (gradients, arcs, clip paths) through WebKit.
#
#   2. Quick Look FLATTENS TRANSPARENCY ONTO WHITE. An app icon composited on a
#      white square looks broken in the Dock. There is no flag to stop it, so we
#      render each SVG twice, once on a white backdrop and once on black, and
#      solve for the true alpha per pixel:
#
#          on white:  Pw = C*a + 255*(1 - a)
#          on black:  Pb = C*a
#          =>  a = 1 - (Pw - Pb)/255      and      C = Pb / a
#
#      This is exact, recovers antialiased edges correctly, and duplicates none
#      of the artwork's geometry.
#
# Everything after that is plain `sips` + `iconutil`.
#
# Every step is checked, and the checks are the interesting part too: a size
# check alone is NOT enough, because when the SVG is malformed WebKit renders
# its "This page contains the following errors" page AT THE REQUESTED SIZE and
# the build sails on. So we also parse the XML up front, and assert the finished
# master actually has a transparent corner.

set -euo pipefail

BUILD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() {
  printf '\n\033[31mmake-icons failed:\033[0m %s\n\n' "$1" >&2
  exit 1
}

# ---------------------------------------------------------------- rasteriser

# First real renderer we can find; qlmanage is always there, so it is the backstop.
RASTERISER=""
for candidate in rsvg-convert cairosvg inkscape; do
  if command -v "$candidate" >/dev/null 2>&1; then
    RASTERISER="$candidate"
    break
  fi
done
if [ -z "$RASTERISER" ]; then
  command -v qlmanage >/dev/null 2>&1 \
    || die "no SVG rasteriser found (tried rsvg-convert, cairosvg, inkscape, qlmanage)."
  RASTERISER="qlmanage"
  # The Quick Look path needs Pillow to undo the white flattening.
  python3 -c "import PIL" >/dev/null 2>&1 \
    || die "falling back to qlmanage, which needs python3 + Pillow to recover transparency.
           Install one of rsvg-convert / cairosvg / inkscape, or: python3 -m pip install Pillow"
fi

# Malformed XML makes WebKit render an error page at full size, which then gets
# happily packed into a .icns. Refuse early. (A stray "--" inside an XML comment
# is enough to trigger it. It has happened.)
check_xml() {
  local src="$1"
  if command -v xmllint >/dev/null 2>&1; then
    xmllint --noout "$src" 2>/dev/null \
      || die "$src is not well-formed XML (xmllint). A '--' inside a comment will do this."
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import sys,xml.dom.minidom as m; m.parse(sys.argv[1])" "$src" 2>/dev/null \
      || die "$src is not well-formed XML (python3)."
  else
    echo "  warning: no xmllint or python3; cannot verify the SVG parses" >&2
  fi
}

# svg_to_png <src.svg> <dst.png> <size>
svg_to_png() {
  local src="$1" dst="$2" size="$3"
  [ -f "$src" ] || die "missing source SVG: $src"
  check_xml "$src"
  rm -f "$dst"

  case "$RASTERISER" in
    rsvg-convert)
      rsvg-convert -w "$size" -h "$size" -o "$dst" "$src" >/dev/null 2>&1 || true
      ;;
    cairosvg)
      cairosvg "$src" -o "$dst" -W "$size" -H "$size" >/dev/null 2>&1 || true
      ;;
    inkscape)
      inkscape "$src" --export-type=png --export-filename="$dst" \
        -w "$size" -h "$size" >/dev/null 2>&1 || true
      ;;
    qlmanage)
      SRC="$src" DST="$dst" SIZE="$size" python3 <<'PY' || die "qlmanage/Pillow render failed for $src"
import os, subprocess, tempfile
from PIL import Image

src, dst, size = os.environ["SRC"], os.environ["DST"], int(os.environ["SIZE"])
svg = open(src).read()

def with_backdrop(text, colour):
    # a full-canvas rect as the first child of <svg>, behind the artwork
    i = text.index(">", text.index("<svg")) + 1
    rect = f'<rect x="0" y="0" width="100%" height="100%" fill="{colour}"/>'
    return text[:i] + rect + text[i:]

tmp = tempfile.mkdtemp()
layers = {}
for tag, colour in (("w", "#ffffff"), ("b", "#000000")):
    p = os.path.join(tmp, tag + ".svg")
    with open(p, "w") as fh:
        fh.write(with_backdrop(svg, colour))
    subprocess.run(["qlmanage", "-t", "-s", str(size), "-o", tmp, p],
                   capture_output=True, check=False)
    out = os.path.join(tmp, tag + ".svg.png")
    if not os.path.exists(out):
        raise SystemExit(f"qlmanage produced nothing for the {tag} pass")
    layers[tag] = Image.open(out).convert("RGB")

W, B = layers["w"], layers["b"]
if W.size != B.size:
    raise SystemExit("the two passes disagree on size")

wb, bb = W.tobytes(), B.tobytes()
n = W.size[0] * W.size[1]
buf = bytearray(n * 4)
for i in range(n):
    rw, gw, bw = wb[3*i], wb[3*i+1], wb[3*i+2]
    rb, gb, bb_ = bb[3*i], bb[3*i+1], bb[3*i+2]
    a = 255 - max(rw - rb, gw - gb, bw - bb_)   # a = 1 - (Pw - Pb)/255
    if a <= 0:
        buf[4*i:4*i+4] = b"\0\0\0\0"
    else:                                        # un-premultiply: C = Pb / a
        buf[4*i]   = min(255, rb * 255 // a)
        buf[4*i+1] = min(255, gb * 255 // a)
        buf[4*i+2] = min(255, bb_ * 255 // a)
        buf[4*i+3] = a
Image.frombytes("RGBA", W.size, bytes(buf)).save(dst)
PY
      ;;
  esac

  [ -f "$dst" ] || die "$RASTERISER produced no PNG for $src"

  local got
  got="$(sips -g pixelHeight "$dst" 2>/dev/null | awk '/pixelHeight/ {print $2}')"
  [ "$got" = "$size" ] || die "$RASTERISER produced ${got:-nothing} px for $src, expected $size px"

  # Both icons have transparent corners by design. If the corner is opaque we
  # either failed to recover alpha, or we just rasterised WebKit's error page.
  if python3 -c "import PIL" >/dev/null 2>&1; then
    DST="$dst" python3 - <<'PY' || die "$dst has an opaque corner: alpha was lost, or the SVG failed to render."
import os, sys
from PIL import Image
im = Image.open(os.environ["DST"]).convert("RGBA")
sys.exit(1 if im.getpixel((0, 0))[3] != 0 else 0)
PY
  fi
}

# ---------------------------------------------------------------- icns

# make_icns <src.svg> <name>  ->  <name>.icns, from a single 1024px master
make_icns() {
  local src="$1" name="$2"
  local master="$BUILD_DIR/$name.png"
  local iconset="$BUILD_DIR/$name.iconset"

  echo "  rasterising $(basename "$src") with $RASTERISER"
  svg_to_png "$src" "$master" 1024

  rm -rf "$iconset"
  mkdir -p "$iconset"

  # The ten images macOS wants. Downsampling from one master keeps every size
  # identical in colour.
  local spec px out
  for spec in \
    "16    icon_16x16.png" \
    "32    icon_16x16@2x.png" \
    "32    icon_32x32.png" \
    "64    icon_32x32@2x.png" \
    "128   icon_128x128.png" \
    "256   icon_128x128@2x.png" \
    "256   icon_256x256.png" \
    "512   icon_256x256@2x.png" \
    "512   icon_512x512.png" \
    "1024  icon_512x512@2x.png"
  do
    px="$(echo "$spec" | awk '{print $1}')"
    out="$(echo "$spec" | awk '{print $2}')"
    sips -z "$px" "$px" "$master" --out "$iconset/$out" >/dev/null 2>&1 \
      || die "sips could not resize $master to ${px}px"
    [ -f "$iconset/$out" ] || die "sips produced no $out"
  done

  iconutil -c icns "$iconset" -o "$BUILD_DIR/$name.icns" \
    || die "iconutil could not build $name.icns"
  [ -f "$BUILD_DIR/$name.icns" ] || die "$name.icns was not created"
  file "$BUILD_DIR/$name.icns" | grep -q "Mac OS X icon" \
    || die "$name.icns is not a Mac OS X icon file"

  rm -rf "$iconset"
  echo "  wrote $name.icns ($(du -h "$BUILD_DIR/$name.icns" | awk '{print $1}'))"
}

echo "Workbench icons"
make_icns "$BUILD_DIR/icon.svg" "icon"
make_icns "$BUILD_DIR/document.svg" "document"

# The document master is only an intermediate; the app mark is worth keeping.
rm -f "$BUILD_DIR/document.png"

echo "done."
