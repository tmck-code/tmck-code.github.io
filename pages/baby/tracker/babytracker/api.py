'FastAPI app: JSON API under /api, static frontend at /.'

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.staticfiles import StaticFiles
from pydantic import AwareDatetime

from babytracker import models, reminders, timer
from babytracker.db import COMPLETIONS, REMINDERS, SETTINGS_TABLE, TABLES, Row, Store, utcnow
from babytracker.models import (
    Active,
    BreastEstimateIn,
    BreastEstimateOut,
    BreastExample,
    BreastInForce,
    BreastPool,
    BreastRateOut,
    BreastRule,
    BreastSettingsLimits,
    BreastSettingsRow,
    DaySummary,
    Events,
    Express,
    ExpressIn,
    ExpressStopIn,
    Feed,
    FeedIn,
    FeedStopIn,
    Last,
    Nappy,
    NappyIn,
    Reminder,
    ReminderCompleteIn,
    ReminderCompletion,
    ReminderIn,
    ReminderTicked,
    SideIn,
    Sleep,
    SleepIn,
    Status,
    StopIn,
    Summary,
    TimedIn,
    WeighedFeedOut,
    Weight,
    WeightIn,
)
from babytracker.rate import (
    BREAST_DEFAULT_MAX_ML,
    BREAST_MANUAL_RATE_MAX,
    BREAST_RATE_FEEDS,
    BREAST_RATE_MAX_SECONDS,
    BREAST_RATE_MIN_FEEDS,
    BREAST_RATE_MIN_ML,
    BREAST_REF_MAX_ML,
    BREAST_REF_MIN_ML,
    BREAST_REF_MIN_SECONDS,
    NO_GAIN,
    USED,
    VERDICT_TEXT,
    Basis,
    EstimateSettings,
    Estimator,
    RateHistory,
    WeighedFeed,
    estimate_ml,
)
from babytracker.summary import local_midnight_utc, summarise, summarise_days

DB_PATH_ENV     = 'BABY_DB_PATH'
DEFAULT_DB_PATH = '/data/baby.duckdb'
STATIC_DIR      = Path(__file__).resolve().parent.parent / 'static'
MAX_DAILY_DAYS  = 1100
# Feed lengths the Settings page works an example out for.
EXAMPLE_MINUTES = (10, 20)
# Stop details that mean nothing for a feed of that kind, and are ignored (as FeedIn does on create and edit).
BREAST_DROPS    = {'breast': {'bottle_ml'}}
# Ticks listed in a reminder's history.
MAX_COMPLETIONS = 100

router = APIRouter(prefix='/api')


def get_store(request: Request) -> Store:
    store = request.app.state.store
    assert isinstance(store, Store)
    return store


StoreDep = Annotated[Store, Depends(get_store)]


def not_found(table: str, row_id: int) -> HTTPException:
    return HTTPException(status_code=404, detail=f'no entry {row_id} in {table}')


def existing(store: Store, table: str, row_id: int) -> Row:
    row = store.get(table, row_id)
    if row is None:
        raise not_found(table, row_id)
    return row


def guard_single_in_progress(store: Store, table: str, body: TimedIn, ignore_id: int | None = None) -> None:
    'Only one sleep, one feed and one express session may be in progress at a time'
    if body.ended_at is not None:
        return
    current = store.in_progress(table)
    if current is None or current['id'] == ignore_id:
        return
    raise HTTPException(status_code=409, detail=f'another entry in {table} is already in progress; stop it first')


def timed_values(body: TimedIn, fallback_start: datetime) -> Row:
    started_at = body.started_at or fallback_start
    if body.ended_at is not None and body.ended_at < started_at:
        raise HTTPException(status_code=422, detail='ended_at is before started_at')
    return {'started_at': started_at, 'ended_at': body.ended_at, 'notes': body.notes}


def feed_values(body: FeedIn, fallback_start: datetime) -> Row:
    return {
        **timed_values(body, fallback_start),
        'kind':            body.kind,
        'amount_ml':       body.amount_ml,
        'bottle_ml':       body.bottle_ml,
        'weight_before_g': body.weight_before_g,
        'weight_after_g':  body.weight_after_g,
    }


