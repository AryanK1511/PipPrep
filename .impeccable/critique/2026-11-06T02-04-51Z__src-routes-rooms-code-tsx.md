---
target: rooms flow
total_score: 25
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
target_identity: "file:/Users/aryank/Developer/personal/PipPrep/src/routes/rooms.$code.tsx"
target_fingerprint: "sha256:23574fd7056ebe2ffaee954d7d277f9a1daf5519b9860567aba4825b6fd3917d"
target_path: /Users/aryank/Developer/personal/PipPrep/src/routes/rooms.$code.tsx
timestamp: 2026-11-06T02-04-51Z
slug: src-routes-rooms-code-tsx
closed: true
---
Method: dual-agent (A: /root/rooms_design_review · B: /root/rooms_detector_review)

# Rooms flow UX review

Design specificity: Keep PipPrep’s green palette, serif headings, spacing, and components. The weakness is sequencing and hierarchy, not visual identity.

| Heuristic | Score | Finding |
|---|---:|---|
| Status visibility | 3 | Current stage/readiness blockers need emphasis |
| Familiar language | 2 | Match/test/host terminology competes |
| User control | 3 | Leave, retry and end/close controls exist |
| Consistency | 3 | Components coherent; action language varies |
| Error prevention | 3 | Guarded start, risky timed handoff |
| Recognition | 2 | Prepare/ready/start/open must be inferred |
| Efficiency | 2 | Repeated manual handoff |
| Minimalism | 2 | Setup/results compete with room furniture |
| Recovery | 3 | Reconnect/retry and saved work present |
| Help | 2 | Guidance dispersed and technical |
| Total | 25/40 | Acceptable |

Cognitive load: high in host setup/completion. Too many simultaneous task groups and no dominant next action. Emotional low points: first arrival, timed handoff, buried comparison.

Strengths: clear host/join split, persistent room and shared material, private answers with explicit readiness.

## Priority issues

1. P1: Timers begin while participants remain in lobby. Automatically open the participating user’s test on start, with resume fallback. Impeccable harden.
2. P1: Setup comes after passive room information. Place stage-specific primary task first, with invitation/members secondary. Impeccable layout/clarify.
3. P1: Readiness requires inference. Show ready counts, waiting names, and clear readiness cancellation; explain disabled start. Impeccable clarify.
4. P2: Replay/setup precedes comparison. Put results first, then repeat or reveal new settings; preserve history. Impeccable distill/layout.
5. P2: Infrastructure vocabulary and match/test inconsistency burden learners. Lead with invite link, use test consistently, restrict writing note to writing. Impeccable clarify.

Personas: first-time users cannot tell who acts next; screen-reader users lack live readiness announcements; distracted mobile users can lose timed test time discovering the link.

Minor issues: singular person grammar, copy feedback reset, participant-specific writing assessment instructions, accidental member removal, early-stopped result wording.

Deterministic scan: 0 findings across rooms.index.tsx, rooms.$code.tsx, RoomStatus.tsx. Browser landing inspected independently, no overlay because evaluate is read-only. Initial flow inspection limited by development reload storm; parent production preview works and will verify full flow after changes.

Questions: should the test open automatically on start, and which rooms stages should change? User answered automatic entry and ALL OF THEM. Preserve current visual style.
