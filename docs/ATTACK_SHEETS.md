# Prototype attack sheets

These are implemented tuning values, not a balance claim. Positions and sizes use world units; durations below use frames at the fixed 60 Hz simulation rate. Damage and launch force scale with the victim's current damage and fighter weight. All attacks have one hit per target per activation. Allies are never valid targets.

## Relay Station blockout

```text
                          [ center platform ] y370
      [ left platform ]                              [ right platform ] y540

        Solar spawn          main deck              Lunar spawn
         x515 →           x320 ........ x1600         ← x1405         y720
                          solid deck, 64 high

       Open recovery space around the deck; lower blast boundary y1180.
```

The deck is solid on all sides. Elevated platforms are one-way, with down+jump drop-through. Blast boundaries: x−120 and x2040; y−340 and y1180. Fighter bodies are 24×40 (Rivet 32×44). Ledges at the main deck edges can be grabbed briefly while descending; repeated hanging does not refresh resources.

## Shared basic attacks

| Fighter | Base damage | Reach | Startup | Active | Recovery | Speed | Weight |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Kestrel | 9 | 64 | 7 | 6 | 17 | 300 | 1.00 |
| Rivet | 14 | 86 | 13 | 6 | 26 | 235 | 1.32 |
| Wisp | 7 | 55 | 4 | 6 | 12 | 365 | 0.78 |
| Morrow | 10 | 70 | 9 | 6 | 21 | 270 | 1.05 |

The shared attack family supports ground/air × neutral/forward/up/down. Forward increases base damage by 15%, up reduces it by 10%, and down increases it by 10%. Up/down use vertical hit regions; neutral/forward use a facing region. Horizontal attacks launch outward and upward. Air-down can spike. Each fighter has different timing, damage, reach, mass, speed, jump strength, and special moves; basic animations are placeholder procedural poses.

## Specials

| Fighter / input | Action | Damage | Startup / active / recovery (frames) | Constraints and counterplay |
| --- | --- | --- | --- | --- |
| Kestrel / neutral K | Hold/release charged cannon | 8–24 | 4 / 5 / 16 after charge | Up to0.85s charge, slow movement while charging; shot life0.85s, speed660; visible anticipation |
| Kestrel / side K | Burst dash | 11 | 2 / 11 / 15 | Forward momentum; vulnerable recovery |
| Kestrel / down K | Radial pulse | 13 | 12 / 7 / 18 | Reach115, lifts opponents; long utility cooldown |
| Rivet / neutral K | Hammer sweep | 22 | 16 / 8 / 25 | Reach112; slow startup |
| Rivet / side K | Magnetic pull | 6 | 13 / 8 / 24 | Reach175 facing region; pulls enemies toward user |
| Rivet / down K | Shockwave | 16 | 18 / 6 / 24 | Traveling wave life0.8s, speed500; jumping clears it |
| Wisp / neutral K | Twin blade sweep | 10 | 4 / 6 / 11 | Reach80; short range |
| Wisp / side K | Blink dash | 10 | 2 / 8 / 12 | Fast movement with collision, cannot teleport through solid geometry |
| Wisp / down K | Counter stance | 17 on counter | 0 / 13 / 29 | Counter window0.22s, punishable recovery, longer utility cooldown |
| Morrow / neutral K | Arcing shard | 12 | 9 / 6 / 15 | Life1.2s, horizontal speed490, initial vertical speed−230 and gravity450 |
| Morrow / side K | Delayed radial burst | 18 | 27 / 7 / 18 | Reach95, visible long startup; stay clear or interrupt |
| Morrow / down K | Slowing field | — | 14 / 3 / 15 | Radius125, life3s, enemy movement×0.6; one per owner, no stacking |
| All / up K | Recovery strike | Fighter base | 0 / 15 / 13 | Once per airtime; vertical boost Kestrel820/Rivet940/Wisp770/Morrow800, limited horizontal input |

Special cooldown starts on activation:0.85s normally,2.5s for down specials. Up recovery uses a separate once-per-airtime resource and does not require the ordinary special cooldown. Projectiles cap at three per owner and vanish on owner's life loss. Fields and projectiles are also cleared when the match ends.

## Defense and movement

Ground jump and one air jump, variable jump release, acceleration/braking, and air steering are shared. Weight changes launch force, not gravity. Guard drains16 units/second plus2.7×incoming damage, breaks for1s, then regenerates after a delay at25 units/second. Dodges have a short invulnerable portion within a0.32s action and a0.8s reuse lock; aerial dodge is once per airtime. Landing refreshes air jump, recovery, and aerial dodge. Guard covers all sides in this prototype.

## Tuning limitations

No final animation assets, multi-hit attacks, grabs, collision between fighters, hit-pause, or rollback. The moves above are the prototype interpretation of the roster; tune with actual team play before adding content. Recovery effects share the same basic strike; each fighter's directional air steering and boost differ. Runtime values in `shared/game.ts` and `shared/simulation.ts` are authoritative if this sheet drifts.
