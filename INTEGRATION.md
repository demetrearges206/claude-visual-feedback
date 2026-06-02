# Integrating visual-feedback into `claude-codespace-starter`

**Status:** deferred — still iterating on the tool locally in `/workspaces/visual-feedback`.
Do this once the tool is dialed in. Destination is **inside the starter repo**
(not a separate repo).

## Steps (when ready)

1. **Copy the tool into the starter** as a subfolder:
   ```
   claude-codespace-starter/
     visual-feedback/         ← serve.js, overlay.js, shot.js, dev.sh, fixture.html, README.md, package.json
   ```
   (Leave out node_modules, comments.json, *.png — see .gitignore.)

2. **Add to the starter's `.devcontainer/devcontainer.json`:**
   ```jsonc
   {
     // …existing Claude/bypass/Figma config…
     "forwardPorts": [3000],
     "portsAttributes": {
       "3000": { "label": "App (visual-feedback)", "onAutoForward": "silent" }
     },
     // install tool deps + WebKit once at create time
     "postCreateCommand": "npm i -g @anthropic-ai/claude-code && cd visual-feedback && npm install && npx playwright install webkit && sudo npx playwright install-deps webkit",
     // auto-start the dev server every time the Codespace starts
     "postStartCommand": "bash visual-feedback/dev.sh \"$PWD\" 3000"
   }
   ```
   `dev.sh` takes the project root as its first arg, so `"$PWD"` serves whatever
   project used the template (not hard-coded to ferry).

3. **Port visibility:** `dev.sh` best-effort sets the port Public via the `gh`
   CLI. That needs the `codespace` scope, which the built-in token lacks. Two
   robust options for users:
   - keep the port **Private** and sign into GitHub once on the phone (works,
     more secure), or
   - run `gh auth refresh -h github.com -s codespace` once, then `dev.sh` can
     auto-public.

4. **Result on a fresh project:** Use template → open Codespace → Claude +
   bypass + Figma ready, server running, port forwarded → scan QR → triple-tap →
   comment. Zero manual steps.

## Notes / open edits the user still wants

- (track tool refinements here as they come up — e.g. better selectors for
  injected SVG map markers, which currently produce weak selectors + zero rect)
