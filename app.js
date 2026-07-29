/* ============================================================
   WOODSHED — practice tracker
   Vanilla JS, no dependencies. Everything lives in localStorage.

   Flow of the app:
     load()  ->  read state from localStorage
     render() -> redraw every panel from that state
     any change -> mutate state, save(), render()

   There's no diffing or virtual DOM. The dataset is small enough
   that a full redraw on every change is simple and fast.
   ============================================================ */

/* ------------------------------------------------------------
   1. STORAGE
   ------------------------------------------------------------ */

const KEY_SESSIONS = 'woodshed.sessions.v1';
const KEY_GOAL     = 'woodshed.goal.v1';
const DEFAULT_GOAL = 300; // minutes per week (5 hours)

/**
 * A session looks like this:
 * {
 *   id:        "s-1753800000000-x7f2q",  unique, used for delete
 *   area:      "Sight reading",          free text — a skill or a song
 *   minutes:   45,                       integer 1–1440
 *   date:      "2026-07-29",             LOCAL calendar date, YYYY-MM-DD
 *   note:      "ii-V-I in all keys",     optional, "" when blank
 *   createdAt: 1753800000000             sort tiebreaker inside one day
 * }
 */
let sessions = [];
let weeklyGoal = DEFAULT_GOAL;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_SESSIONS) || '[]');
    // Defend against hand-edited or partially-written storage
    sessions = Array.isArray(raw) ? raw.filter(isValidSession) : [];
  } catch (err) {
    console.warn('Could not read saved sessions, starting empty.', err);
    sessions = [];
  }

  const savedGoal = parseInt(localStorage.getItem(KEY_GOAL), 10);
  weeklyGoal = Number.isFinite(savedGoal) && savedGoal > 0 ? savedGoal : DEFAULT_GOAL;
}

function isValidSession(s) {
  return s
    && typeof s.id === 'string'
    && typeof s.area === 'string'
    && typeof s.date === 'string'
    && Number.isFinite(s.minutes);
}

function save() {
  try {
    localStorage.setItem(KEY_SESSIONS, JSON.stringify(sessions));
    localStorage.setItem(KEY_GOAL, String(weeklyGoal));
  } catch (err) {
    // Realistically only hits if storage is full or disabled (private mode)
    console.error('Could not save.', err);
    toast("Couldn't save — is localStorage blocked?");
  }
}

/* ------------------------------------------------------------
   2. DATE HELPERS

   Everything is done in LOCAL time on purpose. Using
   toISOString() would push a 11pm session into tomorrow for
   anyone west of UTC, which would quietly break streaks.
   ------------------------------------------------------------ */

