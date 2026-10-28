# Ancestral Dance (Spectacles 2024 build)

A Lens for **Spectacles (2024)**. Players place a shared Earth on a real surface and follow a
narrated story: they touch the Earth, pinch to heal it, receive a wrist gift, and watch the
ancestors rise and the plants grow. It plays **Individual** (solo) or **Collective**
(colocated multiplayer through SpectaclesSyncKit), and offers Replay at the end.

Two people work on this repo (Lafiya and a partner), so read "Working together" below
before you touch `Scene.scene`.

## Versions are pinned, so don't upgrade them

- **Lens Studio 5.15.4** (see `ancestors14.4.esproj`). Open the project in this exact
  version. If a newer Lens Studio re-saves the project, it rewrites most asset files.
- Kits: SIK 0.17.3, SyncKit 1.3, Surface Placement 0.5.0, **UIKit 0.1.6**. UIKit 0.1.7
  needs Text cursor APIs that LS 5.15.4 doesn't have. Don't update packages unless asked.
- This is **not** the SPECS 27 version. That one is a separate project
  (`../ancestraldance`). Port changes between the two by hand, on purpose.

## Where things are

- `Assets/Scene.scene`: the whole scene, as one large YAML file.
- `Assets/Scripts/`: the project's own scripts. Most older ones are JS with
  `//@input` comments. Newer ones are TypeScript components.
  - `GameManager.js` runs the story: UI flow, voice-over, music, captions and timing,
    the Individual/Collective mode, the host's placement, and Replay (`replayDelay`).
  - `StartMenuBridge.ts` tells GameManager which mode the SyncKit start menu picked.
  - `SurfacePlacementSync.ts` and `SurfacePlacementStyle.ts` sync the host's placement
    to the other players and restyle the Surface Placement UI to match the project.
  - `EarthHealingManager.js`, `HandEarthGlow.ts` and `EarthHandHint.ts` handle touching
    and healing the Earth and the hand hint beside it.
  - `GiftManager.js` and `WristGiftShare.ts` show the wrist gifts. In Collective, every
    player sees everyone's gift.
  - `CaptionsController.js`, `PalmController.js`, `ButtonController.js` and
    `VoiceManager.js` (ASR) handle captions, the palm menu, buttons and speech.
  - `ReplayableTweens.ts` makes the one-shot grow/shrink tween scripts replay.
- Scripts talk to each other through `global.*` hooks, for example `global.beginGame`,
  `global.onEarthTouched`, `global.onPlayerHealed`, `global.sendAncestorsRise` and
  `global.isSinglePlayerMode`. Grep for a hook before you rename or remove it.
- `*.lspkg` folders (SIK, SyncKit, UIKit, Surface Placement, LSTween, Utilities) are
  read-only packages. Change their behavior from the project's own scripts, not inside them.
- `Cache/`, `Workspaces/`, `Support/`, `PluginsUserPreferences/` and `BackUp/` are local
  and git-ignored. Lens Studio regenerates them, so don't edit or commit them.

## Working together

- **Pull before starting, commit and push when done.** The repo is
  `github.com/badchickstudios/ancestraldance-2024`, branch `main`.
- **One person in `Scene.scene` at a time.** Git can't merge two people's edits to the
  scene. Scripts and other assets can be edited in parallel.
- Before committing, check the diff of `Scene.scene`. It should only hold the changes you
  meant to make. Lens Studio sometimes re-saves unrelated values.
- Commit messages describe what changed in the experience, for example "Replay button
  delay 45s -> 15s".

## Testing

Check changes in the Lens Studio Preview first, then on the glasses. Collective mode
needs two Spectacles to test for real. In Preview, SyncKit runs a mocked solo session.