def express_values(body: ExpressIn, fallback_start: datetime) -> tuple[Row, ExpressIn]:
    '''
    Columns for an express session, and the body with its end resolved for the timer. No amount: the
    timer is running. An amount with no end: logged at one moment, a session of no length.
    '''
    started_at = body.started_at or body.logged_at or fallback_start
    ended_at   = None if body.amount_ml is None else body.ended_at or started_at
    if ended_at is not None and ended_at < started_at:
        raise HTTPException(status_code=422, detail='ended_at is before started_at')
    values: Row = {
        'logged_at':  started_at,
        'started_at': started_at,
        'ended_at':   ended_at,
        'amount_ml':  body.amount_ml or 0,
        'notes':      body.notes,
    }
    return values, body.model_copy(update={'started_at': started_at, 'ended_at': ended_at})


def stored_sleep(store: Store, row_id: int) -> Sleep:
    return Sleep.model_validate(existing(store, 'sleeps', row_id))


def stored_feed(store: Store, row_id: int) -> Feed:
    'The feed as stored, for the timer to work on. Responses go through as_feed, which adds the rate.'
    return Feed.model_validate(existing(store, 'feeds', row_id))


def stored_express(store: Store, row_id: int) -> Express:
    return Express.model_validate(existing(store, 'expresses', row_id))


def weighed_feeds(store: Store, exclude_id: int | None = None) -> list[Feed]:
    'Every finished breast feed weighed before and after, whenever it was'
    return [Feed.model_validate(r) for r in store.weighed_breast_feeds() if r['id'] != exclude_id]


def rate_history(weighed: list[Feed]) -> RateHistory:
    'The weighed feeds as the Feed model reads them (intake from the weights, active length)'
    return RateHistory(WeighedFeed(f.ended_at, f.intake_ml or 0, f.duration_seconds or 0, f.id) for f in weighed if f.ended_at)


def settings_rows(store: Store) -> list[BreastSettingsRow]:
    return [BreastSettingsRow.model_validate(r) for r in store.breast_settings()]


def estimator(weighed: list[Feed], rows: list[BreastSettingsRow]) -> Estimator:
    '''
    The one place an unweighed breast feed's estimate is decided: the rate learned from the weighed
    feeds, overridden by whatever the Settings page had saved when the feed started.
    '''
    settings = (EstimateSettings(r.effective_from, r.default_ml, r.manual_rate_ml_per_min, r.id) for r in rows)
    return Estimator(rate_history(weighed), settings, models.BREAST_DEFAULT_ML)


def stored_estimator(store: Store, exclude_id: int | None = None) -> Estimator:
    return estimator(weighed_feeds(store, exclude_id), settings_rows(store))


def with_rates(store: Store, feeds: list[Feed]) -> list[Feed]:
    '''
    Give each unweighed breast feed what it is estimated from: the rate learned from the weighed
    feeds that ended before it started, or the figures saved in Settings that were in force then.
    Feed.intake_ml then does the sum. Every feed the API returns passes through here, so a feed, the
    summaries and the daily totals all agree. Two queries however many feeds.
    '''
    wanting = [f for f in feeds if f.kind == 'breast' and not f.weighed]
    if not wanting:
        return feeds
    estimates = stored_estimator(store)
    for feed in wanting:
        feed.rate, feed.default_ml = estimates.at(feed.started_at)
    return feeds


def as_feed(store: Store, row: Row | None) -> Feed:
    'A stored feed row as the API returns it'
    return with_rates(store, [Feed.model_validate(row)])[0]


def load_events(store: Store, start: datetime, end: datetime) -> Events:
    return Events(
        sleeps    = [Sleep.model_validate(r) for r in store.overlapping('sleeps', start, end)],
        feeds     = with_rates(store, [Feed.model_validate(r) for r in store.overlapping('feeds', start, end)]),
        nappies   = [Nappy.model_validate(r) for r in store.between('nappies', start, end)],
        weights   = [Weight.model_validate(r) for r in store.between('weights', start, end)],
        expresses = [Express.model_validate(r) for r in store.between('expresses', start, end)],
    )


