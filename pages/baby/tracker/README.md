# Baby log

A small, local web UI for tracking a newborn: feeds (bottle or breast), sleeps,
nappies, weigh-ins and expressed milk. One Docker container (FastAPI + a static, no-build
frontend) reading and writing a DuckDB file that lives on the host in `./data/`.

## Run

```sh
make up        # build + start, waits until healthy  ->  http://localhost:8765
make logs
make down
make test      # API tests (uv + pytest, temp DuckDB file per test)
```

On the home network, open `http://<this-machine's-LAN-address>:8765` on a phone
and add it to the home screen. `make up PORT=9000` (or `BABY_PORT=9000`) changes
the port; `BABY_DATA_DIR` moves the data directory.

There is no login: anyone on the network who can reach the port can read and
edit the log. Keep it on the home LAN.

## Using it

- **Start sleep / Start feed / Start expressing** begin a timed activity and switch the app to a
  fullscreen **stopwatch**: timer, Pause/Resume, Stop and Fix time. One of each
  can run at the same time (expressing during a feed or a sleep is fine). Paused time
  is excluded from the recorded duration everywhere. A breast feed asks which
  side first and has Left / Right lap buttons; the time on each side is stored
  with the feed and can be edited later. "Show dashboard" leaves the stopwatch
  (a compact running bar brings it back). Pause and side state live on the
  server, so a reload or a second phone shows the same thing. Stopping a feed
  offers the details (ml for a bottle, weight after for breast), skippable.
  A bottle feed can also record the **millilitres in the bottle** (when starting,
  stopping, adding or editing): "Millilitres taken" then starts at that amount
  when the feed stops, and the log shows "60 of 80 ml" when the two differ. Only
  the amount taken ever counts as intake.
  Stopping an express session asks for the ml expressed (also skippable; it can
  be filled in later from the log). A session that is still running is left out
  of the totals and charts until it is stopped.
- **Nappy / Weigh-in** log at the current time; the time can be changed.
  Express records ml expressed; it is never counted as intake. "Log a finished
  session instead" (or **Add an entry**) logs an express session after the fact.
- The forms ask for a **time of day only**. A new entry is put on the day being
  viewed; an edited entry keeps its own date. An end time earlier than the start
  means the next day (marked "+1 day"). The -5 min / +5 min chips carry the date
  across midnight, and **Now** sets today's date as well as the time; a small
  label beside the field names the date whenever it is not the day being
  viewed. An entry lasting a day or longer falls back to full date-and-time
  fields.
- Tap any row in the log (or a bar on the day strip) to edit or delete it.
  **Add an entry** logs something after the fact.
- Breast-feed intake is estimated as weight after minus weight before (1 g = 1 ml)
  when both weights are given. A finished breast feed without both weights is
  estimated from its length: active minutes (pauses excluded, at most 45) times
  the rate learned from weighed feeds. The rate is total ml over total active
  minutes of the 10 most recent weighed breast feeds that had ended when the
  feed started (ignoring ones with no gain, over 300 ml, or under 2 minutes),
  so weighing more feeds sharpens later estimates and never moves earlier ones.
  With fewer than 3 such feeds, or a feed of no length, it counts as a default
  **20 ml** (`BABY_BREAST_DEFAULT_ML`, 0-2000, sets this initial default; the
  Settings page can override it). No estimate is
  stored: estimates are worked out on read, so editing or deleting a weighed
  feed updates the feeds that came after it. All three are labelled as estimated
  wherever they are counted, and a running breast feed shows "about N ml so
  far" on the stopwatch once there is a rate.
- **Settings** (the cog) explains the breast feed estimate: what applies now
  with worked examples, the pooled sum behind the rate, every weighed feed with
  whether it is used or why not, and a form to change the default amount
  (0-300 ml) and to type in a rate (ml per minute, up to 20) that replaces the
  calculated one, also while there are too few weighed feeds. The 45 minute cap
  and the 1 ml floor still apply; weighed and bottle feeds are never affected.
  Each save is kept as a row with the moment it takes effect, and a feed uses
  the row in force when it started:
  - **Only feeds from now on** adds a row effective from now. Feeds that
    started earlier keep their figures (before the first row, the calculated
    rate and `BABY_BREAST_DEFAULT_ML`).
  - **Recalculate all feeds** replaces the whole history with one row
    effective from the beginning, so every unweighed breast feed is
    re-estimated.
  - **Reset to calculated** goes back to the calculated rate and the standard
    default: for all feeds it clears the history; for feeds from now on it
    adds a row with no overrides.
- **Over time** shows per-day sleep, intake, feeds, expressed ml, nappies and
  weight for the last 7/14/30 days or everything, plus a day-by-day sleep and
  feed pattern. Hover or focus a column for its readout; click it for a list of
  that day's entries (tap one to edit).
- **Zoom** on every graph (including the Today strip): pinch or ctrl+wheel to
  zoom, drag across a range to zoom to it (touch: long-press then drag, or the
  "Select range" toggle), shift+wheel or a one-finger sideways drag to pan,
  `+` / `-` / `0` on the keyboard, and Reset to go back.
