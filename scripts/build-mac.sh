#!/usr/bin/env bash
# Workbench — build the Mac app.
#
# This is the only command needed to produce something Philip can hand to
# someone else: `npm run build:mac`. It builds the renderer, packages the
# Electron app, ad-hoc signs it (Apple silicon refuses to run an unsigned
# binary), and then says in plain words where the disk image is.
#
# Any failure stops the script immediately and loudly.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

rule() { printf '\n%s\n' "------------------------------------------------------------"; }
say()  { printf '%s\n' "$*"; }
die()  { printf '\nBUILD FAILED: %s\n\n' "$*" >&2; exit 1; }

# --------------------------------------------------------------- 0. sanity

[ -f "$ROOT/build/icon.icns" ] || die "build/icon.icns is missing — the app icon has to exist before packaging."

# --------------------------------------------------------------- 1. renderer

rule
say "1/4  Building the app's interface (Vite)…"
npm run build || die "the Vite build did not finish."
[ -f "$ROOT/dist/index.html" ] || die "dist/index.html was not produced by the Vite build."

# --------------------------------------------------------------- 2. package

rule
say "2/4  Packaging it as a Mac app (electron-builder)…"
npx electron-builder --mac --arm64 || die "electron-builder did not finish."

# --------------------------------------------------------------- 3. sign

rule
say "3/4  Signing the app so macOS will run it…"

APP=""
for candidate in "$ROOT/release/mac-arm64/DAD Workbench.app" "$ROOT/release/mac/DAD Workbench.app"; do
  if [ -d "$candidate" ]; then APP="$candidate"; break; fi
done

if [ -z "$APP" ]; then
  # electron-builder can change its output folder name between versions; find it.
  APP="$(find "$ROOT/release" -maxdepth 2 -name 'DAD Workbench.app' -type d -print -quit 2>/dev/null || true)"
fi

[ -n "$APP" ] && [ -d "$APP" ] || die "couldn't find DAD Workbench.app anywhere under release/."

say "     Found: ${APP#"$ROOT"/}"

codesign --force --deep --sign - "$APP" || die "ad-hoc signing failed."
codesign --verify --deep --strict --verbose=2 "$APP" || die "the signature did not verify."
say "     Signature verified."

# --------------------------------------------------------------- 4. report

DMG="$(find "$ROOT/release" -maxdepth 1 -name '*.dmg' -type f -print -quit 2>/dev/null || true)"
[ -n "$DMG" ] && [ -f "$DMG" ] || die "no .dmg was produced in release/."

rule
say "4/4  Done."
rule
say ""
say "The disk image is here:"
say ""
say "    $DMG"
say ""
say "To install it yourself: double-click that .dmg and drag Workbench into"
say "your Applications folder."
say ""
say "If you send it to someone else, their Mac will not trust it (it isn't"
say "signed with a paid Apple developer certificate). After they drag the app"
say "into Applications, they open Terminal and paste this one line, then press"
say "Return:"
say ""
say "    xattr -dr com.apple.quarantine /Applications/DAD Workbench.app"
say ""
say "After that, Workbench opens normally, every time."
say ""
