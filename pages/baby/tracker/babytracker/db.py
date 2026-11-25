'DuckDB storage: one shared connection guarded by a lock (DuckDB is single-writer).'

from __future__ import annotations

import threading
from datetime import datetime, timezone
from pathlib import Path

import duckdb

Row = dict[str, object]

# All TIMESTAMP columns hold naive UTC. They are converted at this boundary:
# aware -> naive UTC on the way in, naive -> aware UTC on the way out.
SCHEMA = '''
CREATE SEQUENCE IF NOT EXISTS sleeps_id;
CREATE SEQUENCE IF NOT EXISTS feeds_id;
CREATE SEQUENCE IF NOT EXISTS nappies_id;
CREATE SEQUENCE IF NOT EXISTS weights_id;

CREATE TABLE IF NOT EXISTS sleeps (
    id         BIGINT PRIMARY KEY DEFAULT nextval('sleeps_id'),
    started_at TIMESTAMP NOT NULL,
    ended_at   TIMESTAMP,
    notes      VARCHAR NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS feeds (
    id              BIGINT PRIMARY KEY DEFAULT nextval('feeds_id'),
    kind            VARCHAR NOT NULL CHECK (kind IN ('bottle', 'breast')),
    started_at      TIMESTAMP NOT NULL,
    ended_at        TIMESTAMP,
    amount_ml       INTEGER,
    weight_before_g INTEGER,
    weight_after_g  INTEGER,
    notes           VARCHAR NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS nappies (
    id         BIGINT PRIMARY KEY DEFAULT nextval('nappies_id'),
    logged_at         TIMESTAMP NOT NULL,
    wet        BOOLEAN NOT NULL DEFAULT false,
    dirty      BOOLEAN NOT NULL DEFAULT false,
    wet_size   VARCHAR CHECK (wet_size IN ('light', 'heavy')),
    dirty_size VARCHAR CHECK (dirty_size IN ('small', 'big')),
    notes      VARCHAR NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS weights (
    id    BIGINT PRIMARY KEY DEFAULT nextval('weights_id'),
    logged_at    TIMESTAMP NOT NULL,
    grams INTEGER NOT NULL,
    notes VARCHAR NOT NULL DEFAULT ''
);
'''