def check_window(start: datetime, end: datetime) -> None:
    if end <= start:
        raise HTTPException(status_code=422, detail='end must be after start')


@router.get('/health')
def health(store: StoreDep) -> dict[str, str]:
    store.query('SELECT 1')
    return {'status': 'ok'}


@router.get('/status')
def status(store: StoreDep) -> Status:
    'What is happening now, and the most recent event of each type (breast, express: the latest finished one)'
    sleep   = store.in_progress('sleeps')
    feed    = store.in_progress('feeds')
    express = store.in_progress('expresses')
    found  = {
        'active': feed,
        'feed':   store.latest('feeds', 'started_at'),
        'breast': store.latest('feeds', 'started_at', "kind = 'breast' AND ended_at IS NOT NULL"),
    }
    shown  = {key: Feed.model_validate(row) if row else None for key, row in found.items()}
    with_rates(store, [f for f in shown.values() if f])
    last   = {
        'sleep':   store.latest('sleeps', 'ended_at', 'ended_at IS NOT NULL'),
        'feed':    shown['feed'],
        'nappy':   store.latest('nappies', 'logged_at'),
        'weight':  store.latest('weights', 'logged_at'),
        'express': store.latest('expresses', 'logged_at', 'started_at IS NULL OR ended_at IS NOT NULL'),
        'breast':  shown['breast'],
    }
    return Status(
        now    = utcnow(),
        active = Active(
            sleep   = Sleep.model_validate(sleep) if sleep else None,
            feed    = shown['active'],
            express = Express.model_validate(express) if express else None,
        ),
        last   = Last.model_validate(last),
    )


@router.get('/breast-rate')
def breast_rate(store: StoreDep, at: AwareDatetime, exclude_id: int | None = None) -> BreastRateOut:
    '''
    What an unweighed breast feed starting at that moment is estimated from, so a form can show the
    figure before saving. exclude_id leaves one feed out of the weighed feeds: the one being edited.
    '''
    rate, default_ml = stored_estimator(store, exclude_id).at(at)
    return BreastRateOut(
        ml_per_min  = rate.ml_per_min if rate else None,
        feeds       = rate.feeds if rate else None,
        max_seconds = BREAST_RATE_MAX_SECONDS,
        min_ml      = BREAST_RATE_MIN_ML,
        default_ml  = default_ml,
    )


def in_force(basis: Basis) -> BreastInForce:
    'What a feed starting now is estimated from, with what feeds of a few lengths would come to'
    rate = basis.rate
    return BreastInForce(
        source     = 'default' if rate is None else 'manual_rate' if rate.manual else 'rate',
        ml_per_min = rate.ml_per_min if rate else None,
        feeds      = rate.feeds if rate else None,
        default_ml = basis.default_ml,
        examples   = [
            BreastExample(minutes=minutes, ml=estimate_ml(rate, minutes * 60) if rate else basis.default_ml)
            for minutes in EXAMPLE_MINUTES
        ],
    )


def weighed_out(feed: Feed, ml: int, seconds: int, verdict: str) -> WeighedFeedOut:
    assert feed.ended_at is not None and feed.weight_before_g is not None and feed.weight_after_g is not None
    went_down = verdict == NO_GAIN and feed.weight_after_g < feed.weight_before_g
    return WeighedFeedOut(
        id               = feed.id,
        started_at       = feed.started_at,
        ended_at         = feed.ended_at,
        duration_seconds = seconds,
        weight_before_g  = feed.weight_before_g,
        weight_after_g   = feed.weight_after_g,
        ml               = ml,
        ml_per_min       = round(ml * 60 / seconds, 3) if seconds else None,
        used             = verdict == USED,
        reason           = verdict,
        reason_text      = 'weight went down' if went_down else VERDICT_TEXT[verdict],
        feed             = feed,
    )


