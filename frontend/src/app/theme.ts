// CSS owns the palette. Keep browser chrome in sync when the root theme changes.
export function initializeTheme() {
  const root = document.documentElement
  const themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )

  function syncTheme() {
    if (root.dataset.theme !== 'light' && root.dataset.theme !== 'dark') {
      root.dataset.theme = 'dark'
    }
    if (themeColor) {
      themeColor.content = getComputedStyle(root)
        .getPropertyValue('--color-canvas')
        .trim()
    }
  }

  syncTheme()
  new MutationObserver(syncTheme).observe(root, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
}
