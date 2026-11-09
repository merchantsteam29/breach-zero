# BREACH: ZERO

A dark first-person horror shooter for the browser. You are trapped five floors under Ardent Biolabs after a containment breach. Find the keycards, outrun the Stalker, kill THE HOST, and survive until the freight lift reaches you.

**Play:** https://merchantsteam29.github.io/breach-zero/

![BREACH: ZERO title screen](cover.png)

## Controls

| Action | Keyboard & mouse | Controller |
| --- | --- | --- |
| Move / look | W A S D / mouse | Left / right stick |
| Shoot or swing / aim | Left click / right click | RT / LT |
| Melee (quick bash) | V or middle click | RB |
| Sprint (loud) | Shift | Click left stick |
| Jump / crouch | Space / C | A / hold B |
| Reload | R | X |
| Use (logs, breaker, lifts) | E | X when near |
| Flashlight | F | LB |
| Medkit | Q | D-pad up |
| Weapons | 1 pistol · 2 shotgun · 3 SMG · 4 crowbar · wheel | Y, D-pad left/right |
| Pause | Esc | Start |

Controllers need the standard mapping. Wheels, joysticks and other devices that report as gamepads are ignored, and an axis only counts after it has been seen centred, so nothing spins the view on its own. Settings has a "Controllers ON/OFF" switch.

## What's in it

- Five handmade floors: Cryogenics, Biohazard Research, Pump Station, Security Wing, Reactor & Surface Access. Each has keycard doors (blue, red, yellow) and a lift.
- Four monster types: husks, fast pouncing crawlers, a charging brute, and acid-spitting spitters. Some hide in the vents and drop on you when you grab a keycard.
- **The Stalker**: a tall, pale thing that appears in set scenes on floors 2 to 4. It cannot be killed. Shooting or hitting it only staggers it, so you run until it gives up.
- **THE HOST**: the reactor boss. Pull the breaker and it bursts out. It charges, fires acid volleys, calls crawlers out of the vents and gets faster as it weakens. Its glowing sacs are weak points. Kill it, then hold out until the freight lift arrives.
- Scripted scares: lights dying one by one down a room, something sprinting off into the dark ahead, a body that was not there a moment ago, footsteps right behind you, a door slamming shut with something hammering on it.
- Weapons: pistol, shotgun, SMG (found in the pump station), and a crowbar that is always with you: nearly silent, no ammo, and it staggers most things.
- Monsters hunt by sound and light. Gunshots carry down the corridors, sprinting is loud, and your flashlight beam gives you away.
- Survival mode: endless waves in the Containment Hall. Supplies come back between waves, and THE HOST turns up every fifth wave.
- Records (best times per difficulty, kills, logs found, best survival wave) and four unlockable extras: a VHS tape filter, a noir filter, an infinite flashlight and golden guns.
- Fifteen audio logs that tell what happened in the lab.
- Easy, Normal and Nightmare difficulty. A checkpoint is saved at the start of every floor.
- The menus look like a CRT security terminal, and the HUD is a wrist bio-monitor with a live heartbeat trace.
- Settings: mouse and controller sensitivity, field of view, brightness, volumes, graphics quality (Low/Medium/High), auto resolution, controllers on/off, invert Y, head bob, and reduced flashing.
- All sound is synthesised live with WebAudio, and all textures are generated in code, so there are no asset files.

## Run locally

```
node serve.js        # then open http://localhost:8080
```

Plain HTML and ES modules, with Three.js 0.160 from a CDN. There is no build step.

## Tests

```
node tools/check-maps.mjs            # every floor is finishable, doors are valid
node tools/playtest/run-all.mjs      # headless Chrome playthroughs: smoke, gameplay, features, visual (needs Chrome)
node tools/playtest/bench-full.mjs   # frame-time benchmark (BZ_URL picks the build, to compare two)
```

`?test` in the URL exposes `window.__bz` for the playtests. Screenshots go to `tools/playtest/shots/`. Headless Chrome renders in software at a few frames per second, so game time runs slowly there and frame rates mean nothing.