def breast_estimate(store: Store) -> BreastEstimateOut:
    '''
    The settings, and how the estimate of a feed starting now is reached. Built from the estimator
    every feed is estimated with, so the page shows the sum that is actually applied.
    '''
    now       = utcnow()
    rows      = settings_rows(store)
    weighed   = weighed_feeds(store)
    estimates = estimator(weighed, rows)
    pool      = estimates.history.pool(now)
    by_id     = {f.id: f for f in weighed}
    verdicts  = [
        weighed_out(by_id[w.feed_id], w.ml, w.seconds, verdict)
        for w, verdict in estimates.history.verdicts(now) if w.feed_id is not None
    ]
    in_effect = estimates.settings_at(now)
    return BreastEstimateOut(
        now            = now,
        current        = next((r for r in rows if in_effect and r.id == in_effect.row_id), None),
        history        = rows[::-1],
        env_default_ml = models.BREAST_DEFAULT_ML,
        in_force       = in_force(estimates.at(now)),
        pool           = BreastPool(
            total_ml      = pool.ml,
            total_seconds = pool.seconds,
            ml_per_min    = pool.ml_per_min,
            feeds         = len(pool.feeds),
            min_feeds     = BREAST_RATE_MIN_FEEDS,
            enough        = pool.enough,
        ),
        rule           = BreastRule(
            recent_feeds    = BREAST_RATE_FEEDS,
            min_feeds       = BREAST_RATE_MIN_FEEDS,
            max_seconds     = BREAST_RATE_MAX_SECONDS,
            min_ml          = BREAST_RATE_MIN_ML,
            ref_min_ml      = BREAST_REF_MIN_ML,
            ref_max_ml      = BREAST_REF_MAX_ML,
            ref_min_seconds = BREAST_REF_MIN_SECONDS,
        ),
        limits         = BreastSettingsLimits(default_ml_max=BREAST_DEFAULT_MAX_ML, manual_rate_max=BREAST_MANUAL_RATE_MAX),
        weighed        = sorted(verdicts, key=lambda w: w.started_at, reverse=True),
    )


@router.get('/settings/breast-estimate')
def get_breast_estimate(store: StoreDep) -> BreastEstimateOut:
    'What unweighed breast feeds are estimated from: the saved settings, their history and the working'
    return breast_estimate(store)


@router.put('/settings/breast-estimate')
def save_breast_estimate(store: StoreDep, body: BreastEstimateIn) -> BreastEstimateOut:
    '''
    Save the default amount and the manual rate. scope 'all' replaces the history with one row in
    force from the beginning, so every unweighed breast feed is re-estimated (with neither figure
    set, that is no row at all). scope 'future' adds a row in force from now: feeds that started
    earlier keep the figures they had, and before the first such row nothing is overridden.
    '''
    now    = utcnow()
    values = {'default_ml': body.default_ml, 'manual_rate_ml_per_min': body.manual_rate_ml_per_min, 'created_at': now}
    with store.lock:
        if body.scope == 'all':
            overrides = body.default_ml is not None or body.manual_rate_ml_per_min is not None
            store.replace_breast_settings({**values, 'effective_from': None} if overrides else None)
            return breast_estimate(store)
        rows    = settings_rows(store)
        current = rows[-1] if rows else None
        before  = (current.default_ml, current.manual_rate_ml_per_min) if current else (None, None)
        # Saving what is already in force would only add a row that changes nothing.
        if before != (body.default_ml, body.manual_rate_ml_per_min):
            store.insert(SETTINGS_TABLE, {**values, 'effective_from': now})
        return breast_estimate(store)


@router.delete('/settings/breast-estimate')
def reset_breast_estimate(store: StoreDep) -> BreastEstimateOut:
    'Forget every saved setting: all unweighed breast feeds go back to the learned rate and the configured default'
    with store.lock:
        store.replace_breast_settings(None)
        return breast_estimate(store)


@router.get('/events')
def events(store: StoreDep, start: AwareDatetime, end: AwareDatetime) -> Events:
    'Everything that overlaps [start, end)'
    check_window(start, end)
    return load_events(store, start, end)


@router.get('/summary')
def summary(store: StoreDep, start: AwareDatetime, end: AwareDatetime) -> Summary:
    check_window(start, end)
    return summarise(load_events(store, start, end), start, end, utcnow())


