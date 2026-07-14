// Saving, opening, and printing. In the Mac app these go through real macOS
// dialogs and the real print panel; in a browser they fall back to blob
// downloads, a file input, and a print iframe. No document-model logic here.

import { native, type FileFilter } from './native'

/**
 * Save a file. Returns the path written in the Mac app, '' in a browser
 * (which cannot know where the download landed), or null if cancelled.
 */
export async function saveBlob(
  filename: string,
  data: ArrayBuffer | string,
  mime: string,
  filters?: FileFilter[],
): Promise<string | null> {
  if (native) {
    const payload = typeof data === 'string' ? data : new Uint8Array(data)
    return native.saveExport(filename, payload, filters)
  }
  const blob = new Blob([data as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return ''
}

/** Open a project file. Resolves its text, or null if cancelled. */
export function openTextFile(accept: string): Promise<string | null> {
  if (native) {
    return native.openProject().then((f) => (f ? f.contents : null))
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    document.body.appendChild(input)

    const finish = (text: string | null) => {
      input.remove()
      resolve(text)
    }

    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        finish(null)
        return
      }
      file.text().then(finish, () => finish(null))
    })
    // cancel: fires without a change event in modern browsers
    input.addEventListener('cancel', () => finish(null))

    input.click()
  })
}

export function printHTML(html: string): void {
  if (native) {
    void native.printHTML(html)
    return
  }
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '100%'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) {
    iframe.remove()
    return
  }

  iframe.addEventListener('load', () => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    // leave time for the print dialog to grab the content
    setTimeout(() => iframe.remove(), 1000)
  })

  doc.open()
  doc.write(html)
  doc.close()
}
