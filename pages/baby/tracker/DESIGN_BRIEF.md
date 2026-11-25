# Design brief: "Baby log", a newborn tracking dashboard

Design a web UI for two sleep-deprived parents tracking their newborn's feeds, sleeps, nappies and weight. It is used mostly one-handed on a phone at 3am on the home wifi, and occasionally on a desktop as a glanceable dashboard. It should feel calm, deliberate and well crafted, not like a default form.

## Constraints

- Mobile-first and responsive; it must also work as a two-column desktop dashboard.
- Dark theme by default, with a light theme and a manual toggle.
- Large touch targets (roughly 56–68px for primary actions) and no hover-only interactions.
- Plain HTML/CSS/vanilla JS, no build step, no CDN or web fonts (it must work offline), charts as inline SVG or positioned HTML.
- Each event type has one consistent colour used everywhere (cards, timeline, charts, log): sleep, feed, nappy-wet, nappy-dirty, weight. Colours must stay distinguishable in both themes, and identity must never rely on colour alone (pair it with an icon, label or shape).
- Times display in the device's local time and format; weights are entered in grams and shown in kg.

## Event types

- **Sleep**: start and end time, optional notes.
- **Feed**: bottle or breast, start and end time. Bottle records ml taken. Breast records baby weight before and after; intake is estimated as after minus before (1 g = 1 ml) and must always be labelled as estimated.
- **Nappy**: a moment in time; wet, dirty or both; a dirty nappy is small or big.
- **Weigh-in**: a moment in time; weight in grams.

## View 1: Today

1. **Day navigator**: previous/next day, a large "Today" / "Yesterday" / date title, and a "Back to today" shortcut when viewing a past day.
2. **Happening now**: the loudest element on the page. Any in-progress sleep or feed appears as a card with its type, "since 4:05 am", a very large live timer, a big full-width Stop button and a small "Fix time" control. A sleep and a feed can run at once; two of the same type cannot.
3. **Quick actions**: four large buttons: Start sleep, Start feed, Nappy, Weigh-in. A start button disappears while that activity is running. Hidden on past days.
4. **Since-last row**: "Last feed began 1h 12m ago", "Last nappy 40m ago", "Awake 2h 05m" (or "Asleep 35m" / "Feeding now"), ticking live.
5. **Totals for the day**: feeds (count, bottle/breast split), intake in ml (with how much is estimated), sleep total (and number of sleeps), wet nappies, dirty nappies, latest weight.
6. **Day at a glance**: a 24-hour strip from midnight to midnight with one lane each for sleep (bars), feeds (bars) and nappies (dots: wet, dirty or both), hour gridlines, and a "now" marker. Tapping a bar or dot opens it for editing.
7. **Log**: the day's entries, newest first. Each row shows time, type icon, a title ("Bottle, 80 ml", "Breast, about 45 ml", "Wet and dirty (big)", "Weighed 3.545 kg", "Sleep") and a detail line (duration, end time, notes). The whole row is tappable to edit. An "Add an entry" button logs something after the fact.

## View 2: Over time

- A range selector: 7 days, 14 days, 30 days, All.
- One chart per measure, each with a title, a one-line summary (for example an average) and a readout that shows a day's values when that day is tapped:
  - Sleep hours per day.
  - Intake ml per day, split into bottle and breast (estimated).
  - Feeds per day, split into bottle and breast.
  - Nappies per day, wet and dirty side by side.
  - Weight curve.
- A **sleep and feed pattern grid**: one row per day, 24 hours across, sleep bands and feed marks, newest day at the top, so rhythms are visible at a glance.
- Every chart needs a clear empty state.

## Interactions and sheets

Bottom sheets on phones, centred dialogs on desktop.

- **Start sleep**: one tap, starts immediately.
- **Start feed**: choose bottle or breast (default to the last kind used); breast optionally takes weight before; includes a "Log a finished feed instead" escape.
- **Stop sleep**: one tap.
- **Stop feed**: the end time is recorded immediately, then a sheet offers the remaining details (ml for bottle; weight after for breast). Everything is optional and skippable, so stopping is never blocked.
- **Nappy**: Wet and Dirty toggles (both allowed); the small/big choice appears only when Dirty is on; time defaults to now and is editable.
- **Weigh-in**: grams, time defaulting to now.
- **Edit any entry**: the same form with all fields including start and end times; leaving the end time empty means "still going". Fixing times must be easy.
- **Delete**: inside the edit sheet, with an explicit confirm step ("Delete this sleep? It can't be undone." / Keep it / Delete sleep).
- **Add an entry**: pick a type, then the full form with sensible default times.
- **Feedback**: brief toasts for confirmations ("Sleep stopped after 1h 20m") and clear, specific error messages.

## States to design

- Nothing logged yet (today, a past day, and each chart).
- One activity running; both running.
- A sleep that began the day before and carries past midnight.
- A breast feed with and without weights (estimated intake versus unknown).
- Error toast when the server is unreachable.
- Light and dark themes; phone (about 390px) and desktop (about 1200px).

## Navigation

Two views, Today and Over time. On phones the switcher is a bottom bar within thumb reach; on desktop it sits in the header beside the title and theme toggle.

## If restyling the existing build

The current markup, class names and behaviour live in `static/` beside this file (`index.html`, `css/style.css`, `js/app.js`, `js/forms.js`, `js/charts.js`). The JSON API under `/api` must stay unchanged.
