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
    window.onTphCaptchaLoaded = () => window.grecaptcha ? resolve(window.grecaptcha) : reject(new Error('reCAPTCHA unavailable'))
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
    loadScript()
      .then((grecaptcha) => {
        if (cancelled || !containerRef.current || widgetId.current !== null) return
        widgetId.current = grecaptcha.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      .catch(() => onTokenRef.current(null))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (widgetId.current !== null) window.grecaptcha?.reset(widgetId.current)
  }, [resetKey])

  return <div ref={containerRef} style={{ minHeight: 78 }} />
}
