// The only bridge between the renderer and the OS. Everything the app is
// allowed to do natively is listed here, explicitly.

const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('workbench', {
  isNative: true,
  platform: process.platform,

  /** Real filesystem path of a dropped File (contextIsolation hides file.path). */
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || null
    } catch {
      return null
    }
  },

  /** Ask for a project file. Resolves null if the user cancels. */
  openProject: () => ipcRenderer.invoke('file:open'),

  /**
   * Write the project. Pass path=null to be asked where it goes.
   * Resolves the path written, or null if the location prompt was cancelled.
   */
  saveProject: (path, contents, suggestedName) =>
    ipcRenderer.invoke('file:save', { path, contents, suggestedName }),

  /** Save an export file. `data` is a string or a Uint8Array. */
  saveExport: (defaultName, data, filters) =>
    ipcRenderer.invoke('file:export', { defaultName, data, filters }),

  /** Open the macOS print dialog on a complete HTML document. */
  printHTML: (html) => ipcRenderer.invoke('print:html', html),

  /** Window title, proxy icon, and the edited dot. */
  setDocState: (state) => ipcRenderer.send('doc:state', state),

  /** Menu commands: 'new' | 'open' | 'save' | 'view:top' | ... */
  onMenu: (callback) => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('workbench:menu', listener)
    return () => ipcRenderer.removeListener('workbench:menu', listener)
  },

  /** A file the OS handed us (double-click in Finder, drop on the Dock). */
  onOpenFile: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('workbench:open-file', listener)
    return () => ipcRenderer.removeListener('workbench:open-file', listener)
  },
})