@router.get('/daily')
def daily(
    store: StoreDep,
    tz:    str,
    end:   date,
    start: Annotated[date | None, Query()] = None,
) -> list[DaySummary]:
    'Per-day totals for local calendar days start..end in the IANA zone tz. No start means since the first entry.'
    try:
        zone = ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(status_code=422, detail=f'unknown timezone {tz!r}') from None
    earliest = store.earliest_timestamp()
    first    = start or (earliest.astimezone(zone).date() if earliest else end)
    first    = max(min(first, end), end - timedelta(days=MAX_DAILY_DAYS))
    window   = load_events(store, local_midnight_utc(first, zone), local_midnight_utc(end + timedelta(days=1), zone))
    return list(summarise_days(window, first, end, zone, utcnow()))


@router.post('/sleeps', status_code=201)
def create_sleep(store: StoreDep, body: SleepIn) -> Sleep:
    with store.lock:
        guard_single_in_progress(store, 'sleeps', body)
        values = timed_values(body, utcnow())
        assert isinstance(values['started_at'], datetime)
        return Sleep.model_validate(store.insert('sleeps', {**values, **timer.created(body, values['started_at'])}))


@router.put('/sleeps/{row_id}')
def update_sleep(store: StoreDep, row_id: int, body: SleepIn) -> Sleep:
    with store.lock:
        sleep = stored_sleep(store, row_id)
        guard_single_in_progress(store, 'sleeps', body, ignore_id=row_id)
        values = timed_values(body, sleep.started_at)
        assert isinstance(values['started_at'], datetime)
        values.update(timer.edited(sleep, body, values['started_at'], utcnow()))
        return Sleep.model_validate(store.update('sleeps', row_id, values))


@router.post('/sleeps/{row_id}/stop')
def stop_sleep(store: StoreDep, row_id: int, body: StopIn | None = None) -> Sleep:
    body = body or StopIn()
    with store.lock:
        values = timer.stop(stored_sleep(store, row_id), body.ended_at, utcnow())
        return Sleep.model_validate(store.update('sleeps', row_id, values))


@router.post('/sleeps/{row_id}/pause')
def pause_sleep(store: StoreDep, row_id: int) -> Sleep:
    with store.lock:
        values = timer.pause(stored_sleep(store, row_id), utcnow())
        return Sleep.model_validate(store.update('sleeps', row_id, values))


@router.post('/sleeps/{row_id}/resume')
def resume_sleep(store: StoreDep, row_id: int) -> Sleep:
    with store.lock:
        values = timer.resume(stored_sleep(store, row_id), utcnow())
        return Sleep.model_validate(store.update('sleeps', row_id, values))


@router.post('/feeds', status_code=201)
def create_feed(store: StoreDep, body: FeedIn) -> Feed:
    with store.lock:
        guard_single_in_progress(store, 'feeds', body)
        values = feed_values(body, utcnow())
        assert isinstance(values['started_at'], datetime)
        values.update(timer.created(body, values['started_at']))
        values.update(timer.created_sides(body, values['started_at']))
        return as_feed(store, store.insert('feeds', values))


@router.put('/feeds/{row_id}')
def update_feed(store: StoreDep, row_id: int, body: FeedIn) -> Feed:
    with store.lock:
        feed = stored_feed(store, row_id)
        guard_single_in_progress(store, 'feeds', body, ignore_id=row_id)
        values = feed_values(body, feed.started_at)
        # A client from before bottle_ml existed sends no such key: it keeps what is stored, where an
        # explicit null clears it. (A breast feed never has one: FeedIn has already set it to None.)
        if 'bottle_ml' not in body.model_fields_set:
            del values['bottle_ml']
        assert isinstance(values['started_at'], datetime)
        values.update(timer.edited(feed, body, values['started_at'], utcnow()))
        values.update(timer.edited_sides(feed, body))
        return as_feed(store, store.update('feeds', row_id, values))


