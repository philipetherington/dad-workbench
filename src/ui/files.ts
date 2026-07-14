// Browser file helpers: save, open, print. No document-model logic here.

export function saveBlob(filename: string, data: ArrayBuffer | string, mime: string): void {
  const blob = new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function openTextFile(accept: string): Promise<string | null> {
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
