/** One navigation boundary for links, query tabs, and browser history. */
export const locationChanged = 'torchbearer:location-changed'
type Blocker = (proceed: () => void) => void
let blocker: Blocker | null = null
let index: number = window.history.state?.torchbearerIndex ?? 0
let currentUrl = window.location.href
let restoring: (() => void) | null = null
let replay = false

window.history.replaceState(
  { ...window.history.state, torchbearerIndex: index },
  '',
  currentUrl,
)

function notify() {
  window.dispatchEvent(new Event(locationChanged))
}

export function blockNavigation(next: Blocker) {
  blocker = next
  return () => {
    if (blocker === next) blocker = null
  }
}

export function navigateTo(destination: string | URL) {
  const url = new URL(destination, window.location.href)
  if (url.href === currentUrl) return
  const proceed = () => {
    index += 1
    currentUrl = url.href
    window.history.pushState({ torchbearerIndex: index }, '', currentUrl)
    notify()
  }
  if (blocker) blocker(proceed)
  else proceed()
}

window.addEventListener('popstate', (event: PopStateEvent) => {
  if (restoring) {
    const done = restoring
    restoring = null
    done()
    return
  }
  const targetIndex: number = event.state?.torchbearerIndex ?? index - 1
  const delta = targetIndex - index
  if (blocker && !replay && delta !== 0) {
    let restored = false
    let approved = false
    const resume = () => {
      replay = true
      window.history.go(delta)
    }
    restoring = () => {
      restored = true
      if (approved) resume()
    }
    window.history.go(-delta)
    blocker(() => {
      approved = true
      if (restored) resume()
    })
    return
  }
  replay = false
  index = targetIndex
  currentUrl = window.location.href
  notify()
})
