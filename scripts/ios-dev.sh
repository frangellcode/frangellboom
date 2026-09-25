#!/bin/sh
# Live reload on the iPhone: points the iOS app at the Vite dev server on this
# Mac, then serves it. Open the app from Xcode (▶︎) once after running this.
# `npm run ios` (or any plain `cap sync`) points it back at the bundled files.
set -e
IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
export CAP_LIVE_URL="http://$IP:5174"
echo "Live reload at $CAP_LIVE_URL (iPhone and Mac on the same Wi-Fi)"
npx cap sync ios
exec npx vite --host --port 5174 --strictPort
