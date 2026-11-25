import duckdb
from fastapi.testclient import TestClient

from babytracker.api import create_app
from babytracker.db import Store

from test.helper import NOW, default_breast_row, empty_events, express_row, feed_row, post, sleep_row, utc

# The schema as it was before pausing, sides, expresses and wet sizes existed. Frozen here on purpose:
# it must keep describing databases already in use, whatever db.SCHEMA becomes.
OLD_SCHEMA = '''
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

OLD_ROWS = '''
INSERT INTO sleeps (started_at, ended_at, notes) VALUES
    ('2026-03-10 01:00:00', '2026-03-10 03:00:00', 'cot'),
    ('2026-03-10 11:00:00', NULL, '');
INSERT INTO feeds (kind, started_at, ended_at, amount_ml, weight_before_g, weight_after_g) VALUES
    ('bottle', '2026-03-10 03:10:00', '2026-03-10 03:30:00', 80, NULL, NULL),
    ('breast', '2026-03-10 06:00:00', '2026-03-10 06:30:00', NULL, 3500, 3545),
    ('breast', '2026-03-10 09:00:00', '2026-03-10 09:20:00', NULL, NULL, NULL),
    ('breast', '2026-03-10 11:45:00', NULL, NULL, NULL, NULL);
INSERT INTO nappies (logged_at, wet, dirty, dirty_size) VALUES ('2026-03-10 03:35:00', true, true, 'big');
INSERT INTO weights (logged_at, grams, notes) VALUES ('2026-03-10 07:00:00', 3510, 'clinic');
'''

WINDOW = {'start': utc('00:00'), 'end': utc('00:00', day=11)}


def build_old_database(path: str) -> None:
    with duckdb.connect(path) as conn:
        conn.execute(OLD_SCHEMA)
        conn.execute(OLD_ROWS)


def old_rows_as_served_now() -> dict[str, object]:
    return empty_events(
        sleeps  = [sleep_row(1, utc('01:00'), utc('03:00'), 'cot'), sleep_row(2, utc('11:00'), None)],
        feeds   = [
            feed_row(1, 'bottle', utc('03:10'), utc('03:30'), amount_ml=80, intake_ml=80, intake_source='measured'),
            feed_row(
                2, 'breast', utc('06:00'), utc('06:30'),
                weight_before_g=3500, weight_after_g=3545, intake_ml=45, intake_estimated=True, intake_source='weights',
            ),
            default_breast_row(3, utc('09:00'), utc('09:20')),
            feed_row(4, 'breast', utc('11:45'), None),
        ],
        nappies = [{'id': 1, 'logged_at': utc('03:35'), 'wet': True, 'dirty': True, 'wet_size': None, 'dirty_size': 'big', 'notes': ''}],
        weights = [{'id': 1, 'logged_at': utc('07:00'), 'grams': 3510, 'notes': 'clinic'}],
    )


class TestMigrationFromOldSchema:
    def test_old_rows_survive_with_defaults_for_the_new_columns(self, db_path):
        build_old_database(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            result = upgraded.get('/api/events', params=WINDOW).json()

        expected = old_rows_as_served_now()
        assert result == expected

    def test_upgrading_twice_changes_nothing(self, db_path):
        build_old_database(db_path)
        with TestClient(create_app(db_path)):
            pass
        with TestClient(create_app(db_path)) as reopened:
            result = reopened.get('/api/events', params=WINDOW).json()

        expected = old_rows_as_served_now()
        assert result == expected

    def test_stored_values_of_old_rows_are_untouched(self, db_path):
        'Read straight from the tables: original columns unchanged, new ones at their defaults'
        build_old_database(db_path)
        Store(db_path).close()
        Store(db_path).close()
        with duckdb.connect(db_path) as conn:
            result = {
                'sleeps': conn.execute('SELECT id, notes, paused_seconds, paused_at FROM sleeps ORDER BY id').fetchall(),
                'feeds':  conn.execute('''
                    SELECT id, kind, amount_ml, paused_seconds, paused_at, left_seconds, right_seconds, active_side, side_since
                    FROM feeds ORDER BY id
                ''').fetchall(),
                'nappies': conn.execute('SELECT id, wet, dirty, wet_size, dirty_size FROM nappies ORDER BY id').fetchall(),
                'counts': conn.execute('''
                    SELECT (SELECT count(*) FROM nappies), (SELECT count(*) FROM weights), (SELECT count(*) FROM expresses)
                ''').fetchall(),
            }

        expected = {
            'sleeps': [(1, 'cot', 0, None), (2, '', 0, None)],
            'feeds':  [
                (1, 'bottle', 80, 0, None, None, None, None, None),
                (2, 'breast', None, 0, None, None, None, None, None),
                (3, 'breast', None, 0, None, None, None, None, None),
                (4, 'breast', None, 0, None, None, None, None, None),
            ],
            'nappies': [(1, True, True, None, 'big')],
            'counts': [(1, 1, 0)],
        }
        assert result == expected

    def test_new_ids_continue_after_the_old_rows(self, db_path, clock):
        build_old_database(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            result = post(upgraded, 'sleeps', {'started_at': utc('08:00'), 'ended_at': utc('09:00')})

        expected = sleep_row(3, utc('08:00'), utc('09:00'))
        assert result == expected

    def test_nappy_logged_before_the_upgrade_can_take_a_wet_size(self, db_path, clock):
        build_old_database(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            result = upgraded.put('/api/nappies/1', json={'wet': True, 'dirty': True, 'wet_size': 'heavy', 'dirty_size': 'big'}).json()

        expected = {'id': 1, 'logged_at': utc('03:35'), 'wet': True, 'dirty': True, 'wet_size': 'heavy', 'dirty_size': 'big', 'notes': ''}
        assert result == expected

    def test_sleep_started_before_the_upgrade_can_be_paused(self, db_path, clock):
        build_old_database(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            result = post(upgraded, 'sleeps/2/pause')

        expected = sleep_row(2, utc('11:00'), None, paused_at=NOW)
        assert result == expected

    def test_feed_started_before_the_upgrade_can_take_a_side_and_stop(self, db_path, clock):
        build_old_database(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            post(upgraded, 'feeds/4/side', {'side': 'right'})
            clock.advance(minutes=5)
            result = post(upgraded, 'feeds/4/stop')

        expected = default_breast_row(4, utc('11:45'), utc('12:05'), left_seconds=0, right_seconds=300, active_side='right')
        assert result == expected


# The expresses table as it was before express sessions could be timed: one moment and an amount.
UNTIMED_EXPRESSES = '''
CREATE SEQUENCE IF NOT EXISTS expresses_id;

