# Frangellboom en el App Store — guía completa

Esta guía va desde "tengo la cuenta de Apple Developer" hasta "la app está en revisión". Síguela en orden.

- **Nombre:** Frangellboom
- **Bundle ID:** `com.frangellcode.frangellboom`
- **Team:** Frangell Vasquez (9S78N8546T)
- **Propinas (IAP consumibles):**
  - `com.frangellcode.frangellboom.tip.small` → $0.99
  - `com.frangellcode.frangellboom.tip.medium` → $2.99
  - `com.frangellcode.frangellboom.tip.large` → $4.99
- **Política de privacidad:** https://frangellcode.github.io/frangellboom/privacy.html
- **Soporte:** https://frangellcode.github.io/frangellboom/support.html

> Si cambias el Bundle ID, cámbialo también en `capacitor.config.ts`, en `src/lib/tipJar.ts`, en `ios/App/App/Frangellboom.storekit` y en Xcode, **antes** de crear la app en App Store Connect: después ya no se puede cambiar.

---

## 0. Qué se revisó y qué se cambió (App Store Review Guidelines)

| Riesgo de rechazo | Regla | Qué se hizo |
|---|---|---|
| Era una web metida en una app (PWA) | **4.2** Funcionalidad mínima | App nativa con Capacitor 8. El video se procesa con **AVFoundation** usando el codificador de hardware del iPhone. Se usan el selector nativo de Apple (PHPicker) y la hoja de compartir de iOS. La página no rebota al hacer scroll. |
| Se actualizaba sola con un service worker | **2.5.2** | En iOS no hay service worker ni botón de actualizar. El build de iOS (`npm run build:ios`) ni siquiera lo incluye. |
| Necesitaba internet la primera vez (descargaba ffmpeg de ~32 MB) | **2.1** / **4.2** | En iOS no se usa ffmpeg: todo va dentro de la app y funciona sin conexión desde el primer arranque. |
| "Boomerang" es una marca de Instagram/Meta, e "Instagram" aparecía en el manifest | **5.2.1** / **5.2.5** | Dentro de la app y en la ficha se dice **"bucle" / "loop"**. El manifest y el README ya no mencionan Instagram. **No** escribas "Boomerang" ni "Instagram" en el nombre, el subtítulo, las palabras clave ni las capturas. |
| Enlace de PayPal para donar dentro de la app | **3.1.1** | En iOS se reemplaza por **"Deja una propina"**: tres compras dentro de la app, consumibles, que no desbloquean nada (StoreKit 2). En la web, PayPal sigue igual. |
| Faltaban los textos de permiso de Fotos (sin ellos la app se cierra) | **5.1.1** | `NSPhotoLibraryUsageDescription` y `NSPhotoLibraryAddUsageDescription` en inglés y español. |
| Manifiesto de privacidad | Obligatorio desde 2024 | `PrivacyInfo.xcprivacy`: sin rastreo y sin recopilar datos. |
| Pregunta de cifrado en cada subida | Exportación | `ITSAppUsesNonExemptEncryption = NO`. |
| Ícono con transparencia | Rechazo técnico | `AppIcon-1024.png` sin canal alfa (`npm run ios-assets` lo regenera desde `design/icon-source.svg`). |
| Solo iPhone, solo vertical | — | La app está diseñada para teléfono en vertical. Con iPad tendrías que hacer capturas y pruebas para iPad. |
| URLs de privacidad y soporte | Obligatorias | `public/privacy.html` y `public/support.html` se publican con el deploy de GitHub Pages. |

**Sobre el ícono:** es un diseño propio (`design/icon-source.svg`: un arco blanco sobre un degradado rosa→naranja), no viene de un banco de íconos. No copia el ícono de Boomerang de Instagram (un símbolo de infinito), así que el riesgo es bajo. Lo único parecido es que usa colores "atardecer", como la marca de Instagram.

---

## 1. Probar en tu iPhone

```bash
npm run ios
```
Compila la web para iOS, la copia al proyecto y abre **Frangellboom.xcworkspace** en Xcode. **Cada vez que cambies código React, vuelve a ejecutarlo.**

En Xcode, arriba elige tu iPhone ("@Frangellgram") y pulsa ▶︎. Prueba:
- Importar un video de tu fototeca (4K, vertical, HDR…).
- Todos los modos y calidades, y **Guardar o compartir → Guardar video** (la primera vez pide permiso para Fotos).
- El botón EN/ES y **Deja una propina**.

