// Workbench — macOS main process.
//
// The renderer is the same app that runs in a browser; this process gives it
// the things a real Mac app has: a menu bar, real files on disk, printing,
// Recent Documents, and opening a .workbench file by double-clicking it.
//
// Deliberately absent: any Save prompt. Once a project has a file, every
// change auto-saves to that file (the renderer flushes on a debounce). The
// app never asks the user a question they can forget to answer.

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')

const isDev = !app.isPackaged
const DEV_URL = process.env.ELECTRON_START_URL || 'http://localhost:5173'

/** Path passed by Finder before the window exists (double-click / drag to Dock). */
let pendingOpenPath = null
/** @type {BrowserWindow | null} */
let mainWindow = null

const PROJECT_FILTERS = [{ name: 'Workbench Project', extensions: ['workbench', 'json'] }]

// ---------------------------------------------------------------- window

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#f4efe7',
    title: 'Workbench',
    titleBarStyle: 'default',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // the CSG kernel is WASM + WebGL; both are fine in the default sandbox
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // the title is the project's, not the HTML document's
  mainWindow.on('page-title-updated', (event) => event.preventDefault())

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingOpenPath) {
      openPathInRenderer(pendingOpenPath)
      pendingOpenPath = null
    }
  })

  // external links open in the real browser, never inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

/** Tell the renderer to load a file the OS handed us. */
async function openPathInRenderer(filePath) {
  try {
    const contents = await fs.readFile(filePath, 'utf8')
    app.addRecentDocument(filePath)
    send('workbench:open-file', { path: filePath, contents })
  } catch (err) {
    dialog.showMessageBox({
      type: 'warning',
      message: "That file couldn't be opened.",
      detail: `${path.basename(filePath)}\n\n${err.message}`,
      buttons: ['OK'],
    })
  }
}

// ---------------------------------------------------------------- menu

function menuCmd(label, command, accelerator) {
  return {
    label,
    accelerator,
    click: () => send('workbench:menu', command),
  }
}

function buildMenu() {
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    {
      label: 'Workbench',
      submenu: [
        { role: 'about', label: 'About Workbench' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Workbench' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Workbench' },
      ],
    },
    {
      label: 'File',
      submenu: [
        menuCmd('New Project', 'new', 'CmdOrCtrl+N'),
        menuCmd('Open…', 'open', 'CmdOrCtrl+O'),
        {
          role: 'recentDocuments',
          label: 'Open Recent',
          submenu: [{ role: 'clearRecentDocuments', label: 'Clear Menu' }],
        },
        { type: 'separator' },
        menuCmd('Save', 'save', 'CmdOrCtrl+S'),
        menuCmd('Save As…', 'saveAs', 'Shift+CmdOrCtrl+S'),
        { type: 'separator' },
        menuCmd('Make It…', 'makeIt', 'CmdOrCtrl+E'),
        menuCmd('Print Cut List…', 'printCutList', 'CmdOrCtrl+P'),
        { type: 'separator' },
        { role: 'close', label: 'Close Window' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        menuCmd('Undo', 'undo', 'CmdOrCtrl+Z'),
        menuCmd('Redo', 'redo', 'Shift+CmdOrCtrl+Z'),
        { type: 'separator' },
        // standard clipboard roles keep text fields behaving normally
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        menuCmd('Copy This Piece', 'duplicate', 'CmdOrCtrl+D'),
        menuCmd('Remove This Piece', 'delete', 'CmdOrCtrl+Backspace'),
      ],
    },
    {
      label: 'View',
      submenu: [
        menuCmd('Corner View', 'view:corner', 'CmdOrCtrl+1'),
        menuCmd('Front', 'view:front', 'CmdOrCtrl+2'),
        menuCmd('Back', 'view:back', 'CmdOrCtrl+3'),
        menuCmd('Left Side', 'view:left', 'CmdOrCtrl+4'),
        menuCmd('Right Side', 'view:right', 'CmdOrCtrl+5'),
        menuCmd('Top', 'view:top', 'CmdOrCtrl+6'),
        { type: 'separator' },
        menuCmd('Show Everything', 'view:showEverything', 'CmdOrCtrl+0'),
        menuCmd('Zoom In', 'view:zoomIn', 'CmdOrCtrl+Plus'),
        menuCmd('Zoom Out', 'view:zoomOut', 'CmdOrCtrl+-'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ role: 'toggleDevTools' }, { role: 'reload' }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }],
    },
    {
      label: 'Help',
      submenu: [
        menuCmd('Show Me the Basics Again', 'help:basics'),
        menuCmd('Open the Example Bookshelf', 'help:bookshelf'),
        { type: 'separator' },
        menuCmd('Workbench Help', 'help:open'),
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---------------------------------------------------------------- ipc

ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open a project',
    filters: PROJECT_FILTERS,
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const contents = await fs.readFile(filePath, 'utf8')
  app.addRecentDocument(filePath)
  return { path: filePath, contents }
})

/**
 * Write the project. With no path yet, ask where it should live.
 * Returns the path written, or null if the user cancelled the location prompt.
 */
ipcMain.handle('file:save', async (_e, { path: filePath, contents, suggestedName }) => {
  let target = filePath
  if (!target) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save your project',
      defaultPath: `${suggestedName || 'My Project'}.workbench`,
      filters: PROJECT_FILTERS,
    })
    if (result.canceled || !result.filePath) return null
    target = result.filePath
  }
  await fs.writeFile(target, contents, 'utf8')
  app.addRecentDocument(target)
  return target
})

/** Save an export (STL / DXF / SCAD / cut list). Binary arrives as a Uint8Array. */
ipcMain.handle('file:export', async (_e, { defaultName, data, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save',
    defaultPath: defaultName,
    filters: filters && filters.length ? filters : undefined,
  })
  if (result.canceled || !result.filePath) return null
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)
  await fs.writeFile(result.filePath, buffer)
  return result.filePath
})

/** Print a cut list / shop drawing through the real macOS print dialog. */
ipcMain.handle('print:html', async (_e, html) => {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false, sandbox: true },
  })
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await new Promise((resolve) => {
      printWindow.webContents.print(
        { silent: false, printBackground: false },
        () => resolve(undefined), // resolves whether printed or cancelled
      )
    })
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy()
  }
})

/** Window title, the proxy icon, and the edited dot in the close button. */
ipcMain.on('doc:state', (_e, { title, filePath, edited }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setTitle(title || 'Workbench')
  mainWindow.setRepresentedFilename(filePath || '')
  mainWindow.setDocumentEdited(Boolean(edited))
})

// ---------------------------------------------------------------- lifecycle

// Finder can hand us a file before the app is ready.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (mainWindow && !mainWindow.isDestroyed()) {
    openPathInRenderer(filePath)
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  } else {
    pendingOpenPath = filePath
  }
})

app.whenReady().then(() => {
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// On macOS the app stays running with no windows; quitting is explicit.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