- **Reminders** are things to do again and again, or once: "Vitamin D drops,
  daily", "Bath, every 2 days at 08:00", "Call the nurse, Thu 26 Nov 14:30".
  Add one from **Settings** (or the `+` on the Today card once there is one): a
  title, **Repeats** (Daily / Every 2 days / Weekly, or every N hours, days or
  weeks, optionally at a time of day) or **One time** (a date and a time), and
  optionally a description, one of 12 icons and one of 7 colours. Today lists
  them under the quick buttons, most pressing first: overdue (a filled row with
  a warning sign and "Overdue 2 h"), due ("Due now" / "Due today", heavy
  outline), coming up ("In 3 h · 20:00", "Tomorrow 8:00") and done ("Done
  8:12"). The round button ticks one off, also before it is due (the next due
  is then the occurrence after); the toast has Undo. Tap a row for its details,
  history, Pause and Delete. The Today button in the header counts what is due
  or overdue. A ticked one-time reminder stays on Today for the rest of that
  day, then moves to "Done" on Settings, where changing its date arms it again.
  **There are no notifications or sounds**: a page served over plain HTTP on
  the home network cannot send any, so a reminder is only seen when the app is
  open.

## Data

`./data/baby.duckdb` (git-ignored). Timestamps are stored in UTC; the browser
shows local time and decides where each day starts and ends. DuckDB allows one
writer, so stop the container before opening the file read-write elsewhere:

```sh
make down && duckdb data/baby.duckdb 'select * from feeds order by started_at desc limit 10'
```

Back up by copying the file while the container is stopped.

Schema changes are applied at startup as additive, idempotent migrations
(`MIGRATION` in `babytracker/db.py`: new nullable/defaulted columns and new
tables only), so a newer build can be started on an older database file.

## Updating a deployed copy

The update bundle (`baby-tracker-update.zip`) contains code only, never `data/`. `update.sh`
(also `make update`) stops the containers, snapshots the database into `backups/`, and replaces
the code from the zip; `data/` and `backups/` are never touched.

```sh
make update ZIP=~/baby-tracker-update.zip UP=1   # UP=1 also rebuilds and starts
```

The first time, the checkout has no `update.sh` yet, so pull it out of the zip first:

```sh
unzip -o -j ~/baby-tracker-update.zip baby-tracker/update.sh -d .
bash update.sh ~/baby-tracker-update.zip --up
```

## API