CREATE TABLE IF NOT EXISTS expresses (
    id        BIGINT PRIMARY KEY DEFAULT nextval('expresses_id'),
    logged_at TIMESTAMP NOT NULL,
    amount_ml INTEGER NOT NULL,
    notes     VARCHAR NOT NULL DEFAULT ''
);

INSERT INTO expresses (logged_at, amount_ml, notes) VALUES
    ('2026-03-10 08:00:00', 60, 'left only'),
    ('2026-03-10 10:30:00', 45, '');
'''


def build_database_with_untimed_expresses(path: str) -> None:
    build_old_database(path)
    with duckdb.connect(path) as conn:
        conn.execute(UNTIMED_EXPRESSES)


class TestMigrationOfUntimedExpresses:
    def test_old_expresses_read_as_before_with_no_length(self, db_path):
        build_database_with_untimed_expresses(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            result = upgraded.get('/api/events', params=WINDOW).json()['expresses']

        expected = [express_row(1, utc('08:00'), 60, 'left only'), express_row(2, utc('10:30'), 45)]
        assert result == expected

    def test_stored_values_of_old_expresses_are_untouched(self, db_path):
        build_database_with_untimed_expresses(db_path)
        Store(db_path).close()
        Store(db_path).close()
        with duckdb.connect(db_path) as conn:
            result = conn.execute('SELECT id, amount_ml, notes, started_at, ended_at, paused_seconds, paused_at FROM expresses ORDER BY id').fetchall()

        expected = [(1, 60, 'left only', None, None, 0, None), (2, 45, '', None, None, 0, None)]
        assert result == expected

    def test_old_expresses_still_count_in_the_summary(self, db_path, clock):
        build_database_with_untimed_expresses(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            totals = upgraded.get('/api/summary', params=WINDOW).json()
        result = (totals['express_ml'], totals['express_count'])

        expected = (105, 2)
        assert result == expected

    def test_old_express_is_not_a_running_timer(self, db_path, clock):
        build_database_with_untimed_expresses(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            status = upgraded.get('/api/status').json()
            result = (status['active']['express'], status['last']['express'], upgraded.post('/api/expresses/2/pause').status_code)

        expected = (None, express_row(2, utc('10:30'), 45), 409)
        assert result == expected

    def test_timer_starts_after_the_upgrade_beside_the_old_rows(self, db_path, clock):
        build_database_with_untimed_expresses(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            post(upgraded, 'expresses')
            clock.advance(minutes=15)
            result = post(upgraded, 'expresses/3/stop', {'amount_ml': 70})

        expected = express_row(3, NOW, 70, ended_at=utc('12:15'))
        assert result == expected

    def test_old_express_can_be_edited_into_a_timed_session(self, db_path, clock):
        build_database_with_untimed_expresses(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            body   = {'started_at': utc('07:45'), 'ended_at': utc('08:00'), 'amount_ml': 65, 'notes': 'left only'}
            result = upgraded.put('/api/expresses/1', json=body).json()

        expected = express_row(1, utc('07:45'), 65, 'left only', ended_at=utc('08:00'))
        assert result == expected