@router.post('/feeds/{row_id}/stop')
def stop_feed(store: StoreDep, row_id: int, body: FeedStopIn | None = None) -> Feed:
    body = body or FeedStopIn()
    with store.lock:
        feed    = stored_feed(store, row_id)
        values  = timer.stop(feed, body.ended_at, utcnow())
        details = body.model_dump(exclude={'ended_at'} | BREAST_DROPS.get(feed.kind, set()), exclude_none=True)
        return as_feed(store, store.update('feeds', row_id, {**values, **details}))


@router.post('/feeds/{row_id}/pause')
def pause_feed(store: StoreDep, row_id: int) -> Feed:
    with store.lock:
        values = timer.pause(stored_feed(store, row_id), utcnow())
        return as_feed(store, store.update('feeds', row_id, values))


@router.post('/feeds/{row_id}/resume')
def resume_feed(store: StoreDep, row_id: int) -> Feed:
    with store.lock:
        values = timer.resume(stored_feed(store, row_id), utcnow())
        return as_feed(store, store.update('feeds', row_id, values))


@router.post('/feeds/{row_id}/side')
def switch_feed_side(store: StoreDep, row_id: int, body: SideIn) -> Feed:
    with store.lock:
        feed   = stored_feed(store, row_id)
        values = timer.switch_side(feed, body.side, utcnow())
        return as_feed(store, store.update('feeds', row_id, values)) if values else with_rates(store, [feed])[0]


@router.post('/nappies', status_code=201)
def create_nappy(store: StoreDep, body: NappyIn) -> Nappy:
    values = {**body.model_dump(), 'logged_at': body.logged_at or utcnow()}
    return Nappy.model_validate(store.insert('nappies', values))


@router.put('/nappies/{row_id}')
def update_nappy(store: StoreDep, row_id: int, body: NappyIn) -> Nappy:
    with store.lock:
        row = existing(store, 'nappies', row_id)
        return Nappy.model_validate(store.update('nappies', row_id, {**body.model_dump(), 'logged_at': body.logged_at or row['logged_at']}))


@router.post('/weights', status_code=201)
def create_weight(store: StoreDep, body: WeightIn) -> Weight:
    values = {**body.model_dump(), 'logged_at': body.logged_at or utcnow()}
    return Weight.model_validate(store.insert('weights', values))


@router.put('/weights/{row_id}')
def update_weight(store: StoreDep, row_id: int, body: WeightIn) -> Weight:
    with store.lock:
        row = existing(store, 'weights', row_id)
        return Weight.model_validate(store.update('weights', row_id, {**body.model_dump(), 'logged_at': body.logged_at or row['logged_at']}))


@router.post('/expresses', status_code=201)
def create_express(store: StoreDep, body: ExpressIn) -> Express:
    with store.lock:
        values, resolved = express_values(body, utcnow())
        guard_single_in_progress(store, 'expresses', resolved)
        assert isinstance(values['started_at'], datetime)
        return Express.model_validate(store.insert('expresses', {**values, **timer.created(resolved, values['started_at'])}))


@router.put('/expresses/{row_id}')
def update_express(store: StoreDep, row_id: int, body: ExpressIn) -> Express:
    with store.lock:
        express = stored_express(store, row_id)
        values, resolved = express_values(body, express.started_at)
        guard_single_in_progress(store, 'expresses', resolved, ignore_id=row_id)
        assert isinstance(values['started_at'], datetime)
        values.update(timer.edited(express, resolved, values['started_at'], utcnow()))
        return Express.model_validate(store.update('expresses', row_id, values))


@router.post('/expresses/{row_id}/stop')
def stop_express(store: StoreDep, row_id: int, body: ExpressStopIn | None = None) -> Express:
    body = body or ExpressStopIn()
    with store.lock:
        values  = timer.stop(stored_express(store, row_id), body.ended_at, utcnow())
        details = body.model_dump(exclude={'ended_at'}, exclude_none=True)
        return Express.model_validate(store.update('expresses', row_id, {**values, **details}))


@router.post('/expresses/{row_id}/pause')
def pause_express(store: StoreDep, row_id: int) -> Express:
    with store.lock:
        values = timer.pause(stored_express(store, row_id), utcnow())
        return Express.model_validate(store.update('expresses', row_id, values))


