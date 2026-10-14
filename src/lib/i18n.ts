import { useSyncExternalStore } from "react";
import { isNativeApp } from "./native";

export type TourSlideId = "welcome" | "capture" | "moment" | "shape" | "share" | "pro";
export interface TourSlide {
  id: TourSlideId;
  title: string;
  body: string;
}

const es = {
  tagline: "bucles de ida y vuelta en alta calidad",
  /** Poster-size word on the home screen. */
  heroWord: "BUCLE",
  /** Headlines: the word in {braces} is set in the handwritten face. */
  heroLine: "Ida y vuelta, en calidad {original}.",
  importCta: "Elegir un video",
  recordCta: "Grabar un momento",
  recordHint: "Mantén presionado o toca · máx. 0.75 s",
  cameraDenied: "La cámara está desactivada. Actívala en Ajustes → Frangellboom.",
  dropHint: "o arrastra un clip aquí",
  trimEyebrow: "Elige el {momento}",
  adjustEyebrow: "Dale forma al {bucle}",
  importTitle: "Importa tu video",
  importHint: isNativeApp ? "Toca para elegir un video de tu fototeca." : "Arrastra un clip aquí o toca para elegirlo.",
  badgeOnDevice: "100% en tu dispositivo",
  badgeQuality: "Sin límites de calidad",
  segmentLength: "Duración del tramo",
  secondsSelected: (s: string) => `${s}s seleccionados`,
  back: "Atrás",
  preparing: "Preparando…",
  next: "Siguiente",
  trimBack: "Recortar",
  recordAgain: "Grabar de nuevo",
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
  modes: { classic: "Clásico", ease: "Suave", freeze: "Pausa", pulse: "Pulso", zoom: "Zoom", ramp: "Rampa", bounce: "Rebote", echo: "Eco", mirror: "Espejo" },
  look: "Estilo",
  lookNone: "Ninguno",
  lookAmount: "Intensidad",
  looks: {
    retrato: "Retrato 400",
    vivido: "Vívido 100",
    verde: "Verde 400",
    pastel: "Pastel",
    cruzado: "Proceso cruzado",
    noir: "Noir",
    plata: "Plata 400",
    niebla: "Niebla BN",
    atardecer: "Atardecer",
    menta: "Menta 80",
    verano: "Verano 98",
  },
  live: "EN VIVO",
  pausePreview: "Pausar vista previa",
  playPreview: "Reproducir vista previa",
  flavor: ["Dándole la vuelta a los píxeles…", "Afinando la ida y vuelta…", "Puliendo cada cuadro…", "Ya casi está"],
  ready: "Tu bucle está {listo}",
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
  proLabel: "¿Quieres más?",
  proCta: "Hazte Pro",
  pro: {
    title: "Frangellboom Pro",
    subtitle: "Un solo pago, para siempre. Sin suscripción.",
    features: ["8 modos más: Rampa, Rebote, Eco, Espejo…", "11 estilos de cine", "Cámara Pro: 120 fps, temporizador y lentes", "Fotos en vivo convertidas en bucle", "Calidad 4K y original", "Sin marca de agua"],
    unlock: (price: string) => `Desbloquear por ${price}`,
    loadingPrice: "Cargando…",
    unavailable: "No disponible ahora",
    restore: "Restaurar compras",
    restoring: "Restaurando…",
    notNow: "Ahora no",
    unlocked: "Pro desbloqueado. ¡Gracias por apoyar Frangellboom!",
    pending: "Tu compra está esperando aprobación. Pro se desbloquea en cuanto se confirme.",
    nothingToRestore: "No se encontró ninguna compra de Pro para este Apple ID.",
    failed: "La compra no se completó. No se te cobró nada.",
    done: "Listo",
    locked: "Pro",
  },
  /** First-launch welcome tour. Titles: the word in {braces} is handwritten. */
  tour: {
    skip: "Saltar",
    next: "Siguiente",
    back: "Atrás",
    start: "Empezar",
    help: "Cómo funciona",
    slides: [
      {
        id: "welcome",
        title: "Hola, esto es {Frangellboom}",
        body: "Convierte un momento en un bucle de ida y vuelta, en alta calidad y 100% en tu dispositivo. Desliza para ver cómo.",
      },
      {
        id: "capture",
        title: isNativeApp ? "Graba o {elige}" : "Elige tu {video}",
        body: isNativeApp
          ? "Graba un momento con la cámara de la app (mantén presionado o solo toca) o elige cualquier video de tu fototeca."
          : "Elige un video o arrástralo aquí. Se procesa en tu navegador y nunca se sube a ningún lado.",
      },
      {
        id: "moment",
        title: "Elige el {momento}",
        body: isNativeApp
          ? "Desliza la ventana sobre tu video hasta el tramo que quieres, de medio segundo a dos. Lo que grabas en la app se salta este paso."
          : "Desliza la ventana sobre tu video hasta el tramo que quieres, de medio segundo a dos.",
      },
      {
        id: "shape",
        title: "Dale forma al {bucle}",
        body: isNativeApp
          ? "Clásico, a velocidad normal o en cámara lenta, y con Pro ocho modos más, de Suave a Espejo. Toca uno para verlo en vivo."
          : "Cinco modos, cada uno con su propio movimiento. En Clásico también hay cámara lenta. Lo ves en vivo antes de crearlo.",
      },
      {
        id: "share",
        title: "Guárdalo y {compártelo}",
        body: isNativeApp
          ? "Crea tu bucle en 1080p o 2K, o en 4K y calidad original con Pro, y guárdalo en Fotos o compártelo donde quieras."
          : "Crea tu bucle hasta en calidad original y descárgalo o compártelo donde quieras.",
      },
      ...(isNativeApp
        ? [
            {
              id: "pro",
              title: "Hazte {Pro}",
              body: "Un solo pago, para siempre, sin suscripción. Lo encuentras abajo en la pantalla de inicio.",
            },
          ]
        : []),
    ] as TourSlide[],
  },
};

