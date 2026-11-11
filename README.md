# Pink Noise Test

Test signals for checking audio lines, cables, speakers and headphones, straight from your phone or computer.

**Use it:** https://pinknoisetest.com/

- Choose **pink noise**, **white noise**, a **1 kHz tone** or a **music** track, and play it out of whatever your device is connected to: headphones, a line out, an audio interface or Bluetooth.
- Set the level in dBFS RMS, with presets at −40, −30, −20, −18, −12 and −6. The page shows where the peaks will land and warns you before the signal clips. The music track is loudness-matched, so it plays at the same level as the noise.
- Send the signal to the left channel, the right channel or both, and flip the right channel's polarity to check that a pair of speakers is wired in phase. Live meters show what's going out.
- Install it to your home screen and it works offline, so it's there when you're at a venue with no signal.

Works in any current browser on iOS, Android, Windows, macOS and Linux.

## Check it yourself: nothing is uploaded

This repository is exactly what https://pinknoisetest.com/ serves. There is no server-side code: every file here is sent to your browser as-is, and every test signal is generated on your own device.

- **The browser enforces it.** [`_headers`](_headers) gives every page a Content-Security-Policy with `connect-src 'self'` and `form-action 'none'`. That means the browser itself blocks any network request to anywhere except pinknoisetest.com. You can see the same header in your browser's developer tools (Network tab → the page request → Response headers).
- **The code is readable.** [`app.js`](app.js) is the whole app, published unminified. Noise and tones are generated with the browser's Web Audio API. If you load your own music file, it's decoded in the browser and never leaves your device.
- **No third-party scripts.** There are no trackers, analytics or external libraries. [`sw.js`](sw.js) is the service worker that keeps a copy of the page on your device so it works offline.

## Support

If Pink Noise Test saves you time, you can buy me a coffee:

[![Buy me a coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=sophtwhere&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://www.buymeacoffee.com/sophtwhere)

---

This repository contains only the published web app. Maintenance notes and tools are kept separately.