# Upgrades a database made by an earlier version, in place, at every startup. Additive only and
# safe to repeat: existing rows are never rewritten, they just read the new columns' defaults
# (DuckDB cannot add a NOT NULL column, so these are nullable and the models coerce NULL).
MIGRATION = '''
CREATE SEQUENCE IF NOT EXISTS expresses_id;

CREATE TABLE IF NOT EXISTS expresses (
    id        BIGINT PRIMARY KEY DEFAULT nextval('expresses_id'),
    logged_at TIMESTAMP NOT NULL,
    amount_ml INTEGER NOT NULL,
    notes     VARCHAR NOT NULL DEFAULT ''
);

ALTER TABLE sleeps ADD COLUMN IF NOT EXISTS paused_seconds INTEGER DEFAULT 0;
ALTER TABLE sleeps ADD COLUMN IF NOT EXISTS paused_at      TIMESTAMP;
ALTER TABLE feeds  ADD COLUMN IF NOT EXISTS paused_seconds INTEGER DEFAULT 0;
ALTER TABLE feeds  ADD COLUMN IF NOT EXISTS paused_at      TIMESTAMP;
ALTER TABLE feeds  ADD COLUMN IF NOT EXISTS left_seconds   INTEGER;
ALTER TABLE feeds  ADD COLUMN IF NOT EXISTS right_seconds  INTEGER;
ALTER TABLE feeds  ADD COLUMN IF NOT EXISTS active_side    VARCHAR;
ALTER TABLE feeds  ADD COLUMN IF NOT EXISTS side_since     TIMESTAMP;
-- DuckDB cannot add a column with a CHECK constraint: on upgraded databases the model alone validates it.
ALTER TABLE nappies ADD COLUMN IF NOT EXISTS wet_size VARCHAR;
-- An express session timed like a feed. started_at NULL: a session logged at one moment (logged_at),
-- as every row was before the timer. Timed rows keep logged_at = started_at, and hold amount_ml 0
-- until an amount is given (the column is NOT NULL); the model reads that 0 as "no amount yet".
ALTER TABLE expresses ADD COLUMN IF NOT EXISTS started_at     TIMESTAMP;
ALTER TABLE expresses ADD COLUMN IF NOT EXISTS ended_at       TIMESTAMP;
ALTER TABLE expresses ADD COLUMN IF NOT EXISTS paused_seconds INTEGER DEFAULT 0;
ALTER TABLE expresses ADD COLUMN IF NOT EXISTS paused_at      TIMESTAMP;
-- What was in the bottle of a bottle feed (amount_ml is what the baby took of it). NULL: not recorded,
-- as on every feed from before the column existed. It is never part of intake.
ALTER TABLE feeds  ADD COLUMN IF NOT EXISTS bottle_ml      INTEGER;

-- The Settings page's figures for unweighed breast feeds, as a history: a feed uses the latest row
-- with effective_from <= its start (NULL: from the beginning). No rows: nothing is overridden.
CREATE SEQUENCE IF NOT EXISTS breast_settings_id;

CREATE TABLE IF NOT EXISTS breast_settings (
    id                     BIGINT PRIMARY KEY DEFAULT nextval('breast_settings_id'),
    effective_from         TIMESTAMP,
    default_ml             INTEGER,
    manual_rate_ml_per_min DOUBLE,
    created_at             TIMESTAMP NOT NULL
);

-- Reminders: a recurring task ("bath, every 2 days at 08:00") and each time it was ticked off.
-- every + unit is the cadence (unit 'once': one occurrence, on on_date 'YYYY-MM-DD' at at_time);
-- at_time ('HH:MM') and tz (IANA) are wall-clock, so the due moments are
-- worked out on read (babytracker/reminders.py), never stored. anchor_at is where the schedule starts
-- counting from: creation, or the last time the cadence was changed or the reminder resumed.
CREATE SEQUENCE IF NOT EXISTS reminders_id;
CREATE SEQUENCE IF NOT EXISTS reminder_completions_id;

CREATE TABLE IF NOT EXISTS reminders (
    id          BIGINT PRIMARY KEY DEFAULT nextval('reminders_id'),
    title       VARCHAR NOT NULL,
    description VARCHAR NOT NULL DEFAULT '',
    every       INTEGER NOT NULL,
    unit        VARCHAR NOT NULL CHECK (unit IN ('hours', 'days', 'weeks', 'once')),
    at_time     VARCHAR,
    on_date     VARCHAR,
    tz          VARCHAR NOT NULL,
    icon        VARCHAR NOT NULL DEFAULT 'bell',
    colour      VARCHAR NOT NULL DEFAULT 'neutral',
    active      BOOLEAN NOT NULL DEFAULT true,
    anchor_at   TIMESTAMP NOT NULL,
    created_at  TIMESTAMP NOT NULL
);

-- due_at is the occurrence the tick counted for (ticking early satisfies the upcoming one).
CREATE TABLE IF NOT EXISTS reminder_completions (
    id           BIGINT PRIMARY KEY DEFAULT nextval('reminder_completions_id'),
    reminder_id  BIGINT NOT NULL,
    completed_at TIMESTAMP NOT NULL,
    due_at       TIMESTAMP
);
'''

TIMED_TABLES   = ('sleeps', 'feeds', 'expresses')
INSTANT_TABLES = ('nappies', 'weights')
TABLES         = TIMED_TABLES + INSTANT_TABLES
# An express logged at one moment has neither started_at nor ended_at, and is not in progress.
IN_PROGRESS    = 'started_at IS NOT NULL AND ended_at IS NULL'
SETTINGS_TABLE = 'breast_settings'
REMINDERS      = 'reminders'
COMPLETIONS    = 'reminder_completions'


def utcnow() -> datetime:
    'Current time, truncated to whole seconds'
    return datetime.now(timezone.utc).replace(microsecond=0)


def _to_db(value: object) -> object:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _from_db(value: object) -> object:
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc)
    return value