const en: typeof es = {
  tagline: "back-and-forth loops in full quality",
  heroWord: "LOOP",
  heroLine: "Back and forth, in {full} quality.",
  importCta: "Choose a video",
  recordCta: "Record a moment",
  recordHint: "Hold, or tap · 0.75 s max",
  cameraDenied: "Camera access is off. Turn it on in Settings → Frangellboom.",
  dropHint: "or drop a clip here",
  trimEyebrow: "Pick the {moment}",
  adjustEyebrow: "Shape the {loop}",
  importTitle: "Import your video",
  importHint: isNativeApp ? "Tap to pick a video from your library." : "Drop a clip here or tap to pick one.",
  badgeOnDevice: "100% on your device",
  badgeQuality: "No quality limits",
  segmentLength: "Segment length",
  secondsSelected: (s: string) => `${s}s selected`,
  back: "Back",
  preparing: "Preparing…",
  next: "Next",
  trimBack: "Trim",
  recordAgain: "Record again",
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
  modes: { classic: "Classic", ease: "Ease", freeze: "Freeze", pulse: "Pulse", zoom: "Zoom", ramp: "Ramp", bounce: "Bounce", echo: "Echo", mirror: "Mirror" },
  look: "Look",
  lookNone: "None",
  lookAmount: "Intensity",
  looks: {
    retrato: "Portrait 400",
    vivido: "Vivid 100",
    verde: "Green 400",
    pastel: "Pastel",
    cruzado: "Cross Process",
    noir: "Noir",
    plata: "Silver 400",
    niebla: "Fog B&W",
    atardecer: "Sunset",
    menta: "Mint 80",
    verano: "Summer 98",
  },
  live: "LIVE",
  pausePreview: "Pause preview",
  playPreview: "Play preview",
  flavor: ["Flipping the pixels around…", "Tuning the back-and-forth…", "Polishing every frame…", "Almost there"],
  ready: "Your loop is {ready}",
  download: "Download",
  save: "Save or share",
  saveFailed: "The video couldn't be saved. Check that you have free space and try again.",
  another: "Make another",
  langToggle: "ES",
  langToggleLabel: "Cambiar a español",
  donateLabel: "Help keep this app alive",
  donate: "Donate",
  followUs: "Follow us at",
  proLabel: "Want more?",
  proCta: "Go Pro",
  pro: {
    title: "Frangellboom Pro",
    subtitle: "One purchase, yours forever. No subscription.",
    features: ["8 more modes: Ramp, Bounce, Echo, Mirror…", "11 film looks", "Pro camera: 120 fps, timer and lenses", "Live Photos turned into loops", "4K and original quality", "No watermark"],
    unlock: (price: string) => `Unlock for ${price}`,
    loadingPrice: "Loading…",
    unavailable: "Not available right now",
    restore: "Restore purchases",
    restoring: "Restoring…",
    notNow: "Not now",
    unlocked: "Pro unlocked. Thank you for supporting Frangellboom!",
    pending: "Your purchase is waiting for approval. Pro unlocks as soon as it goes through.",
    nothingToRestore: "No previous Pro purchase was found for this Apple ID.",
    failed: "The purchase didn’t go through. You weren’t charged.",
    done: "Done",
    locked: "Pro",
  },
  tour: {
    skip: "Skip",
    next: "Next",
    back: "Back",
    start: "Get started",
    help: "How it works",
    slides: [
      {
        id: "welcome",
        title: "Hi, this is {Frangellboom}",
        body: "Turn a moment into a back-and-forth loop, in high quality and entirely on your device. Swipe to see how.",
      },
      {
        id: "capture",
        title: isNativeApp ? "Record or {choose}" : "Choose your {video}",
        body: isNativeApp
          ? "Record a moment with the app's camera (hold, or just tap) or pick any video from your library."
          : "Pick a video or drop it in. It's processed in your browser and never uploaded anywhere.",
      },
      {
        id: "moment",
        title: "Pick the {moment}",
        body: isNativeApp
          ? "Slide the window along your video to the part you want, from half a second to two. Clips recorded in the app skip this step."
          : "Slide the window along your video to the part you want, from half a second to two.",
      },
      {
        id: "shape",
        title: "Shape the {loop}",
        body: isNativeApp
          ? "Classic, at normal speed or in slow motion, and with Pro eight more modes, from Ease to Mirror. Tap one to see it live."
          : "Five modes, each with its own motion. Classic also does slow motion. You see it live before you make it.",
      },
      {
        id: "share",
        title: "Save it, {share} it",
        body: isNativeApp
          ? "Make your loop in 1080p or 2K, or in 4K and full original quality with Pro, then save it to Photos or share it anywhere."
          : "Make your loop in up to full original quality, then download it or share it anywhere.",
      },
      ...(isNativeApp
        ? [
            {
              id: "pro",
              title: "Go {Pro}",
              body: "One purchase, yours forever, no subscription. You'll find it at the bottom of the home screen.",
            },
          ]
        : []),
    ] as TourSlide[],
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
