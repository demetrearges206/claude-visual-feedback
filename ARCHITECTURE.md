# Visual-Feedback System — architecture, status & update model

This is the formal record of what we've built and the plan for decoupling the
comment system from any one project and keeping it a *living*, centrally-updatable
tool across all future projects.

---

## 1. The two-repo system (and why it's two)

There are **two separate master repos**, with two different update scopes. Conflating
them is the source of the "how does it stay updated" confusion.

| Repo | What it is | How it reaches a project | Update scope |
|------|-----------|--------------------------|--------------|
| **`claude-codespace-starter`** | The project *template* (devcontainer, Claude config, bypass mode, Figma MCP, generic CLAUDE.md) | **Copied once** when you click "Use this template" | **Future projects only** — template copies do NOT back-propagate |
| **`claude-visual-feedback`** | The comment + screenshot *tool* (serve.js, overlay.js, shot.js, dev.sh) | **Cloned live** into every Codespace by the devcontainer | **All projects** — pull/rebuild gets the latest |

**Key idea:** the tool must NOT be vendored (copied) into the template, or it would
freeze at copy time. It lives in its **own repo**, and each project's Codespace
**clones the latest** at create time. That's what makes it a living dependency
instead of a one-time snapshot.

```
   claude-codespace-starter (template)         claude-visual-feedback (tool, living)
            │  used to create                              ▲
            ▼                                              │ devcontainer clones latest
   your-new-project (repo)  ──opens Codespace──►  /workspaces/visual-feedback (a clone)
```

---

## 2. How a project's Codespace is wired (target state)

The starter's `.devcontainer/devcontainer.json` does, on create:
1. Install the Claude CLI + extension, set bypass mode (already in starter).
2. **Clone the tool:** `git clone https://github.com/<you>/claude-visual-feedback /workspaces/visual-feedback`
3. Install tool deps once: `npm i` + `npx playwright install webkit` + deps.
4. (optional) `postStartCommand: bash /workspaces/visual-feedback/dev.sh "$PWD" 3000`
   so the comment server auto-starts and the port forwards on every Codespace start.

Result for any new project: open Codespace → Claude + bypass + Figma ready, comment
tool present and running, scan QR → comment. Zero manual setup.

---

## 3. The living-update model (the important part)

Because `/workspaces/visual-feedback` in each Codespace is a **clone of the tool's
own repo**, the tool and the project are two independent git repos sitting side by
side. You edit whichever one you mean to change.

**To improve the tool from inside any project and make it global:**
```bash
cd /workspaces/visual-feedback        # this is the tool's repo clone, not your project
# ...edit overlay.js / serve.js / etc., test with dev.sh...
git add -A && git commit -m "overlay: <change>"
git push                              # pushes to claude-visual-feedback = the master
```
That push updates the **single source of truth**. From then on:
- **New** Codespaces clone the new version automatically.
- **Existing** Codespaces get it with `git -C /workspaces/visual-feedback pull`
  (or on next container rebuild).

So the workflow is: *edit the tool's clone → push → it's global.* The project you
happened to be in is irrelevant — you were editing the tool repo, which lives
alongside the project, not inside it.

**Two scopes to keep straight:**
- Improving the **tool** (`claude-visual-feedback`) → reaches **all** projects (live clone).
- Improving the **template** (`claude-codespace-starter`, e.g. the devcontainer) →
  reaches **future** projects only (template copy).

---

## 4. What's built so far (status)

### Tool — `visual-feedback/`
- **serve.js** — static server for any project; injects `overlay.js` only on `?comment=1`;
  collects comments to `comments.json` (each Send *replaces*, so no stale pile-up).
- **overlay.js** — the comment UI: hidden until a 3-tap summon; **Liquid-Glass**,
  monochrome/Apple-native (decoupled from any project's palette); individual glass
  circles with close pinned right; comment count shown as a number; **whole-page
  comment** mode (`scope:'page'`); compact sheet (info-left · text · ✓-in-box, small
  floating close); **16px input** (kills iOS auto-zoom); **Parent/Child layer stepper**
  with disabled states; `::before`/`::after` pseudo-element targeting; per-comment
  delete; send-from-list; **absolute-doc-coords highlight** (scrolls with page, no
  jitter); keyboard-aware sheet positioning + scroll-selected-into-view.
- **shot.js** — Playwright **WebKit** screenshotter (device/`--desktop`/`--selector`),
  with a default **CORS bypass** so headless can render live third-party-API data.
- **dev.sh** — one-command resume: start server + best-effort public port + print URL/QR.
- **fixture.html** + **test-loop.js** — deterministic headless test of the full loop.

### Ferry app changes driven by tool feedback
- **r78** — removed the card's "as of HH:MM" stamp; header shows the refresh clock
  time; vessel-popup ETA falls back to scheduled arrival instead of "—".
- **r79** — eyebrow ribbon integrated (gradient fading into the card top vs a glowing
  bar resting on it).
- **r80** — card stability: featured-vessel **hysteresis** (adopt a new boat only
  after 2 consecutive polls) + **sailing-lock** (anchor the active sailing to the
  underway boat's actual trip). Observed stable across a real arrival→dock cycle.

### Environment / infra
- `claude-codespace-starter` private template repo (Claude CLI+ext, bypass mode,
  Figma MCP, generic CLAUDE.md).
- Port-forward + QR workflow for phone testing; `gh` with `codespace` scope for
  public-port toggling.
- Documented the **CORS** model (browser-enforced; server-side always works) and the
  reusable bypass in `shot.js`.

---

## 5. Decoupling steps (to execute when greenlit)

1. `git init` in `visual-feedback/`, create repo `claude-visual-feedback`, push.
2. Add the clone + dep-install + (optional) autostart to the starter's devcontainer.
3. Verify: spin a fresh project from the template → confirm the tool clones and runs.
4. Going forward: edit the tool in its clone, push → global. (See §3.)

### Open questions / alternatives considered
- **Distribution:** chosen = own repo + devcontainer clone (editable + living).
  Alternatives: git submodule (fiddly), `npx github:...` (always-latest runtime but
  not locally editable). Revisit if the workflow needs change.
- **Existing-Codespace refresh:** simplest is `git -C /workspaces/visual-feedback pull`;
  could add a tiny `vf-update` alias.