@router.post('/expresses/{row_id}/resume')
def resume_express(store: StoreDep, row_id: int) -> Express:
    with store.lock:
        values = timer.resume(stored_express(store, row_id), utcnow())
        return Express.model_validate(store.update('expresses', row_id, values))


def reminder_cadence(row: Row) -> reminders.Cadence:
    anchor = row['anchor_at']
    assert isinstance(anchor, datetime)
    return ReminderIn.model_validate({**row, 'at': row['at_time'], 'on': row['on_date']}).cadence(anchor)


def reminder_progress(row: Row | None) -> reminders.Progress:
    if row is None:
        return reminders.Progress()
    return reminders.Progress(**{key: row[key] for key in ('last_completed_at', 'counted_at', 'counted_due_at')})  # type: ignore[arg-type]


def as_reminder(row: Row, progress: Row | None, now: datetime) -> Reminder:
    'A stored reminder as the API returns it: where it stands at the moment now'
    cadence = reminder_cadence(row)
    found   = reminders.plan(cadence, reminder_progress(progress), now)
    plan    = found if row['active'] else None
    return Reminder.model_validate({
        **row,
        'at':                 row['at_time'],
        'on':                 row['on_date'],
        'finished':           cadence.unit == 'once' and found.state == 'done',
        'state':              plan.state if plan else 'paused',
        'next_due_at':        plan.due_at if plan else None,
        'overdue_at':         plan.overdue_at if plan else None,
        'all_day':            cadence.all_day,
        'last_completed_at':  progress['last_completed_at'] if progress else None,
        'last_completion_id': progress['last_id'] if progress else None,
    })


def stored_reminder(store: Store, row_id: int) -> Reminder:
    row = existing(store, REMINDERS, row_id)
    return as_reminder(row, store.reminder_progress().get(row_id), utcnow())


def reminder_values(body: ReminderIn) -> Row:
    return {**body.model_dump(exclude={'at', 'on'}), 'at_time': body.at, 'on_date': body.on.isoformat() if body.on else None}


@router.get('/reminders')
def list_reminders(store: StoreDep) -> list[Reminder]:
    'Every reminder with its state and next due time, the most pressing first (paused ones last)'
    now      = utcnow()
    progress = store.reminder_progress()
    found    = [as_reminder(row, progress.get(row['id']), now) for row in store.reminders()]
    return sorted(found, key=lambda r: (reminders.ORDER.index(r.state), r.next_due_at or now, r.id))


@router.post('/reminders', status_code=201)
def create_reminder(store: StoreDep, body: ReminderIn) -> Reminder:
    now = utcnow()
    row = store.insert(REMINDERS, {**reminder_values(body), 'anchor_at': now, 'created_at': now})
    return as_reminder(row, None, now)


@router.put('/reminders/{row_id}')
def update_reminder(store: StoreDep, row_id: int, body: ReminderIn) -> Reminder:
    '''
    Changing the cadence (or its date, or its time zone) starts the schedule again from now: only
    ticks made from then on count, which is also how a finished one-time reminder is armed again.
    The history is kept. Anything else leaves the schedule alone.
    '''
    with store.lock:
        row    = existing(store, REMINDERS, row_id)
        values = reminder_values(body)
        if any(values[key] != row[key] for key in ('every', 'unit', 'at_time', 'on_date', 'tz')):
            progress = reminder_progress(store.reminder_progress().get(row_id))
            values['anchor_at'] = reminders.restart_anchor(body.cadence(utcnow()), progress, utcnow())
        store.update(REMINDERS, row_id, values)
        return stored_reminder(store, row_id)


@router.post('/reminders/{row_id}/pause')
def pause_reminder(store: StoreDep, row_id: int) -> Reminder:
    'A paused reminder is kept, with its history, but is never due'
    with store.lock:
        existing(store, REMINDERS, row_id)
        store.update(REMINDERS, row_id, {'active': False})
        return stored_reminder(store, row_id)