**Probar las propinas:** ejecútalas con ▶︎ desde Xcode (el scheme usa `Frangellboom.storekit`, una tienda de prueba donde no se cobra nada). Si abres la app de otra forma, las propinas salen como "no disponibles" hasta que existan en App Store Connect.

## 2. Acuerdos, impuestos y banco

Ya lo hiciste para PolarGrid: el acuerdo **Paid Apps** vale para todas tus apps. Solo comprueba en App Store Connect → **Business** que siga **Active**.

## 3. Crear la app en App Store Connect

1. **Apps → "+" → New App**
   - Platform: **iOS**
   - Name: **Frangellboom**
   - Primary Language: English (U.S.)
   - Bundle ID: `com.frangellcode.frangellboom` (ya quedó registrado al instalarla en tu iPhone; si no aparece, créalo en https://developer.apple.com/account/resources/identifiers con la capacidad *In-App Purchase*)
   - SKU: `frangellboom-ios`
   - User Access: Full Access
2. Agrega el español: **App Information → Localizable Information → Spanish (Mexico)** (o *Spain*).

## 4. Crear las propinas

**Monetization → In-App Purchases → "+"**, tres veces:

| Type | Reference Name | Product ID | Precio |
|---|---|---|---|
| Consumable | Small tip | `com.frangellcode.frangellboom.tip.small` | $0.99 |
| Consumable | Medium tip | `com.frangellcode.frangellboom.tip.medium` | $2.99 |
| Consumable | Large tip | `com.frangellcode.frangellboom.tip.large` | $4.99 |

En cada una:
- **Availability:** todos los países. **Price Schedule:** el precio de la tabla.
- **Localization:** EN *Small tip* / "A small thank-you. Unlocks nothing." · ES *Propina pequeña* / "Un pequeño gracias. No desbloquea nada." (lo mismo con *Medium/mediana* y *Large/grande*).
- **Review Screenshot:** una captura de la ventana "Apoya a Frangellboom" con los precios.
- **Review Notes:** `Optional tip. Consumable, unlocks no content or features.`

## 5. Privacidad

**App Privacy** → Privacy Policy URL `https://frangellcode.github.io/frangellboom/privacy.html` → **"No, we do not collect data from this app."** En la tienda saldrá **"Data Not Collected"**.

(Las páginas se publican cuando haces push a `main`. Abre las dos URLs para comprobar que cargan antes de enviar.)

## 6. Precio, edad y categoría

- **Pricing:** Free, todos los países.
- **Category:** **Photo & Video**.
- **Age Rating:** "None/No" a todo → **4+**.
- **Content Rights:** "No, it does not contain, show, or access third-party content".

## 7. Ficha de la tienda

**Capturas (obligatorio):** ya están hechas en tamaño iPhone 6.9" (1320 × 2868), sin transparencia, con el mismo estilo que las de PolarGrid (título arriba y la app en un teléfono): `docs/screenshots/app-store/English/` para English (U.S.) y `docs/screenshots/app-store/Español/` para Spanish. En App Store Connect, dentro de cada idioma, arrástralas en orden (1 → 5) a **iPhone 6.9" Display**. Usan un video generado para la app, sin contenido ni marcas de terceros. Las capturas sin marco están en `docs/screenshots/en|es/`; si cambias textos o capturas, regenera con `npm run store-screenshots` (`scripts/frame-screenshots.mjs`).

**Subtitle (máx. 30):** EN `Back-and-forth video loops` · ES `Bucles de video ida y vuelta`

**Promotional text:** EN `Turn any clip into a back-and-forth loop in full quality — 4K, 60 fps and HDR. Everything stays on your iPhone.` · ES `Convierte cualquier clip en un bucle de ida y vuelta en calidad máxima — 4K, 60 fps y HDR. Todo se queda en tu iPhone.`

**Description (EN):**
```
Frangellboom turns a moment from any video into a smooth back-and-forth loop — in the full quality your iPhone recorded it in.

PICK THE MOMENT
• Choose any video from your library
• Slide to the exact segment you want, up to 2 seconds
• See the loop live before you create it

FIVE WAYS TO LOOP
• Classic — forward and back, at normal speed or in smooth slow motion
• Ease — slows at the edges, speeds through the middle
• Freeze — holds on each end
• Pulse — a quick stutter before it rewinds
• Zoom — punches in on the way back

FULL QUALITY
• Keeps your video's resolution, frame rate and HDR — up to 4K at 60 fps
• Built on your iPhone's own video hardware: fast, even for 4K
• Slow motion stays smooth: the missing in-between frames are created on device
• Or export smaller: 2K, 1080p, 720p or 480p

PRIVATE BY DESIGN
Every video is processed on your iPhone. No account, no uploads, no tracking. Works with no internet connection.

Free, with no watermark and nothing locked. If you enjoy it, you can leave an optional tip.
```

**Description (ES):**
```
Frangellboom convierte un momento de cualquier video en un bucle de ida y vuelta, en la misma calidad con la que lo grabó tu iPhone.

ELIGE EL MOMENTO
• Escoge cualquier video de tu fototeca
• Desliza hasta el tramo exacto que quieres, de hasta 2 segundos
• Mira el bucle en vivo antes de crearlo

CINCO FORMAS DE BUCLE
• Clásico — ida y vuelta, a velocidad normal o en cámara lenta fluida
• Suave — frena en los extremos y acelera en el medio
• Pausa — se detiene en cada extremo
• Pulso — un pequeño tirón antes de volver
• Zoom — se acerca en la vuelta

CALIDAD MÁXIMA
• Mantiene la resolución, los fps y el HDR de tu video — hasta 4K a 60 fps
• Usa el hardware de video de tu iPhone: rápido, incluso en 4K
• Cámara lenta fluida: los cuadros intermedios se crean en el dispositivo
• O exporta más ligero: 2K, 1080p, 720p o 480p

PRIVADA POR DISEÑO
Cada video se procesa en tu iPhone. Sin cuenta, sin subidas, sin rastreo. Funciona sin internet.

Gratis, sin marca de agua y sin nada bloqueado. Si te gusta, puedes dejar una propina opcional.
```

**Keywords (máx. 100, sin espacios después de las comas):**
EN `loop,video loop,back and forth,reverse video,rewind,slow motion,bounce,repeat,hdr,4k,video editor`
ES `bucle,video en bucle,ida y vuelta,reversa,rebobinar,cámara lenta,rebote,hdr,4k,editor de video`

**Support URL:** `https://frangellcode.github.io/frangellboom/support.html` · **Copyright:** `2026 Frangell Vasquez`

⚠️ No uses "Boomerang" ni "Instagram" en ningún texto de la ficha ni en las capturas (regla 5.2). Tampoco menciones Android ni "la versión web" (regla 2.3.10).

## 8. Subir el binario

1. `npm run ios`.
2. En Xcode, target **Frangellboom → General**: **Version** `1.0`, **Build** `1` (súbelo en cada subida: 2, 3…).
3. Destino: **Any iOS Device (arm64)** → **Product → Archive** → **Distribute App → App Store Connect → Upload**.
4. En 10–30 minutos aparece en **TestFlight**.

## 9. Enviar a revisión

1. **Build → "+"** → el build subido.
2. **In-App Purchases → "+"** → las 3 propinas (la primera vez **tienen que ir con la app**).
3. **App Review Information** → Sign-in required: **No** → **Notes:**
   ```
   Frangellboom turns a short segment of a video into a back-and-forth loop. All video processing happens on-device with AVFoundation; the app has no backend, no accounts and collects no data.

   To test: tap "Import your video", pick any video, choose a segment, tap Next, then "Create loop". Tap "Save or share" → "Save Video" to save it to Photos.

   "Leave a tip" at the bottom of the home screen opens a tip jar with three consumable in-app purchases. Tips are optional and unlock no content or features.
   ```
4. **Add for Review → Submit for Review.** Suele tardar 24–48 h. Si hay rechazo, responde en el **Resolution Center**.

## 10. Actualizaciones

Cambia el código → `npm run ios` → sube **Version** y/o **Build** → Archive → Upload → en App Store Connect **"+" Version** → "What's New" → Submit.

---

## Antes de subir: pendientes

1. **PolarGrid:** su ficha tiene `instagram` en las palabras clave. Por la regla 5.2 es mejor quitarlo en la próxima versión.
