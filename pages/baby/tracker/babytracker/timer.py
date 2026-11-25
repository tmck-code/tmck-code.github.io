'''
Pause, resume, side and stop transitions for timed entries (sleeps, feeds and express sessions).

Each function takes the stored entry and returns the column values to write; none of them touch
the database. started_at/ended_at stay wall-clock. paused_seconds totals the finished pauses and
paused_at marks an open one. For breast feeds left_seconds/right_seconds bank the finished side
segments, and side_since marks the start of the segment now running on active_side.
'''

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException

from babytracker.db import Row
from babytracker.models import Express, Feed, FeedIn, Side, Sleep, TimedIn

Entry = Sleep | Feed | Express


def elapsed(start: datetime, end: datetime) -> int:
    'Whole seconds from start to end, never negative'
    return max(int((end - start).total_seconds()), 0)


def require_running(entry: Entry) -> None:
    if entry.ended_at is not None:
        raise HTTPException(status_code=409, detail='already stopped')


def banked_side(feed: Feed, until: datetime) -> Row:
    'Close the running side segment at until, adding it to that side'
    if feed.active_side is None or feed.side_since is None:
        return {'side_since': None}
    banked = feed.left_seconds if feed.active_side == 'left' else feed.right_seconds
    return {f'{feed.active_side}_seconds': (banked or 0) + elapsed(feed.side_since, until), 'side_since': None}


def pause(entry: Entry, now: datetime) -> Row:
    require_running(entry)
    if entry.paused_at is not None:
        raise HTTPException(status_code=409, detail='already paused')
    paused_at = max(now, entry.started_at)
    sides     = banked_side(entry, paused_at) if isinstance(entry, Feed) else {}
    return {**sides, 'paused_at': paused_at}


def resume(entry: Entry, now: datetime) -> Row:
    require_running(entry)
    if entry.paused_at is None:
        raise HTTPException(status_code=409, detail='not paused')
    resumed_at  = max(now, entry.paused_at)
    values: Row = {'paused_seconds': entry.paused_seconds + elapsed(entry.paused_at, resumed_at), 'paused_at': None}
    if isinstance(entry, Feed) and entry.active_side is not None:
        values['side_since'] = resumed_at
    return values


def switch_side(feed: Feed, side: Side, now: datetime) -> Row:
    'Empty when the feed is already on that side, so a repeat from a second phone changes nothing'
    require_running(feed)
    if feed.kind != 'breast':
        raise HTTPException(status_code=409, detail='only breast feeds have sides')
    if feed.active_side == side:
        return {}
    paused = feed.paused_at is not None
    return {
        'left_seconds':  feed.left_seconds or 0,
        'right_seconds': feed.right_seconds or 0,
        **({} if paused else banked_side(feed, now)),
        'active_side':   side,
        'side_since':    None if paused else max(now, feed.started_at),
    }


def finalise(entry: Entry, ended_at: datetime) -> Row:
    'End a running entry at ended_at: an open pause runs up to it, the running side segment is banked'
    if ended_at < entry.started_at:
        raise HTTPException(status_code=422, detail='ended_at is before started_at')
    open_pause  = elapsed(entry.paused_at, ended_at) if entry.paused_at is not None else 0
    paused      = min(entry.paused_seconds + open_pause, elapsed(entry.started_at, ended_at))
    values: Row = {'ended_at': ended_at, 'paused_at': None, 'paused_seconds': paused}
    if isinstance(entry, Feed):
        values.update(banked_side(entry, ended_at))
    return values


def stop(entry: Entry, ended_at: datetime | None, now: datetime) -> Row:
    'A paused entry ends at the moment it was paused, whatever end time was asked for'
    require_running(entry)
    if entry.paused_at is not None:
        return finalise(entry, entry.paused_at)
    return finalise(entry, ended_at or now)


def recorded_pause(given: int | None, stored: int, started_at: datetime, ended_at: datetime | None) -> int:
    'paused_seconds for a hand-edited entry: no value keeps what is stored, and it must fit inside the entry'
    if ended_at is None:
        return stored if given is None else given
    wall = elapsed(started_at, ended_at)
    if given is None:
        return min(stored, wall)
    if given > wall:
        raise HTTPException(status_code=422, detail='paused_seconds is longer than the entry')
    return given


def created(body: TimedIn, started_at: datetime) -> Row:
    'Timer columns for a new entry; one that starts running has no pauses yet'
    if body.ended_at is None:
        return {'paused_seconds': 0}
    return {'paused_seconds': recorded_pause(body.paused_seconds, 0, started_at, body.ended_at)}


def created_sides(body: FeedIn, started_at: datetime) -> Row:
    'Side columns for a new feed (FeedIn has already dropped them for bottle feeds)'
    if body.ended_at is not None:
        return {'left_seconds': body.left_seconds, 'right_seconds': body.right_seconds, 'active_side': body.side}
    if body.side is None:
        return {}
    return {'left_seconds': 0, 'right_seconds': 0, 'active_side': body.side, 'side_since': started_at}


def restarted(entry: Entry, started_at: datetime, now: datetime) -> Row:
    'Move the start of a running entry, pulling its markers forward so nothing ends up negative'
    paused_at   = max(entry.paused_at, started_at) if entry.paused_at is not None else None
    values: Row = {
        'paused_at':      paused_at,
        'paused_seconds': min(entry.paused_seconds, elapsed(started_at, paused_at or now)),
    }
    if isinstance(entry, Feed) and entry.side_since is not None:
        values['side_since'] = max(entry.side_since, started_at)
    return values


def edited(entry: Entry, body: TimedIn, started_at: datetime, now: datetime) -> Row:
    '''
    Timer columns for an edit (PUT). A running entry keeps its server-managed state, and is
    finalised if the edit gives it an end. A finished entry takes paused_seconds from the body,
    and loses any open markers if the edit re-opens it.
    '''
    if entry.ended_at is not None:
        values: Row = {
            'paused_seconds': recorded_pause(body.paused_seconds, entry.paused_seconds, started_at, body.ended_at),
            'paused_at':      None,
        }
        return {**values, 'side_since': None} if isinstance(entry, Feed) else values
    moved = restarted(entry, started_at, now)
    if body.ended_at is None:
        return moved
    return {**moved, **finalise(entry.model_copy(update={**moved, 'started_at': started_at}), body.ended_at)}


def edited_sides(feed: Feed, body: FeedIn) -> Row:
    'Side columns for an edit: hand-entered for a finished feed, server-managed for a running one'
    if body.kind == 'bottle':
        return {'left_seconds': None, 'right_seconds': None, 'active_side': None, 'side_since': None}
    if feed.ended_at is None:
        return {}
    return {'left_seconds': body.left_seconds, 'right_seconds': body.right_seconds}