| Method | Path | |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/status` | in-progress sleep/feed/express (`active`) and the latest entry of each type (`last.breast` = latest finished breast feed) |
| GET | `/api/breast-rate?at=&exclude_id=` | the rate an unweighed breast feed starting at `at` would be estimated from (`ml_per_min`/`feeds` null when too few weighed feeds; `feeds` alone null when the rate was set in Settings), plus `max_seconds`, `min_ml`, `default_ml`; `exclude_id` leaves out the feed being edited |
| GET | `/api/settings/breast-estimate` | the Settings page: saved rows (`history`, newest first; `current` = the one in force now), `in_force` (source, rate, default, worked examples), the pooled sum (`pool`), the rule constants (`rule`), input `limits`, and every weighed breast feed (`weighed`, newest first) with `used` or the `reason` it is not |
| PUT | `/api/settings/breast-estimate` | `{"default_ml": 0-300\|null, "manual_rate_ml_per_min": >0-20\|null, "scope": "all"\|"future"}` (null = no override). `all` replaces the history with one row from the beginning; `future` adds a row effective from now. 422 on bad values. Returns the same body as GET |
| DELETE | `/api/settings/breast-estimate` | reset: clears the saved rows, so every feed is back on the calculated rate and `BABY_BREAST_DEFAULT_ML`. Returns the same body as GET |
| GET | `/api/events?start=&end=` | everything overlapping the window (ISO timestamps with offset) |
| GET | `/api/summary?start=&end=` | totals for the window |
| GET | `/api/daily?tz=&end=&start=` | totals per local calendar day (`tz` is an IANA zone; no `start` = since the first entry) |
| POST | `/api/sleeps`, `/api/feeds` | no `started_at` = now; no `ended_at` = in progress (409 if one already is). A bottle feed may carry `bottle_ml` (0-2000): what was in the bottle |
| POST | `/api/sleeps/{id}/stop`, `/api/feeds/{id}/stop` | end now, or at `ended_at`; feeds also accept `amount_ml`, `bottle_ml`, `weight_before_g`, `weight_after_g` (each only written when given) |
| POST | `/api/expresses` | no `started_at` (or `logged_at`) = now. No `amount_ml` = a running timer (409 if one already is; independent of sleeps and feeds). `amount_ml` (1-2000) alone = a session logged at that one moment; with `ended_at` = a finished, timed session (`ended_at` without `amount_ml` is a 422) |
| POST | `/api/expresses/{id}/stop` | end now, or at `ended_at`; optional `amount_ml` (it can be added later with PUT) |
| POST | `/api/sleeps/{id}/pause`, `/resume` (same for feeds and expresses) | pause / resume the running timer; 409 if already paused / not paused / stopped. Stopping while paused ends at the pause moment |
| POST | `/api/feeds/{id}/side` | `{"side": "left"\|"right"}` moves a running breast feed's clock to that side (same side = no-op); 409 for bottle feeds |
| POST | `/api/nappies`, `/api/weights` | no `logged_at` = now |
| PUT | `/api/{sleeps,feeds,nappies,weights,expresses}/{id}` | replace an entry |
| DELETE | `/api/{sleeps,feeds,nappies,weights,expresses}/{id}` | |
| GET | `/api/reminders` | every reminder, most pressing first, each with its `state` (`overdue`, `due`, `upcoming`, `done`, `paused`), `next_due_at`, `overdue_at`, `all_day`, `finished`, `last_completed_at` and `last_completion_id` |
| POST | `/api/reminders` | `{"title", "description"?, "unit": "hours"\|"days"\|"weeks"\|"once", "every"? (1-72 h, 1-365 d, 1-52 w), "at"?: "HH:MM", "on"?: "YYYY-MM-DD", "tz": IANA zone, "icon"?, "colour"?}`. `once` needs `on` and `at`; `at` is ignored for hours. 201 |
| PUT | `/api/reminders/{id}` | replace a reminder; changing `every`, `unit`, `at`, `on` or `tz` starts its schedule again from now (its history is kept) |
| POST | `/api/reminders/{id}/pause`, `/resume` | 409 if already paused / not paused; resuming starts the schedule again from now |
| POST | `/api/reminders/{id}/complete` | tick it off now, or at `completed_at`; returns `{reminder, completion}`. 409 while paused or already done |
| GET | `/api/reminders/{id}/completions?limit=` | its ticks, newest first (default 20, max 100) |
| DELETE | `/api/reminders/{id}/completions/{completion_id}` | undo a tick; returns the reminder |
| DELETE | `/api/reminders/{id}` | the reminder and its ticks |

Sleeps and feeds carry `paused_seconds`, `paused_at` (set while paused) and
`duration_seconds` (wall time minus pauses; null while running). Feeds also
carry `left_seconds`, `right_seconds`, `active_side`, `side_since` and
`intake_source` (`measured`, `weights`, `rate`, `manual_rate` or `default`). A
`rate` or `manual_rate` feed, and a running breast feed that will become one,
also carries `intake_rate_ml_per_min`, `intake_rate_feeds` (weighed feeds
behind the rate; null for a rate set in Settings) and
`intake_rate_max_seconds` (the cap on counted time); they are null
otherwise. A new breast feed takes
`side` to start timing on it.

A bottle feed has two amounts: `amount_ml` is what the baby took, `bottle_ml`
(optional, 0-2000, null when not recorded) is what was in the bottle. Only
`amount_ml` is intake: `intake_ml`, the summaries and the daily totals never
read `bottle_ml`, also for a feed that has no `amount_ml` (yet). The server
does not compare the two (a top-up can make taken the larger). `bottle_ml` is
ignored (stored as null) on a breast feed, on create, edit and stop alike. On
PUT, leaving the key out keeps the stored value, so a page loaded before the
field existed cannot wipe it; an explicit `null` clears it. The column is
added to an existing database at startup; old feeds read back null.

Reminders (`babytracker/reminders.py` has the rules): a day or week cadence is a
grid of occurrences in the reminder's own time zone (`tz`, sent by the browser
that saved it), starting on the day it was created or last rescheduled. With a
time it is due then and overdue an hour later; without one it is due all that
local day and overdue once the day is over. A tick counts for the latest
occurrence that has started and is not ticked, else for the next one coming,
so a late tick leaves no backlog and an early tick moves the next due to the
occurrence after. An hours cadence is due N hours after the last tick. A
`once` reminder is due at its date and time, stays overdue until ticked, and
is finished by one tick (`finished`, no `next_due_at`). Icons: `bell`, `clock`,
`droplet`, `bath`, `pill`, `thermometer`, `scissors`, `sun`, `moon`,
`calendar`, `heart`, `star`. Colours: `neutral`, `orange`, `yellow`, `green`,
`blue`, `purple`, `pink`.

Expresses carry the same timer fields (`started_at`, `ended_at`,
`paused_seconds`, `paused_at`, `duration_seconds`) plus `logged_at` (always
equal to `started_at`) and `amount_ml` (null while running, and for a stopped
session whose amount has not been given yet). A session logged at one moment,
which is every express from before they could be timed, reads as
`started_at` = `ended_at` = `logged_at` with a duration of 0. The columns are
added to an existing database at startup; old rows are not rewritten.
Summaries add `express_ml` / `express_count`, counting finished sessions only
(by the day they started).

Interactive docs: `http://localhost:8765/docs` (needs internet for its assets; the app itself does not).
