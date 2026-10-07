#!/bin/sh
# Live reload on the iPhone: points the iOS app at the Vite dev server on this
# Mac, then serves it. Open the app from Xcode (▶︎) once after running this.
# `npm run ios` (or any plain `cap sync`) points it back at the bundled files.
set -e
IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
# 5175, not the usual 5174: orobellya's dev server (another project on this
# Mac) owns 5174 and frees it whenever it starts, which kills anything else
# listening there.
PORT=5175
export CAP_LIVE_URL="http://$IP:$PORT"
echo "Live reload at $CAP_LIVE_URL (iPhone and Mac on the same Wi-Fi)"
npx cap sync ios
exec npx vite --host --port $PORT --strictPort
