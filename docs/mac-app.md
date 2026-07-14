# The Mac app

Notes for whoever maintains this (Philip). The user-facing sheet is
[`INSTALL.md`](../INSTALL.md) — that one gets printed and handed over; this one
does not.

## Architecture

Three layers, in the usual Electron shape:

| Layer | File | Job |
| --- | --- | --- |
| Main | `electron/main.cjs` | Window, native menu bar, file dialogs + reads/writes, print, Recent Documents, `open-file` from Finder |
| Preload | `electron/preload.cjs` | The *only* bridge. `contextBridge.exposeInMainWorld('workbench', …)`, `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` |
| Renderer | `src/` | The React app. Plain web code — it has no idea it is inside Electron except through one module |

That one module is **`src/ui/native.ts`**. It exports `native`, which is
`window.workbench` or **`null`**. Every native capability is reached through it,
and every caller has a web fallback (blob download instead of a save dialog, a
print iframe instead of the macOS print dialog). The app must stay fully usable
at `localhost:5173` with no Electron at all — that is a hard rule, not a nicety,
because it is where all the fast iteration happens.

The preload surface, in full: `pathForFile`, `openProject`, `saveProject`,
`saveExport`, `printHTML`, `setDocState`, `onMenu`, `onOpenFile`. Nothing else
crosses. Menu items in `main.cjs` don't do work; they `send('workbench:menu', cmd)`
and the renderer decides what that means, so the menu can never drift out of
sync with what the UI actually supports.

`setDocState` is what makes it feel like a real Mac document window: it drives
`setTitle`, `setRepresentedFilename` (the proxy icon in the title bar) and
`setDocumentEdited` (the dot in the close button).

## The no-save-button decision

The app has no Save button, and that is load-bearing, not lazy. He is 70, he is
a cabinetmaker, and a lost afternoon because a dialog was dismissed is the one
failure that would make him stop using this.

How it actually works, in `src/ui/docFile.ts`:

- `startNativeDocSync()` subscribes to the doc store. Any change to `doc`
  schedules a flush **700ms** later (`FLUSH_MS`), debounced.
- The flush only happens **once the project has a file** (`filePath !== null`).
  An untitled project never pops a save dialog on its own — that would be the
  app asking a question the user can get wrong.
- `lastWritten` holds the last serialized doc, so an identical file is never
  rewritten, and it is also how "edited" is computed for the title bar dot.
- **Cmd+S** routes to `saveToFile()`. On a project with a file, that just forces
  the flush that was already coming. It exists for muscle memory. On a project
  with no file yet, it is the moment we ask where the file goes — the only file
  question the app ever asks.
- Cancelling that location prompt sets the save state back to `saved`, not
  `error`: nothing hit disk, but the work is not lost, and the UI must not lie
  about that.

**localStorage autosave stays.** `AUTOSAVE_KEY = 'workbench-autosave-v1'` in
`src/model/store.ts` (wired in `main.tsx`) is crash insurance and covers the
window between "started drawing" and "gave it a file". Two independent
persistence paths is correct here, not redundant.

## Development

```
npm run dev        # renderer only, browser, localhost:5173
npm run dev:app    # Electron against the dev server (concurrently + wait-on)
npm test           # vitest, runs the real CSG kernel
npm run build      # tsc -b && vite build -> dist/
npm run build:mac  # electron-builder -> release/Workbench.app + .dmg
```

`main.cjs` picks its source from `app.isPackaged`: dev loads `ELECTRON_START_URL`
(default `http://localhost:5173`), packaged loads `dist/index.html` off disk.
DevTools and Reload are only in the View menu when `isDev`.

## Signing reality

There is **no paid Apple Developer account**, so the app is **ad-hoc signed**
(`identity: null` in electron-builder). What that buys and costs:

- It **runs fine**. Ad-hoc signing is a real signature; it just isn't tied to a
  Developer ID Apple recognises.
- It is **not notarized**, so Gatekeeper shows the "unidentified developer"
  panel the first time the app is opened on a machine it was *copied* to. The
  right-click → Open dance clears it permanently, per machine. That is step 4–7
  of `INSTALL.md`, and it is the single ugliest moment in the whole product.
- If a copy arrives via a download or a mail attachment it carries the
  quarantine bit, and the panel can turn from "Open anyway" into "move to
  Trash". The escape hatch:

  ```
  xattr -dr com.apple.quarantine /Applications/Workbench.app
  ```

  Prefer handing it over on a USB stick or with AirDrop from a trusted Mac; that
  usually avoids the harsher wording entirely. Don't put that command in his
  printed sheet.

With a **$99/yr Apple Developer account** this all goes away:

- Developer ID signing + `notarize: true` → the app opens with **zero warnings**,
  first launch included, on any Mac, however it was delivered.
- **Auto-update becomes possible** (`electron-updater` needs a signed app; it
  refuses to replace an unsigned one), which means he'd get fixes without
  another USB stick.

That is the main argument for paying: not the warning, the updates.

## Known gaps

- **Quick Look previews.** The file association gives `.workbench` files a custom
  icon in Finder — that's the 90%, and it's done. A real thumbnail (spacebar on a
  file, see the piece) needs a separate **Swift app extension** (a
  `QLThumbnailProvider` / `QLPreviewProvider` bundled inside the `.app`), which
  means a Swift target that Electron's build doesn't produce. Deferred on
  purpose; the icon is enough to make the files feel real.
- **No auto-update.** Blocked on signing, above. Today an update is a new copy
  dragged into Applications, which overwrites cleanly and does not touch his
  `.workbench` files.
- **Apple Silicon only.** Intel/universal is one word in `electron-builder.yml`
  (add `x64` to `mac.target.arch`, or use `universal`). Left off because the
  target machine is Apple Silicon and a universal build doubles the download for
  no one.
- **No crash reporting.** Deliberate — nothing phones home from a woodworker's
  bench.
