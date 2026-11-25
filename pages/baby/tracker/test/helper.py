'Shared builders for API tests.'

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

NOW = '2026-03-10T12:00:00Z'


class Clock:
    'Stands in for the server clock: frozen at NOW until a test advances it'

    def __init__(self) -> None:
        self.now = datetime.fromisoformat(NOW).astimezone(timezone.utc)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, minutes: int = 0, seconds: int = 0) -> None:
        self.now += timedelta(minutes=minutes, seconds=seconds)


def utc(hhmm: str, day: int = 10) -> str:
    'ISO timestamp on 2026-03-<day> at hh:mm UTC, as the API serialises it'
    return f'2026-03-{day:02d}T{hhmm}:00Z'


def post(client: TestClient, path: str, body: dict[str, object] | None = None) -> dict[str, object]:
    'POST and return the JSON body, failing loudly on any non-2xx'
    response = client.post(f'/api/{path}', json=body or {})
    assert response.status_code in (200, 201), response.text
    result: dict[str, object] = response.json()
    return result


def duration_seconds(started_at: str, ended_at: str | None, paused_seconds: int = 0) -> int | None:
    'Active length the API reports for a finished entry: wall-clock time less pauses'
    if ended_at is None:
        return None
    wall = datetime.fromisoformat(ended_at) - datetime.fromisoformat(started_at)
    return int(wall.total_seconds()) - paused_seconds


def sleep_row(row_id: int, started_at: str, ended_at: str | None, notes: str = '', **fields: object) -> dict[str, object]:
    row: dict[str, object] = {
        'id':             row_id,
        'started_at':     started_at,
        'ended_at':       ended_at,
        'notes':          notes,
        'paused_seconds': 0,
        'paused_at':      None,
        **fields,
    }
    paused = row['paused_seconds']
    assert isinstance(paused, int)
    return {**row, 'duration_seconds': duration_seconds(started_at, ended_at, paused)}


def feed_row(row_id: int, kind: str, started_at: str, ended_at: str | None, **fields: object) -> dict[str, object]:
    'A feed as the API returns it. Intake fields default to "no figure"; pass them for feeds that have one.'
    row: dict[str, object] = {
        'id':               row_id,
        'kind':             kind,
        'started_at':       started_at,
        'ended_at':         ended_at,
        'amount_ml':        None,
        'bottle_ml':        None,
        'weight_before_g':  None,
        'weight_after_g':   None,
        'notes':            '',
        'paused_seconds':   0,
        'paused_at':        None,
        'left_seconds':     None,
        'right_seconds':    None,
        'active_side':      None,
        'side_since':       None,
        'intake_ml':        None,
        'intake_estimated': False,
        'intake_source':    None,
        'intake_rate_ml_per_min':  None,
        'intake_rate_feeds':       None,
        'intake_rate_max_seconds': None,
        **fields,
    }
    paused = row['paused_seconds']
    assert isinstance(paused, int)
    return {**row, 'duration_seconds': duration_seconds(started_at, ended_at, paused)}


def default_breast_row(row_id: int, started_at: str, ended_at: str, **fields: object) -> dict[str, object]:
    'A finished breast feed with no weights, counted at the default (20 ml unless intake_ml says otherwise)'
    intake: dict[str, object] = {'intake_ml': 20, 'intake_estimated': True, 'intake_source': 'default'}
    return feed_row(row_id, 'breast', started_at, ended_at, **{**intake, **fields})


def express_row(row_id: int, logged_at: str, amount_ml: int | None, notes: str = '', **fields: object) -> dict[str, object]:
    '''
    An express session as the API returns it. By default one logged at a single moment, which reads
    as starting and ending at logged_at; pass ended_at (None: still running) for a timed one.
    '''
    row: dict[str, object] = {
        'id':             row_id,
        'logged_at':      logged_at,
        'started_at':     logged_at,
        'ended_at':       logged_at,
        'amount_ml':      amount_ml,
        'notes':          notes,
        'paused_seconds': 0,
        'paused_at':      None,
        **fields,
    }
    paused, ended_at = row['paused_seconds'], row['ended_at']
    assert isinstance(paused, int) and (ended_at is None or isinstance(ended_at, str))
    return {**row, 'duration_seconds': duration_seconds(logged_at, ended_at, paused)}


def empty_events(**fields: object) -> dict[str, object]:
    return {'sleeps': [], 'feeds': [], 'nappies': [], 'weights': [], 'expresses': [], **fields}


def empty_summary(start: str, end: str, **fields: object) -> dict[str, object]:
    return {
        'start':         start,
        'end':           end,
        'sleep_seconds': 0,
        'sleep_count':   0,
        'feed_count':    0,
        'bottle_count':  0,
        'breast_count':  0,
        'feed_seconds':  0,
        'intake_ml':     0,
        'estimated_ml':  0,
        'nappy_count':   0,
        'wet_count':     0,
        'dirty_count':   0,
        'weight_g':      None,
        'express_ml':    0,
        'express_count': 0,
        **fields,
    }


def error(client: TestClient, method: str, path: str, body: dict[str, object] | None = None) -> tuple[int, object]:
    'Status code and detail of a request that is expected to be refused'
    response = client.request(method, f'/api/{path}', json=body or {})
    return response.status_code, response.json()['detail']
