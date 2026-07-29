# Woodshed

A practice tracker for musicians. Log what you worked on, see where your hours actually go.

No accounts, no backend, no build step. Everything lives in your browser.

## Run it

Double-click `index.html`, or:

```bash
open index.html
```

That's it. It works straight off the filesystem.

If you'd rather serve it over HTTP (nicer for devtools, and required if you ever add
anything that needs a real origin — modules, fetch, service workers):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

**Note:** `file://` and `http://localhost:8000` are separate origins, so they get separate
localStorage. Data logged one way won't show up the other way. Pick one and stick with it.

## Files

| File | What's in it |
|---|---|
| `index.html` | Markup and font links. Every element the JS touches has an `id`. |
| `styles.css` | All styling. Theme is driven by CSS custom properties in `:root` — change colors there and nothing else. |
| `app.js` | State, localStorage, date math, rendering, event handlers. Sectioned and commented. |
| `NOTES.md` | v2 ideas, deliberately not built. |

## What v1 does

- **Log a session** — what you worked on (free text, autocompletes from areas you've used
  before), minutes, date (defaults to today), and an optional note.
- **This week** — total minutes against an editable weekly goal, as a progress bar, plus
  session count this week and all-time hours.
- **Streak** — consecutive days with at least one session, ending today or yesterday.
- **Where your time goes** — all-time minutes per area, ranked, with equalizer bars.
- **Recent sessions** — full log, delete any single entry, or reset everything.
- **Backup** — export your history to a JSON file, import it back on another machine.

## Data model

Sessions live in localStorage under `woodshed.sessions.v1` as an array:

```js
{
  id:        "s-1753800000000-x7f2q",  // unique, used for delete
  area:      "Sight reading",           // free text — a skill or a song
  minutes:   45,                        // integer, 1–1440
  date:      "2026-07-29",              // LOCAL calendar date, YYYY-MM-DD
  note:      "ii-V-I in all keys",      // optional, "" when blank
  createdAt: 1753800000000              // sort tiebreaker within a day
}
```

The weekly goal is a plain number under `woodshed.goal.v1`.

Both keys are versioned (`.v1`) so a future schema change can migrate instead of clobber.

## Things worth knowing before you change it

**Dates are local, never UTC.** `toISO()` builds `YYYY-MM-DD` from local getters instead of
`toISOString()`. If you swap that, an 11pm session gets recorded as tomorrow for anyone west
of UTC and streaks silently break. Compare dates as strings — `YYYY-MM-DD` sorts correctly.

**Weeks run Monday to Sunday.** `weekStart()` is the one place that decides this. Change it
there if you want Sunday weeks.

**Areas group case-insensitively.** "scales" and "Scales" are one area in the breakdown and
autocomplete. The display name comes from whichever entry you logged most recently.

**Rendering is a full redraw.** Any change calls `save()` then `render()`, which rebuilds
every panel from state. No diffing. The dataset is tiny, so this stays fast and there's
never a sync bug between state and DOM.

**Equalizer bar heights are deterministic.** `barHeights()` hashes the area name, so
"Scales" always draws the same silhouette. The number of *lit* bars is that area's share of
your biggest area — that's the actual data. The heights are texture.

## Backing up your data

**Export a backup** at the bottom of the page downloads everything as
`woodshed-backup-YYYY-MM-DD.json`. **Import** reads one back in.

Import **merges, it never replaces.** Sessions are matched on `id`, so anything already in
the app is left alone and only genuinely new entries get added. That means restoring into an
empty browser and combining two machines are the same operation, and a mis-click can't
destroy your history. Import also accepts a bare JSON array of sessions if you ever want to
hand-roll one, and it validates every field on the way in — unreadable rows are counted and
reported, never silently dropped.

Do this occasionally. Clearing site data or switching browsers still loses anything you
haven't exported.
