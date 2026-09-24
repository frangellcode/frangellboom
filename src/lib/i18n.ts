import { useSyncExternalStore } from "react";
import { isNativeApp } from "./native";

const es = {
  tagline: "bucles de ida y vuelta en alta calidad",
  importTitle: "Importa tu video",
  importHint: isNativeApp ? "Toca para elegir un video de tu fototeca." : "Arrastra un clip aquí o toca para elegirlo.",
  badgeOnDevice: "100% en tu dispositivo",
  badgeQuality: "Sin límites de calidad",
  segmentLength: "Duración del tramo",
  secondsSelected: (s: string) => `${s}s seleccionados`,
  back: "Volver atrás",
  preparing: "Preparando…",
  next: "Siguiente →",
  trimBack: "← Recortar",
  segment: "Tramo",
  totalLength: "Duración total",
  create: "Crear bucle",
  creating: "Creando tu bucle…",
  processFailed: isNativeApp
    ? "No se pudo procesar el video. Prueba con otro tramo u otra calidad."
    : "No se pudo procesar el video. Prueba con un clip más corto o recarga la página.",
  settings: "Ajustes",
  mode: "Modo",
  speed: "Velocidad",
  quality: "Calidad de salida",
  modes: { classic: "Clásico", ease: "Suave", freeze: "Pausa", pulse: "Pulso", zoom: "Zoom" },
  live: "EN VIVO",
  pausePreview: "Pausar vista previa",
  playPreview: "Reproducir vista previa",
  flavor: ["Dándole la vuelta a los píxeles…", "Afinando la ida y vuelta…", "Puliendo cada cuadro…", "Ya casi está"],
  ready: "¡Tu bucle está listo!",
  download: "Descargar",
  save: "Guardar o compartir",
  saveFailed: "No se pudo guardar el video. Revisa que tengas espacio libre e inténtalo de nuevo.",
  another: "Crear otro",
  /** Shows the language you'd switch TO, not the current one. */
  langToggle: "EN",
  langToggleLabel: "Switch to English",
  donateLabel: "Ayúdanos a mantener la app",
  donate: "Donar",
  followUs: "Síguenos en",
  tipLabel: "¿Te gusta Frangellboom?",
  tip: "Deja una propina",
  tipJar: {
    title: "Apoya a Frangellboom",
    body: "Frangellboom es gratis y siempre lo será. Una propina ayuda a mantenerla — no desbloquea nada, ya tienes todas las funciones.",
    loading: "Cargando…",
    unavailable: "Las propinas no están disponibles ahora. Inténtalo más tarde.",
    thanks: "¡Gracias! Tu apoyo significa mucho.",
    pending: "Tu propina está esperando aprobación. ¡Gracias!",
    failed: "La compra no se completó. No se te cobró nada.",
    close: "Cerrar",
  },
};

const en: typeof es = {
  tagline: "back-and-forth loops in full quality",
  importTitle: "Import your video",
  importHint: isNativeApp ? "Tap to pick a video from your library." : "Drop a clip here or tap to pick one.",
  badgeOnDevice: "100% on your device",
  badgeQuality: "No quality limits",
  segmentLength: "Segment length",
  secondsSelected: (s: string) => `${s}s selected`,
  back: "Back",
  preparing: "Preparing…",
  next: "Next →",
  trimBack: "← Trim",
  segment: "Segment",
  totalLength: "Total length",
  create: "Create loop",
  creating: "Creating your loop…",
  processFailed: isNativeApp
    ? "The video couldn't be processed. Try another segment or quality."
    : "The video couldn't be processed. Try a shorter clip or reload the page.",
  settings: "Settings",
  mode: "Mode",
  speed: "Speed",
  quality: "Output quality",
  modes: { classic: "Classic", ease: "Ease", freeze: "Freeze", pulse: "Pulse", zoom: "Zoom" },
  live: "LIVE",
  pausePreview: "Pause preview",
  playPreview: "Play preview",
  flavor: ["Flipping the pixels around…", "Tuning the back-and-forth…", "Polishing every frame…", "Almost there"],
  ready: "Your loop is ready!",
  download: "Download",
  save: "Save or share",
  saveFailed: "The video couldn't be saved. Check that you have free space and try again.",
  another: "Make another",
  langToggle: "ES",
  langToggleLabel: "Cambiar a español",
  donateLabel: "Help keep this app alive",
  donate: "Donate",
  followUs: "Follow us at",
  tipLabel: "Enjoying Frangellboom?",
  tip: "Leave a tip",
  tipJar: {
    title: "Support Frangellboom",
    body: "Frangellboom is free and always will be. A tip helps keep it going — it unlocks nothing, every feature is already yours.",
    loading: "Loading…",
    unavailable: "Tips aren’t available right now. Try again later.",
    thanks: "Thank you! Your support means a lot.",
    pending: "Your tip is waiting for approval. Thank you!",
    failed: "The purchase didn’t go through. You weren’t charged.",
    close: "Close",
  },
};

export type Language = "en" | "es";
export type Strings = typeof es;

const STORAGE_KEY = "frangellboom:language";

/** The last language picked with the EN/ES button; until then, the phone's. */
function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
  } catch {
    // storage unavailable (private browsing, disabled) — fall through
  }
  return /^es\b/i.test(navigator.language) ? "es" : "en";
}

let language = initialLanguage();
const listeners = new Set<() => void>();

/** Keeps <html lang> in step with the UI, so VoiceOver reads Spanish as
 *  Spanish and the browser doesn't offer to translate it. */
function applyDocumentLanguage() {
  document.documentElement.lang = language;
}
applyDocumentLanguage();

export function toggleLanguage() {
  language = language === "en" ? "es" : "en";
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // keep the in-memory pick
  }
  applyDocumentLanguage();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current language; re-renders whenever the EN/ES button flips it. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, () => language);
}

/** The current language's strings. */
export function useT(): Strings {
  return useLanguage() === "es" ? es : en;
}
