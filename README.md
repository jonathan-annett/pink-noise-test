# pinknoisetest

A static, mobile-friendly test signal generator: pink noise, white noise, 1 kHz tone and a music track, with level presets (dBFS RMS), L/R/Both routing, right-channel polarity invert and live meters. Everything runs in the browser via the Web Audio API — no build step, no server code.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app |
| `music.mp3` | Your music test track (add this yourself) |
| `_headers` | Cloudflare response headers |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installable PWA + offline support |

## Adding the music track

Name your file `music.mp3` and put it in the repo root next to `index.html`. The app fetches it when the Music mode is selected and loudness-matches it to the chosen level. Visitors can also pick their own file from their device.

Cloudflare Pages has a 25 MB per-file limit, so keep the MP3 under that (a 2–3 minute 256 kbps MP3 is ~5 MB).

## PWA / offline

The app installs to the home screen (Android/desktop Chrome show an **Install app** button; iOS shows Share → Add to Home Screen instructions). The service worker caches the page and icons, and caches `music.mp3` the first time it's played — or straight away when running as an installed app — so all modes work offline.

If you replace `music.mp3` with a different track, bump `VERSION` in `sw.js` so installed copies pick up the new file.

## Deploy on Cloudflare Pages

1. Push this folder to a GitHub repo.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Build settings: Framework preset **None**, build command **empty**, output directory **/** .
4. Deploy, then Custom domains → add `pinknoisetest.com` (and `www`).

Every push to `main` redeploys automatically.

## Local testing

Audio needs a real HTTP origin for the `music.mp3` fetch:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.
