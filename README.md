# Frangellboom

Crea bucles de ida y vuelta desde tus propios videos, en la calidad que quieras.

**🔗 [Probarlo en vivo](https://frangellcode.github.io/frangellboom/)** · también como app de iPhone.

## Cómo funciona

1. Importa un video (grabado con la cámara de tu dispositivo).
2. Elige el tramo que quieres convertir en bucle (hasta 2 segundos).
3. Ajusta modo, velocidad y calidad de salida, con vista previa en vivo.
4. Exporta y guarda tu bucle.

Todo el procesamiento pasa **en tu dispositivo**: tu video nunca se sube a ningún servidor y la app no tiene backend.

- **Web / PWA:** el video se procesa en el navegador con [ffmpeg.wasm](https://ffmpegwasm.netlify.app/). Se puede instalar y funciona sin conexión una vez instalada.
- **App de iOS** (`ios/`, Capacitor 8): el video se procesa con AVFoundation, usando el codificador de video del propio iPhone. Mantiene la resolución, los fps y el HDR del original. Guía de publicación: [docs/APP_STORE.md](docs/APP_STORE.md).

## Desarrollo

```sh
npm install
npm run dev        # web en http://localhost:5174
npm run ios        # compila, sincroniza y abre Frangellboom.xcworkspace en Xcode
```

## Build

```sh
npm run build      # web → dist/ (sitio 100% estático)
npm run build:ios  # el paquete que va dentro de la app de iOS (sin ffmpeg ni service worker)
```

Ver `deploy/nginx.conf.example` para servir la web con headers de seguridad.

## Stack

React · TypeScript · Vite · ffmpeg.wasm (web) · Capacitor + AVFoundation (iOS)

## Licencia

[MIT](./LICENSE)
