import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isNativeApp } from './lib/native'

// Poll for a new service worker every hour instead of only on a cold page
// load — an installed PWA opened from its home-screen icon rarely does a
// full fresh navigation, so without this it can stay stuck running a stale
// cached build (old JS + old ffmpeg-core.wasm) indefinitely. `autoUpdate`
// already forces skipWaiting/clientsClaim, so once an update is detected it
// activates and reloads on its own — this just makes sure that check
// actually happens.
//
// Web only: the iOS app ships every file inside the binary and is updated
// through the App Store, never by a service worker (App Review 2.5.2).
if (!isNativeApp) {
  import('virtual:pwa-register').then(({ registerSW }) =>
    registerSW({
      immediate: true,
      onRegistered(registration) {
        if (!registration) return
        setInterval(() => registration.update(), 60 * 60 * 1000)
      },
    }),
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
