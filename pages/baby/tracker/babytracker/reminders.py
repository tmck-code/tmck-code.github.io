'''
When a reminder is next due, and what a tick counts for. Nothing here touches the database: a
reminder's cadence and its ticks go in, the moment "now" is passed, and a Plan comes out.

Day and week cadences ("every 2 days at 08:00") are a fixed grid of occurrences in the reminder's
own time zone, so 08:00 stays 08:00 across a daylight-saving change and both phones agree:

  - The grid starts on the local day of the anchor (creation, or the last time the cadence was
    changed or the reminder resumed) and repeats every N days. With a time of day, a first
    occurrence already past on that day moves to the next day.
  - With a time, an occurrence is due at that time, and overdue an hour later (DUE_GRACE).
  - With no time, an occurrence is the whole local day: due from midnight, and overdue only once
    the day is over. So "vitamin D, daily" ticked at 08:00 on Monday is simply due on Tuesday,
    whenever on Tuesday it is given.
  - A tick counts for one occurrence. If one has started and is not ticked, that is the latest
    started one (ticking late leaves no backlog: the next due is the next occurrence on the grid).
    Otherwise it counts for the next one coming, so ticking early moves the next due to the
    occurrence after it, not to "N days from the tick".
  - After a tick the reminder reads done until the end of the local day of the tick, or of the
    occurrence it counted for if that is later, and never past the start of the next occurrence.
    While done it cannot be ticked again, which makes a double tap harmless.

Hour cadences have no grid: due N hours after the last tick (or the anchor), overdue an hour after
that, and done for the first hour after a tick (DONE_HOLD) or until due again.

A one-time reminder ('once') has a single occurrence: a local date and time. It is due then, overdue
an hour later, and stays overdue until it is ticked or deleted. One tick, early or late, finishes
it: done for good, with nothing due next. Changing its date moves the anchor to now, and as only
ticks since the anchor count, that arms it again while its history is kept.
'''

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

Unit  = Literal['hours', 'days', 'weeks', 'once']
State = Literal['overdue', 'due', 'upcoming', 'done', 'paused']

DUE_GRACE  = timedelta(hours=1)
DONE_HOLD  = timedelta(hours=1)
EVERY_MAX  = {'hours': 72, 'days': 365, 'weeks': 52, 'once': 1}
ORDER      = ('overdue', 'due', 'upcoming', 'done', 'paused')


@dataclass(frozen=True)
class Cadence:
    every:  int
    unit:   Unit
    at:     time | None
    zone:   ZoneInfo
    anchor: datetime
    on:     date | None = None   # the day of a one-time reminder

    @property
    def gridded(self) -> bool:
        return self.unit in ('days', 'weeks')

    @property
    def all_day(self) -> bool:
        return self.gridded and self.at is None

    @property
    def period_days(self) -> int:
        return self.every * (7 if self.unit == 'weeks' else 1)

    def local_date(self, moment: datetime) -> date:
        return moment.astimezone(self.zone).date()

    def at_local(self, day: date, at: time) -> datetime:
        'That wall-clock time on that local day, as UTC (a time skipped by the clocks going forward lands just after the gap)'
        return datetime.combine(day, at, tzinfo=self.zone).astimezone(timezone.utc)

    def midnight_after(self, moment: datetime) -> datetime:
        return self.at_local(self.local_date(moment) + timedelta(days=1), time.min)

    @property
    def first_day(self) -> date:
        day = self.local_date(self.anchor)
        if self.at is not None and self.at_local(day, self.at) < self.anchor:
            return day + timedelta(days=1)
        return day

    def start(self, index: int) -> datetime:
        'When occurrence number index (0 is the first) begins'
        return self.at_local(self.first_day + timedelta(days=index * self.period_days), self.at or time.min)

    def index_at(self, moment: datetime) -> int:
        'The latest occurrence that has begun by that moment; -1 before the first'
        index = (self.local_date(moment) - self.first_day).days // self.period_days
        if self.start(index) > moment:
            index -= 1
        return max(index, -1)

    def overdue_from(self, index: int) -> datetime:
        if self.at is None:
            return self.midnight_after(self.start(index))
        return self.start(index) + DUE_GRACE


@dataclass(frozen=True)
class Progress:
    'What the ticks of a reminder come to. The grid only counts ticks made since its anchor.'

    last_completed_at: datetime | None = None   # the latest tick, whenever it was
    counted_at:        datetime | None = None   # the latest tick since the anchor
    counted_due_at:    datetime | None = None   # the furthest occurrence ticked since the anchor


@dataclass(frozen=True)
class Plan:
    state:      State
    due_at:     datetime | None   # the occurrence waiting (due, overdue) or the next one coming; None: finished
    overdue_at: datetime | None   # when due_at turns overdue
    satisfies:  datetime          # the occurrence a tick made now counts for


def plan_hours(cadence: Cadence, progress: Progress, now: datetime) -> Plan:
    last   = progress.last_completed_at
    base   = max(last, cadence.anchor) if last else cadence.anchor
    due_at = base + timedelta(hours=cadence.every)
    state: State
    if now >= due_at + DUE_GRACE:
        state = 'overdue'
    elif now >= due_at:
        state = 'due'
    elif last is not None and last >= cadence.anchor and now < last + DONE_HOLD:
        state = 'done'
    else:
        state = 'upcoming'
    return Plan(state, due_at, due_at + DUE_GRACE, due_at)


def plan_grid(cadence: Cadence, progress: Progress, now: datetime) -> Plan:
    ticked  = cadence.index_at(progress.counted_due_at) if progress.counted_due_at else -1
    started = cadence.index_at(now)
    waiting = ticked + 1
    due_at  = cadence.start(waiting)
    overdue = cadence.overdue_from(waiting)
    if now < cadence.anchor:
        # Only restart_anchor puts the anchor ahead of now: ticked today, starting again tomorrow.
        return Plan('done', due_at, overdue, due_at)
    if started > ticked:
        return Plan('overdue' if now >= overdue else 'due', due_at, overdue, cadence.start(started))
    done_until = None
    if progress.counted_at is not None and ticked >= 0:
        done_until = min(cadence.midnight_after(max(progress.counted_at, cadence.start(ticked))), due_at)
    done = done_until is not None and now < done_until
    return Plan('done' if done else 'upcoming', due_at, overdue, due_at)


def plan_once(cadence: Cadence, progress: Progress, now: datetime) -> Plan:
    assert cadence.on is not None and cadence.at is not None
    due_at = cadence.at_local(cadence.on, cadence.at)
    if progress.counted_at is not None:
        return Plan('done', None, None, due_at)
    state: State = 'overdue' if now >= due_at + DUE_GRACE else 'due' if now >= due_at else 'upcoming'
    return Plan(state, due_at, due_at + DUE_GRACE, due_at)


def plan(cadence: Cadence, progress: Progress, now: datetime) -> Plan:
    'Where an active reminder stands at the moment now'
    if cadence.unit == 'once':
        return plan_once(cadence, progress, now)
    return plan_grid(cadence, progress, now) if cadence.gridded else plan_hours(cadence, progress, now)


def restart_anchor(cadence: Cadence, progress: Progress, now: datetime) -> datetime:
    '''
    Where the schedule starts again after the cadence is changed or the reminder is resumed: now.
    Except that a whole-day reminder already ticked today starts tomorrow, so it does not ask again.
    '''
    last = progress.last_completed_at
    if cadence.all_day and last is not None and cadence.local_date(last) == cadence.local_date(now):
        return cadence.midnight_after(now)
    return now
