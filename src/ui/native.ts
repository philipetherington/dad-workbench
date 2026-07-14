// The native (Electron) bridge, as seen from the renderer.
//
// Everything here is optional: `native` is null in a browser, and every
// caller falls back to the web behaviour (blob downloads, print iframe).
// The app must stay fully usable at localhost:5173 with no Electron.

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface OpenedFile {
  path: string
  contents: string
}

export interface NativeApi {
  isNative: true
  platform: string
  pathForFile: (file: File) => string | null
  openProject: () => Promise<OpenedFile | null>
  saveProject: (
    path: string | null,
    contents: string,
    suggestedName?: string,
  ) => Promise<string | null>
  saveExport: (
    defaultName: string,
    data: string | Uint8Array,
    filters?: FileFilter[],
  ) => Promise<string | null>
  printHTML: (html: string) => Promise<void>
  setDocState: (state: { title: string; filePath: string | null; edited: boolean }) => void
  onMenu: (cb: (command: string) => void) => () => void
  onOpenFile: (cb: (file: OpenedFile) => void) => () => void
}

declare global {
  interface Window {
    workbench?: NativeApi
  }
}

export const native: NativeApi | null =
  typeof window !== 'undefined' && window.workbench ? window.workbench : null

export const isNative = native !== null

/** The last path component, for titles and toasts. */
export function baseName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}
