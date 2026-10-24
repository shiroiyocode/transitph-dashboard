import { useEffect, useRef } from 'react'

interface Grecaptcha {
  render: (el: HTMLElement, options: Record<string, unknown>) => number
  reset: (widgetId?: number) => void
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha & { ready?: (cb: () => void) => void }
    onTphCaptchaLoaded?: () => void
  }
}

// Google's public test key: always passes and shows a "testing only" notice.
// Set VITE_RECAPTCHA_SITE_KEY to a real reCAPTCHA v2 ("I'm not a robot") key.
const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'
const SCRIPT_ID = 'tph-recaptcha-script'

function loadScript(): Promise<Grecaptcha> {
  return new Promise((resolve, reject) => {
    if (window.grecaptcha?.render) return resolve(window.grecaptcha)
    // Several mounts can wait on one script load, so chain callbacks instead of overwriting.
    const previous = window.onTphCaptchaLoaded
    window.onTphCaptchaLoaded = () => {
      previous?.()
      if (window.grecaptcha?.render) resolve(window.grecaptcha)
      else reject(new Error('reCAPTCHA unavailable'))
    }
    if (document.getElementById(SCRIPT_ID)) return
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = 'https://www.google.com/recaptcha/api.js?onload=onTphCaptchaLoaded&render=explicit'
    script.async = true
    script.onerror = () => reject(new Error('Could not load reCAPTCHA'))
    document.head.appendChild(script)
  })
}

/** "I'm not a robot" checkbox. `resetKey` clears it (call after each login attempt). */
export function Captcha({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<number | null>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    let cancelled = false
    const host = containerRef.current
    // A fresh element per mount: Google keeps state on the element it rendered into,
    // so reusing one (StrictMode, logout -> login remount) can leave a dead widget.
    const mount = document.createElement('div')
    host?.appendChild(mount)
    onTokenRef.current(null)

    loadScript()
      .then((grecaptcha) => {
        if (cancelled) return
        widgetId.current = grecaptcha.render(mount, {
          sitekey: SITE_KEY,
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      .catch(() => onTokenRef.current(null))

    return () => {
      cancelled = true
      if (widgetId.current !== null) {
        try { window.grecaptcha?.reset(widgetId.current) } catch { /* widget already gone */ }
        widgetId.current = null
      }
      mount.remove()
    }
  }, [])

  useEffect(() => {
    if (widgetId.current !== null) window.grecaptcha?.reset(widgetId.current)
  }, [resetKey])

  return <div ref={containerRef} style={{ minHeight: 78 }} />
}