@router.post('/reminders/{row_id}/resume')
def resume_reminder(store: StoreDep, row_id: int) -> Reminder:
    'The schedule starts again from now, so a reminder does not come back overdue for the time it was paused'
    with store.lock:
        row = existing(store, REMINDERS, row_id)
        if not row['active']:
            progress = reminder_progress(store.reminder_progress().get(row_id))
            anchor   = reminders.restart_anchor(reminder_cadence(row), progress, utcnow())
            store.update(REMINDERS, row_id, {'active': True, 'anchor_at': anchor})
        return stored_reminder(store, row_id)


@router.delete('/reminders/{row_id}', status_code=204)
def delete_reminder(store: StoreDep, row_id: int) -> Response:
    'Removes the reminder and its history'
    if not store.delete_reminder(row_id):
        raise not_found(REMINDERS, row_id)
    return Response(status_code=204)


@router.post('/reminders/{row_id}/complete', status_code=201)
def complete_reminder(store: StoreDep, row_id: int, body: ReminderCompleteIn | None = None) -> ReminderTicked:
    '''
    Tick a reminder off, early or late. The tick counts for the occurrence waiting, or the next one
    coming (reminders.py has the rule). 409 while it is already done, so a double tap adds nothing.
    '''
    body = body or ReminderCompleteIn()
    with store.lock:
        row  = existing(store, REMINDERS, row_id)
        now  = utcnow()
        when = body.completed_at or now
        if not row['active']:
            raise HTTPException(status_code=409, detail='reminder is paused')
        if when > now:
            raise HTTPException(status_code=422, detail='completed_at is in the future')
        cadence = reminder_cadence(row)
        if when < min(cadence.anchor, now):
            raise HTTPException(status_code=422, detail='completed_at is before the schedule started')
        plan = reminders.plan(cadence, reminder_progress(store.reminder_progress().get(row_id)), when)
        if plan.state == 'done':
            raise HTTPException(status_code=409, detail='already done')
        tick = store.insert(COMPLETIONS, {'reminder_id': row_id, 'completed_at': when, 'due_at': plan.satisfies})
        return ReminderTicked(reminder=stored_reminder(store, row_id), completion=ReminderCompletion.model_validate(tick))


@router.get('/reminders/{row_id}/completions')
def reminder_completions(
    store:  StoreDep,
    row_id: int,
    limit:  Annotated[int, Query(ge=1, le=MAX_COMPLETIONS)] = 20,
) -> list[ReminderCompletion]:
    'The most recent ticks of a reminder, newest first'
    existing(store, REMINDERS, row_id)
    return [ReminderCompletion.model_validate(r) for r in store.completions(row_id, limit)]


@router.delete('/reminders/{row_id}/completions/{completion_id}')
def undo_completion(store: StoreDep, row_id: int, completion_id: int) -> Reminder:
    'Undo a tick: the reminder goes back to what it was due before'
    with store.lock:
        tick = store.get(COMPLETIONS, completion_id)
        if tick is None or tick['reminder_id'] != row_id:
            raise not_found(COMPLETIONS, completion_id)
        store.delete(COMPLETIONS, completion_id)
        return stored_reminder(store, row_id)


def delete_route(table: str) -> None:
    @router.delete(f'/{table}/{{row_id}}', status_code=204, name=f'delete_{table}')
    def delete(store: StoreDep, row_id: int) -> Response:
        if not store.delete(table, row_id):
            raise not_found(table, row_id)
        return Response(status_code=204)


for _table in TABLES:
    delete_route(_table)


def create_app(db_path: str | None = None) -> FastAPI:
    path = db_path or os.environ.get(DB_PATH_ENV, DEFAULT_DB_PATH)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.store = Store(path)
        yield
        app.state.store.close()

    app = FastAPI(title='Baby tracker', lifespan=lifespan)
    app.include_router(router)

    @app.middleware('http')
    async def revalidate_static(request: Request, call_next):  # type: ignore[no-untyped-def]
        'Make browsers revalidate the frontend on each load so an image rebuild is picked up immediately'
        response = await call_next(request)
        if not request.url.path.startswith('/api'):
            response.headers['Cache-Control'] = 'no-cache'
        return response

    app.mount('/', StaticFiles(directory=STATIC_DIR, html=True), name='static')
    return app
