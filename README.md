# claude-visual-feedback

A drop-in dev tool for **pointing Claude at specific elements** of a running web
app — instead of describing them in words or ferrying screenshots around. Plus
**WebKit (Safari-family) screenshots** so Claude can see mobile rendering itself.

Project-agnostic: it serves *any* web project and never modifies that project's
source. Built to be lifted into its own repo later.

## The loop

1. Run the dev server pointed at your project.
2. Open any page with `?comment=1` (on desktop **or** your phone). Nothing shows
   yet — the tool is *armed but hidden*.
3. **Triple-tap anywhere** to summon the Liquid-Glass toolbar.
4. Tap the **viewfinder** → tap the thing you mean. A glass sheet opens with:
   - a **layer stepper** (`‹ 2/3 ›`) to walk outward/inward through the element
     stack — use it to step off an SVG path onto the label behind it, or out to a
     parent container;
   - **`element` / `::before` / `::after` chips** when the target has a meaningful
     pseudo-element (e.g. a CSS eyebrow ribbon you can't tap directly);
   - a note field. **✓** adds it.
5. The **bubble** icon opens the comments list — each row has a **trash** icon to
   remove it. Send with **↑** (from the list or the toolbar).
6. Notes (with auto-computed CSS selectors) land in `comments.json`. Claude reads
   it and can screenshot each exact selector in WebKit.

The overlay is injected at serve time, only when `?comment=1` is present, so your
app's files are untouched and nothing ships to production.

Interaction model is deliberately unobtrusive: hidden until a 3-tap summons it,
monochrome SF-style icons, no emoji — closer to Apple Photos markup than a web
widget.

## Usage

```bash
# 1. dev server (serves any project; --root is the dir to serve)
node serve.js --root /path/to/your/project --port 3000

# visit  http://localhost:3000/<page>?comment=1   → comment mode

# 2. screenshots (WebKit = Safari-family)
node shot.js --url http://localhost:3000/page.html                 # iPhone 13 full page
node shot.js --url http://localhost:3000/page.html --desktop       # 1280x900 desktop
node shot.js --url http://localhost:3000/page.html --device "Pixel 7"
node shot.js --url http://localhost:3000/page.html --selector ".card .price"  # one element
node shot.js --url http://localhost:3000/page.html --no-cors-bypass            # disable CORS bypass
```

### CORS bypass (why data-dependent UI renders headless)

`shot.js` intercepts third-party API requests the browser would otherwise block
(APIs that send no `Access-Control-Allow-Origin`), performs them **server-side**
(Node — CORS is browser-only), and re-injects the response with permissive
headers — so the headless browser loads live API data and screenshots show the
*real* rendered UI. **Dev/test only**; it never touches the app's code or
production. Pass `--no-cors-bypass` to turn it off.

## Files

| File | Role |
|------|------|
| `serve.js` | Static server + overlay injection + `/__vf/comments` collector |
| `overlay.js` | Injected comment-mode UI; computes a unique selector per tapped element |
| `shot.js` | Playwright **WebKit** screenshotter (device presets, `--desktop`, `--selector`) |
| `test-loop.js` | Smoke test: drives the overlay headless and verifies `comments.json` |
| `comments.json` | Output Claude reads (gitignored) |

## comments.json shape

```json
[{
  "selector": "#nextCard > div.nc-times:nth-of-type(3)",
  "tag": "div",
  "text": "TO BBI 10:35 PM FROM SEA 10:00 PM",
  "rect": { "x": 37, "y": 232, "w": 316, "h": 47 },
  "viewport": { "w": 390, "h": 664, "dpr": 3 },
  "url": "/ferry.html?comment=1",
  "ts": "2026-06-01T21:53:29.239Z",
  "note": "The featured card feels a little tall on mobile."
}]
```

## Requirements

- Node + `npm install` (one dep: `playwright`)
- `npx playwright install webkit` and `sudo npx playwright install-deps webkit`

## Status

Prototype, tested against the Seattle ferry tracker. Intended to graduate into a
standalone `claude-visual-feedback` repo once the kinks are worked out.
