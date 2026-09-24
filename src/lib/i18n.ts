import { isNativeApp } from "./native";

// The app speaks the phone's language: Spanish for any Spanish locale,
// English otherwise. In the iOS app navigator.language follows the app's
// own language (iOS Settings → Frangellboom → Language).
const spanish = /^es\b/i.test(navigator.language);

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
  live: "● EN VIVO",
  pausePreview: "Pausar vista previa",
  playPreview: "Reproducir vista previa",
  flavor: ["Dándole la vuelta a los píxeles…", "Afinando la ida y vuelta…", "Puliendo cada cuadro…", "Ya casi está"],
  ready: "¡Tu bucle está listo!",
  download: "Descargar",
  save: "Guardar o compartir",
  saveFailed: "No se pudo guardar el video. Revisa que tengas espacio libre e inténtalo de nuevo.",
  another: "Crear otro",
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
  live: "● LIVE",
  pausePreview: "Pause preview",
  playPreview: "Play preview",
  flavor: ["Flipping the pixels around…", "Tuning the back-and-forth…", "Polishing every frame…", "Almost there"],
  ready: "Your loop is ready!",
  download: "Download",
  save: "Save or share",
  saveFailed: "The video couldn't be saved. Check that you have free space and try again.",
  another: "Make another",
};

export const t = spanish ? es : en;
export const lang = spanish ? "es" : "en";
