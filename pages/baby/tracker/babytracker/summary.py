'Aggregate events into per-window totals.'

from __future__ import annotations

from collections.abc import Iterator
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from babytracker.models import DaySummary, Events, Feed, Sleep, Summary


def overlap_seconds(activity: Sleep | Feed, start: datetime, end: datetime, now: datetime) -> int:
    '''
    Active seconds of the activity that fall inside [start, end). In-progress activities run up to
    now, or to the moment they were paused. Where the pauses fell is not recorded, so paused time is
    spread evenly: the wall-clock overlap is scaled by the activity's active share.
    '''
    activity_end = activity.ended_at or activity.paused_at or now
    wall         = int((activity_end - activity.started_at).total_seconds())
    overlap      = int((min(activity_end, end) - max(activity.started_at, start)).total_seconds())
    if wall <= 0 or overlap <= 0:
        return 0
    return overlap * (wall - min(activity.paused_seconds, wall)) // wall


def summarise(events: Events, start: datetime, end: datetime, now: datetime) -> Summary:
    feeds    = [f for f in events.feeds if start <= f.started_at < end]
    nappies  = [n for n in events.nappies if start <= n.logged_at < end]
    weights  = [w for w in events.weights if start <= w.logged_at < end]
    express  = [e for e in events.expresses if start <= e.logged_at < end and e.ended_at is not None]
    breast   = [f for f in feeds if f.kind == 'breast']
    return Summary(
        start         = start,
        end           = end,
        sleep_seconds = sum(overlap_seconds(s, start, end, now) for s in events.sleeps),
        sleep_count   = sum(1 for s in events.sleeps if start <= s.started_at < end),
        feed_count    = len(feeds),
        bottle_count  = len(feeds) - len(breast),
        breast_count  = len(breast),
        feed_seconds  = sum(overlap_seconds(f, start, end, now) for f in events.feeds),
        intake_ml     = sum(f.intake_ml or 0 for f in feeds),
        estimated_ml  = sum(f.intake_ml or 0 for f in breast),
        nappy_count   = len(nappies),
        wet_count     = sum(1 for n in nappies if n.wet),
        dirty_count   = sum(1 for n in nappies if n.dirty),
        weight_g      = max(weights, key=lambda w: w.logged_at).grams if weights else None,
        express_ml    = sum(e.amount_ml or 0 for e in express),
        express_count = len(express),
    )


def local_midnight_utc(day: date, tz: ZoneInfo) -> datetime:
    return datetime.combine(day, time.min, tzinfo=tz).astimezone(timezone.utc)


def summarise_days(events: Events, first: date, last: date, tz: ZoneInfo, now: datetime) -> Iterator[DaySummary]:
    'One summary per local calendar day, first..last inclusive. Days are DST-aware (23-25 h).'
    day = first
    while day <= last:
        following = day + timedelta(days=1)
        summary   = summarise(events, local_midnight_utc(day, tz), local_midnight_utc(following, tz), now)
        yield DaySummary(date=day.isoformat(), **summary.model_dump())
        day = following
