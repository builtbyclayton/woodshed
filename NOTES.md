# v2 ideas

Things that came up while building v1. **None of these are built.** Parked here on purpose so
v1 stays the tight loop: log a session, see your progress.

Roughly ordered by how much I'd want them as the first user.

---

## Probably next

~~**Export / import JSON**~~ — **shipped.** Added before launch, because putting a tool in
front of other musicians while a cleared cache could silently wipe months of their practice
history wasn't acceptable. Import merges on `id` rather than replacing, so it can't destroy
data.

**Edit a session**
Right now the only correction is delete-and-relog. Fat-fingering 300 minutes instead of 30 is
going to happen.

**Undo after delete**
Delete is instant and permanent. A few-second undo in the toast would take the fear out of it,
and the toast component already exists.

**Practice calendar / heatmap**
A GitHub-contributions-style grid of the last few months. The streak number tells you the
current run; a heatmap shows the shape of your habit — the gaps, the good stretches. This is
the one that would be most fun to look at, and the data model already supports it with no
changes.

## Feels natural after that

**Per-area weekly goals**
"Two hours of technique a week" is a more useful commitment than one lump total. Would need a
goals object keyed by area rather than a single number.

**Trend over time**
Minutes per week for the last 8–12 weeks, as a small bar chart. Answers "am I actually ramping
up or does it just feel that way."

**Longest streak, and streak history**
Current streak is motivating right up until you break it. A personal best gives the number
somewhere to go after a miss.

~~**A session timer**~~ — **shipped 2026-07-30 as Practice Mode.** Parked at first as a
"behavioural bet," then promoted to the top of the list after the first-user verdict: the app
was boring because it was a *ledger*, not a practice tool. The practicing happened elsewhere
and the app was just data entry about it. Duolingo is sticky because the lesson lives inside
the app — the activity and the reward share a home. Practice Mode is the move that makes that
possible here.

**XP / points**
Deliberately not built yet, and the reason matters: rewards on *self-reported* minutes are
hollow. If you can type `500` into a box and collect the badge, the badge means nothing and
musicians will feel that within a week. XP is only honest on top of time that a timer actually
ran. Revisit once Practice Mode has been in real use — if it works, XP on timed minutes is
worth building; if it doesn't, XP was never the problem.

**Area archiving / merging**
After a few months there'll be a long tail of one-off areas, plus near-duplicates like
"Sight reading" and "Sightreading". Case-insensitive grouping in v1 catches some of it, not
all. Needs a merge UI.

## Further out

**Tags or categories above areas**
Group areas into technique / repertoire / theory / ear. The breakdown gets a second level.
Only worth it once there are enough areas that the flat list stops being readable.

**Goals tied to a piece**
"Giant Steps at 240bpm by October." Different shape of data than a session — it's a target with
a deadline, not a log entry. Would probably be its own view.

**Notes search**
Once there are hundreds of sessions, the notes become a practice journal worth searching.

**Multi-device sync**
The moment this needs a backend and accounts. Airtable would be the obvious fit given
everything else I build. Deliberately out of scope until localStorage genuinely hurts —
probably right after export/import stops being enough.

**PWA / offline install**
Manifest plus a service worker so it installs to the phone home screen and opens like an app.
Only worth it once the phone becomes the main place I log sessions.

---

## Deliberate v1 decisions, for the record

Not ideas — choices already made, written down so I don't relitigate them later.

- **Weeks run Monday–Sunday.** One function (`weekStart`) decides this.
- **A streak survives until yesterday.** Otherwise it reads as broken every morning before
  you've practiced, which is exactly when you need it to look alive.
- **No confirm on single delete, confirm on reset-all.** Deleting one row is cheap to redo;
  wiping everything isn't.
- **The date field won't accept future dates.** This is a log of what you did, not a plan.
- **Progress bar caps at 100% but the caption shows how far over you went.** A bar that
  overflows its track looks broken; the number shouldn't be hidden though.
- **No streak-breaking guilt copy anywhere.** Empty states are neutral. Practice trackers that
  nag are practice trackers you stop opening.
- **Discard has no confirm dialog.** It only appears on the finished screen next to Save, so
  choosing it is already deliberate — and a browser that blocks dialogs would strand you there
  with no way out.
- **Reset all leaves a running session alone.** Wiping your history shouldn't kill practice
  you're in the middle of.