/** Date object -> "YYYY-MM-DD" in local time. */
function toISO(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" -> Date at local midnight. */
function fromISO(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayISO() {
  return toISO(new Date());
}

/** Shift an ISO date string by n days (n can be negative). */
function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Monday of the week containing `iso`. Weeks run Mon–Sun. */
function weekStart(iso) {
  const d = fromISO(iso);
  const dow = d.getDay();               // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;  // Sunday belongs to the week that started Monday
  d.setDate(d.getDate() - back);
  return toISO(d);
}

/** "45" -> "45m", "150" -> "2h 30m", "120" -> "2h" */
function formatMinutes(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "Today", "Yesterday", otherwise "Wed, Jul 29" */
function formatDate(iso) {
  const today = todayISO();
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  return fromISO(iso).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

/* ------------------------------------------------------------
   3. DERIVED DATA
   These read `sessions` and compute; they never mutate it.
   ------------------------------------------------------------ */

/**
 * Total minutes and session count for the current Mon–Sun week.
 */
function weekTotals() {
  const start = weekStart(todayISO());
  const end = addDays(start, 6);
  const inWeek = sessions.filter(s => s.date >= start && s.date <= end); // ISO strings sort correctly
  return {
    minutes: inWeek.reduce((sum, s) => sum + s.minutes, 0),
    count: inWeek.length
  };
}

/**
 * Consecutive days with at least one session, ending today or
 * yesterday. Yesterday counts as still alive so the streak
 * doesn't look broken before you've practiced today.
 */
function currentStreak() {
  if (sessions.length === 0) return 0;

  const days = new Set(sessions.map(s => s.date));
  const today = todayISO();
  const yesterday = addDays(today, -1);

  // Pick the anchor: today if it's logged, else yesterday, else the streak is dead
  let cursor;
  if (days.has(today)) cursor = today;
  else if (days.has(yesterday)) cursor = yesterday;
  else return 0;

  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * All-time minutes per practice area, ranked high to low.
 * Areas group case-insensitively ("scales" and "Scales" are one
 * area) but display the most recently used spelling.
 */
function areaTotals() {
  const map = new Map(); // lowercased name -> { label, minutes, lastUsed }

  for (const s of sessions) {
    const key = s.area.trim().toLowerCase();
    if (!key) continue;

    const entry = map.get(key) || { label: s.area, minutes: 0, lastUsed: 0 };
    entry.minutes += s.minutes;
    // Keep the spelling from the most recent entry for this area
    if (s.createdAt >= entry.lastUsed) {
      entry.label = s.area;
      entry.lastUsed = s.createdAt || 0;
    }
    map.set(key, entry);
  }

  return [...map.values()].sort((a, b) => b.minutes - a.minutes);
}

/* ------------------------------------------------------------
   4. EQUALIZER BARS

   Each area gets a strip of bars. The bar HEIGHTS are random-
   looking but derived from the area name, so "Scales" always
   draws the same silhouette. The number of LIT bars is that
   area's share of your biggest area.
   ------------------------------------------------------------ */

const EQ_BARS = 24;

/** Cheap deterministic string hash (FNV-1a). */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Array of bar heights (22–100%) that's stable for a given name. */
function barHeights(name) {
  const seed = hashString(name.toLowerCase());
  const heights = [];
  for (let i = 0; i < EQ_BARS; i++) {
    // Mix the seed with the index so neighbouring bars differ
    const mixed = (Math.imul(seed ^ (i + 1), 2654435761) >>> 0) % 79;
    heights.push(22 + mixed);
  }
  return heights;
}

/* ------------------------------------------------------------
   5. DOM REFERENCES
   ------------------------------------------------------------ */

const el = {
  form:          document.getElementById('logForm'),
  area:          document.getElementById('area'),
  minutes:       document.getElementById('minutes'),
  date:          document.getElementById('date'),
  note:          document.getElementById('note'),
  formError:     document.getElementById('formError'),
  areaOptions:   document.getElementById('areaOptions'),

  streak:        document.getElementById('streak'),
  streakNum:     document.getElementById('streakNum'),
  streakPlural:  document.getElementById('streakPlural'),

  goalInput:     document.getElementById('goalInput'),
  weekMinutes:   document.getElementById('weekMinutes'),
  weekOf:        document.getElementById('weekOf'),
  weekBar:       document.getElementById('weekBar'),
  weekFill:      document.getElementById('weekFill'),
  weekCaption:   document.getElementById('weekCaption'),
  weekSessions:  document.getElementById('weekSessions'),
  allTimeHours:  document.getElementById('allTimeHours'),
  allTimeSessions: document.getElementById('allTimeSessions'),

  breakdown:     document.getElementById('breakdown'),
  sessionList:   document.getElementById('sessionList'),
  resetAll:      document.getElementById('resetAll'),
  exportBtn:     document.getElementById('exportBtn'),
  importBtn:     document.getElementById('importBtn'),
  importFile:    document.getElementById('importFile'),
  toast:         document.getElementById('toast')
};

/* ------------------------------------------------------------
   6. RENDER
   ------------------------------------------------------------ */

function render() {
  renderStreak();
  renderWeek();
  renderBreakdown();
  renderSessions();
  renderAutocomplete();
}

function renderStreak() {
  const streak = currentStreak();
  el.streakNum.textContent = streak;
  el.streakPlural.textContent = streak === 1 ? '' : 's';
  el.streak.classList.toggle('is-live', streak > 0);
}

function renderWeek() {
  const { minutes, count } = weekTotals();
  const pct = Math.min(100, Math.round((minutes / weeklyGoal) * 100));
  const complete = minutes >= weeklyGoal;

  el.weekMinutes.textContent = minutes;
  el.weekOf.textContent = `of ${weeklyGoal} min`;
  el.goalInput.value = weeklyGoal;

  el.weekFill.style.width = pct + '%';
  el.weekBar.classList.toggle('is-complete', complete);
  el.weekBar.setAttribute('aria-valuenow', pct);

  // Caption gives the number some meaning instead of just repeating it
  if (minutes === 0) {
    el.weekCaption.textContent = 'Nothing logged yet this week.';
  } else if (complete) {
    const over = minutes - weeklyGoal;
    el.weekCaption.textContent = over === 0
      ? 'Goal hit exactly. Nice.'
      : `Goal hit, ${formatMinutes(over)} over.`;
  } else {
    el.weekCaption.textContent = `${pct}% there — ${formatMinutes(weeklyGoal - minutes)} to go.`;
  }

  const allMinutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
  el.weekSessions.textContent = count;
  el.allTimeHours.textContent = (allMinutes / 60).toFixed(1);
  el.allTimeSessions.textContent = sessions.length;
}

function renderBreakdown() {
  const areas = areaTotals();
  el.breakdown.innerHTML = '';

  if (areas.length === 0) {
    el.breakdown.innerHTML =
      '<p class="empty">Log a few sessions and this fills in with where your hours actually go.</p>';
    return;
  }

  const max = areas[0].minutes; // ranked, so the first one is the biggest
  const grandTotal = areas.reduce((sum, a) => sum + a.minutes, 0);

  areas.forEach((area, index) => {
    const row = document.createElement('div');
    row.className = 'area' + (index === 0 ? ' area--top' : '');

    const name = document.createElement('span');
    name.className = 'area__name';
    name.textContent = area.label;

    const time = document.createElement('span');
    time.className = 'area__time';
    const share = Math.round((area.minutes / grandTotal) * 100);
    time.textContent = `${formatMinutes(area.minutes)} · ${share}%`;

    // Equalizer strip
    const eq = document.createElement('div');
    eq.className = 'eq';
    const heights = barHeights(area.label);
    const lit = Math.max(1, Math.round((area.minutes / max) * EQ_BARS));

    heights.forEach((h, i) => {
      const bar = document.createElement('span');
      bar.className = 'eq__bar' + (i < lit ? ' is-lit' : '');
      bar.style.height = h + '%';
      eq.appendChild(bar);
    });

    row.append(name, time, eq);
    el.breakdown.appendChild(row);
  });
}

function renderSessions() {
  el.sessionList.innerHTML = '';

  if (sessions.length === 0) {
    el.sessionList.innerHTML = '<p class="empty">No sessions yet. Log your first one.</p>';
    return;
  }

  // Newest first; within one day, most recently entered first
  const sorted = [...sessions].sort((a, b) =>
    b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)
  );

  for (const s of sorted) {
    const row = document.createElement('div');
    row.className = 'session';

    const main = document.createElement('div');
    main.className = 'session__main';

    const area = document.createElement('div');
    area.className = 'session__area';
    area.textContent = s.area;

    const meta = document.createElement('div');
    meta.className = 'session__meta';
    meta.textContent = formatDate(s.date);

    main.append(area, meta);

    if (s.note) {
      const note = document.createElement('div');
      note.className = 'session__note';
      note.textContent = s.note;
      main.appendChild(note);
    }

    const mins = document.createElement('span');
    mins.className = 'session__mins';
    mins.textContent = formatMinutes(s.minutes);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'session__del';
    del.textContent = '×';
    del.title = 'Delete this session';
    del.setAttribute('aria-label', `Delete ${s.area} on ${formatDate(s.date)}`);
    del.addEventListener('click', () => deleteSession(s.id));

    row.append(main, mins, del);
    el.sessionList.appendChild(row);
  }
}

/** Feed the <datalist> with previously used areas, most-practiced first. */
function renderAutocomplete() {
  el.areaOptions.innerHTML = '';
  for (const area of areaTotals()) {
    const opt = document.createElement('option');
    opt.value = area.label;
    el.areaOptions.appendChild(opt);
  }
}

/* ------------------------------------------------------------
   7. ACTIONS
   ------------------------------------------------------------ */

function addSession(area, minutes, date, note) {
  sessions.push({
    id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    area,
    minutes,
    date,
    note,
    createdAt: Date.now()
  });
  save();
  render();
}

function deleteSession(id) {
  sessions = sessions.filter(s => s.id !== id);
  save();
  render();
  toast('Session deleted');
}

function resetAll() {
  const ok = confirm(
    `Delete all ${sessions.length} session${sessions.length === 1 ? '' : 's'}?\n\n` +
    'This clears everything permanently and cannot be undone.'
  );
  if (!ok) return;

  sessions = [];
  save();
  render();
  toast('Everything cleared');
}

/* ------------------------------------------------------------
   7b. BACKUP: EXPORT / IMPORT

   localStorage is one browser deep — clearing site data wipes
   everything. These two make your history portable, which also
   makes it possible to move between machines.
   ------------------------------------------------------------ */

const EXPORT_FORMAT = 1;

/** Download the whole dataset as a JSON file. */
function exportData() {
  if (sessions.length === 0) {
    toast('Nothing to export yet');
    return;
  }

  const payload = {
    app: 'woodshed',
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    weeklyGoal,
    sessions
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `woodshed-backup-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(url);

  toast(`Exported ${sessions.length} session${sessions.length === 1 ? '' : 's'}`);
}

/**
 * Coerce anything that came out of a file into a session we trust,
 * or return null. Import is the one place untrusted data gets in.
 */
function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const area = String(raw.area || '').trim().slice(0, 60);
  const minutes = Math.round(Number(raw.minutes));
  const date = String(raw.date || '');

  if (!area) return null;
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  return {
    id: typeof raw.id === 'string' && raw.id
      ? raw.id
      : `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    area,
    minutes,
    date,
    note: String(raw.note || '').slice(0, 280),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
  };
}

/**
 * Merge a backup into what's already here, matching on id.
 * Merging rather than replacing means import can never destroy
 * data — restoring into an empty app and combining two machines
 * are the same operation.
 */
function importData(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    toast("That file isn't valid JSON");
    return;
  }

  // Accept either a full export or a bare array of sessions
  const incoming = Array.isArray(parsed) ? parsed : parsed && parsed.sessions;
  if (!Array.isArray(incoming)) {
    toast("That doesn't look like a Woodshed backup");
    return;
  }

  const existingIds = new Set(sessions.map(s => s.id));
  let added = 0;
  let duplicate = 0;  // already here — expected when re-importing your own backup
  let invalid = 0;    // couldn't be read as a session at all

  for (const raw of incoming) {
    const session = normalizeSession(raw);
    if (!session) { invalid++; continue; }
    if (existingIds.has(session.id)) { duplicate++; continue; }

    sessions.push(session);
    existingIds.add(session.id);
    added++;
  }

  // Only take the goal from a real export, and only if it's sane
  if (parsed && !Array.isArray(parsed)) {
    const goal = parseInt(parsed.weeklyGoal, 10);
    if (Number.isFinite(goal) && goal > 0) weeklyGoal = goal;
  }

  save();
  render();

  // Say what actually happened — "skipped" reads as data loss if it
  // doesn't distinguish "you already had it" from "I couldn't read it"
  const notes = [];
  if (duplicate > 0) notes.push(`${duplicate} already here`);
  if (invalid > 0) notes.push(`${invalid} unreadable`);
  const detail = notes.length ? ` (${notes.join(', ')})` : '';

  if (added === 0) {
    if (duplicate > 0 && invalid === 0) toast('Already had all of those');
    else if (invalid > 0) toast(`Nothing imported — ${invalid} entr${invalid === 1 ? 'y' : 'ies'} unreadable`);
    else toast('Nothing to import');
  } else {
    toast(`Imported ${added} session${added === 1 ? '' : 's'}${detail}`);
  }
}

/* ------------------------------------------------------------
   8. EVENTS
   ------------------------------------------------------------ */

el.form.addEventListener('submit', event => {
  event.preventDefault();

  const area = el.area.value.trim();
  const minutes = parseInt(el.minutes.value, 10);
  const date = el.date.value;
  const note = el.note.value.trim();

  // Validate by hand so the messages sound like the app, not the browser
  if (!area) return showError('What did you work on?');
  if (!Number.isFinite(minutes) || minutes < 1) return showError('Minutes needs to be at least 1.');
  if (minutes > 1440) return showError("That's more than a day. Check the minutes.");
  if (!date) return showError('Pick a date.');

  showError(null);
  addSession(area, minutes, date, note);

  // Reset for the next entry but keep the date — people often log a few at once
  el.form.reset();
  el.date.value = date;
  el.area.focus();

  toast(`Logged ${formatMinutes(minutes)} of ${area}`);
});

function showError(message) {
  el.formError.textContent = message || '';
  el.formError.hidden = !message;
}

// Weekly goal edits save as you type (debounced by the browser's input event
// being cheap here) and again on blur, so a half-typed number never sticks.
el.goalInput.addEventListener('input', () => {
  const value = parseInt(el.goalInput.value, 10);
  if (Number.isFinite(value) && value > 0) {
    weeklyGoal = value;
    save();
    renderWeek();
  }
});

el.goalInput.addEventListener('blur', () => {
  // Snap back if they left it empty or nonsense
  el.goalInput.value = weeklyGoal;
});

el.resetAll.addEventListener('click', resetAll);

el.exportBtn.addEventListener('click', exportData);

// The real <input type="file"> stays hidden; the styled button drives it
el.importBtn.addEventListener('click', () => el.importFile.click());

el.importFile.addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => importData(reader.result);
  reader.onerror = () => toast("Couldn't read that file");
  reader.readAsText(file);

  // Clear it so picking the same file twice still fires a change event
  event.target.value = '';
});

/* ------------------------------------------------------------
   9. TOAST
   ------------------------------------------------------------ */

let toastTimer;
function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2200);
}

/* ------------------------------------------------------------
   10. BOOT
   ------------------------------------------------------------ */

load();
el.date.value = todayISO();  // date field defaults to today
el.date.max = todayISO();    // no logging practice you haven't done yet
render();