class Store:
    'Thin data-access layer. Table names only ever come from the TABLES constants.'

    def __init__(self, path: str) -> None:
        if path != ':memory:':
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.lock  = threading.RLock()
        self._conn = duckdb.connect(path)
        self._conn.execute(SCHEMA)
        self._conn.execute(MIGRATION)

    def close(self) -> None:
        with self.lock:
            self._conn.close()

    def query(self, sql: str, params: list[object] | None = None) -> list[Row]:
        with self.lock:
            cursor  = self._conn.execute(sql, [_to_db(p) for p in params or []])
            columns = [d[0] for d in cursor.description or []]
            rows    = cursor.fetchall()
        return [{c: _from_db(v) for c, v in zip(columns, row)} for row in rows]

    def insert(self, table: str, values: Row) -> Row:
        columns = ', '.join(values)
        marks   = ', '.join('?' for _ in values)
        return self.query(f'INSERT INTO {table} ({columns}) VALUES ({marks}) RETURNING *', list(values.values()))[0]

    def update(self, table: str, row_id: int, values: Row) -> Row | None:
        assignments = ', '.join(f'{c} = ?' for c in values)
        rows        = self.query(f'UPDATE {table} SET {assignments} WHERE id = ? RETURNING *', [*values.values(), row_id])
        return rows[0] if rows else None

    def delete(self, table: str, row_id: int) -> bool:
        return bool(self.query(f'DELETE FROM {table} WHERE id = ? RETURNING id', [row_id]))

    def get(self, table: str, row_id: int) -> Row | None:
        rows = self.query(f'SELECT * FROM {table} WHERE id = ?', [row_id])
        return rows[0] if rows else None

    def in_progress(self, table: str) -> Row | None:
        'The open (started, no end time) row of a timed table, if any'
        rows = self.query(f'SELECT * FROM {table} WHERE {IN_PROGRESS} ORDER BY started_at DESC LIMIT 1')
        return rows[0] if rows else None

    def latest(self, table: str, column: str, where: str = 'true') -> Row | None:
        rows = self.query(f'SELECT * FROM {table} WHERE {where} ORDER BY {column} DESC LIMIT 1')
        return rows[0] if rows else None

    def overlapping(self, table: str, start: datetime, end: datetime) -> list[Row]:
        'Timed rows that overlap [start, end); in-progress rows count as still running'
        sql = f'SELECT * FROM {table} WHERE started_at < ? AND (ended_at IS NULL OR ended_at > ?) ORDER BY started_at'
        return self.query(sql, [end, start])

    def weighed_breast_feeds(self) -> list[Row]:
        'Finished breast feeds weighed before and after, whenever they were'
        where = "kind = 'breast' AND ended_at IS NOT NULL AND weight_before_g IS NOT NULL AND weight_after_g IS NOT NULL"
        return self.query(f'SELECT * FROM feeds WHERE {where}')

    def breast_settings(self) -> list[Row]:
        'Every saved settings row, in the order they take effect (same moment: in the order saved)'
        return self.query(f'SELECT * FROM {SETTINGS_TABLE} ORDER BY effective_from NULLS FIRST, id')

    def replace_breast_settings(self, values: Row | None) -> None:
        'Drop the whole settings history, leaving the one given row (or none) in its place'
        with self.lock:
            self._conn.execute('BEGIN')
            try:
                self.query(f'DELETE FROM {SETTINGS_TABLE}')
                if values is not None:
                    self.insert(SETTINGS_TABLE, values)
                self._conn.execute('COMMIT')
            except Exception:
                self._conn.execute('ROLLBACK')
                raise

    def reminders(self) -> list[Row]:
        return self.query(f'SELECT * FROM {REMINDERS} ORDER BY id')

    def completions(self, reminder_id: int, limit: int) -> list[Row]:
        'The ticks of one reminder, newest first'
        sql = f'SELECT * FROM {COMPLETIONS} WHERE reminder_id = ? ORDER BY completed_at DESC, id DESC LIMIT ?'
        return self.query(sql, [reminder_id, limit])

    def reminder_progress(self) -> dict[object, Row]:
        '''
        What the ticks of each reminder come to, by reminder id, in one query: the latest tick, and
        of the ticks since the schedule's anchor the latest and the furthest occurrence ticked.
        '''
        sql = f'''
            SELECT c.reminder_id,
                   max(c.completed_at)                                               AS last_completed_at,
                   arg_max(c.id, c.completed_at)                                     AS last_id,
                   max(c.completed_at) FILTER (WHERE c.completed_at >= r.anchor_at)  AS counted_at,
                   max(c.due_at)       FILTER (WHERE c.completed_at >= r.anchor_at)  AS counted_due_at
            FROM {COMPLETIONS} c JOIN {REMINDERS} r ON r.id = c.reminder_id
            GROUP BY c.reminder_id
        '''
        return {row['reminder_id']: row for row in self.query(sql)}

    def delete_reminder(self, reminder_id: int) -> bool:
        'Drop a reminder together with its ticks'
        with self.lock:
            self._conn.execute('BEGIN')
            try:
                self.query(f'DELETE FROM {COMPLETIONS} WHERE reminder_id = ?', [reminder_id])
                found = self.delete(REMINDERS, reminder_id)
                self._conn.execute('COMMIT')
            except Exception:
                self._conn.execute('ROLLBACK')
                raise
        return found

    def between(self, table: str, start: datetime, end: datetime) -> list[Row]:
        'Instant rows with start <= logged_at < end'
        return self.query(f'SELECT * FROM {table} WHERE logged_at >= ? AND logged_at < ? ORDER BY logged_at', [start, end])

    def earliest_timestamp(self) -> datetime | None:
        sql = '''
            SELECT min(t) AS t FROM (
                SELECT min(started_at) AS t FROM sleeps
                UNION ALL SELECT min(started_at) FROM feeds
                UNION ALL SELECT min(logged_at) FROM nappies
                UNION ALL SELECT min(logged_at) FROM weights
                UNION ALL SELECT min(logged_at) FROM expresses
            )
        '''
        value = self.query(sql)[0]['t']
        return value if isinstance(value, datetime) else None
