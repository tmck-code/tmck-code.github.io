import duckdb
import pytest
from fastapi.testclient import TestClient

from babytracker.api import create_app
from babytracker.db import Store

from test.helper import NOW, default_breast_row, empty_summary, error, feed_row, post, utc
from test.test_migration import WINDOW, build_old_database, old_rows_as_served_now

DAY = {'start': utc('00:00'), 'end': utc('00:00', day=11)}


def bottle(**fields: object) -> dict[str, object]:
    'Body of a finished bottle feed, 08:00 to 08:20'
    return {'kind': 'bottle', 'started_at': utc('08:00'), 'ended_at': utc('08:20'), **fields}


class TestBottleStart:
    def test_start_with_an_amount_in_the_bottle(self, client):
        result = post(client, 'feeds', {'kind': 'bottle', 'bottle_ml': 80})

        expected = feed_row(1, 'bottle', NOW, None, bottle_ml=80)
        assert result == expected

    def test_start_without_it_leaves_it_empty(self, client):
        result = post(client, 'feeds', {'kind': 'bottle'})

        expected = feed_row(1, 'bottle', NOW, None)
        assert result == expected

    def test_running_feed_is_reported_with_it(self, client):
        post(client, 'feeds', {'kind': 'bottle', 'bottle_ml': 80})
        result = client.get('/api/status').json()['active']['feed']

        expected = feed_row(1, 'bottle', NOW, None, bottle_ml=80)
        assert result == expected


class TestBottleStop:
    def test_stop_sets_the_amount_taken_and_keeps_what_was_in_the_bottle(self, client, clock):
        post(client, 'feeds', {'kind': 'bottle', 'bottle_ml': 80})
        clock.advance(minutes=15)
        result = post(client, 'feeds/1/stop', {'amount_ml': 60})

        expected = feed_row(1, 'bottle', NOW, utc('12:15'), amount_ml=60, bottle_ml=80, intake_ml=60, intake_source='measured')
        assert result == expected

    def test_plain_stop_keeps_it_and_counts_no_intake(self, client, clock):
        post(client, 'feeds', {'kind': 'bottle', 'bottle_ml': 80})
        clock.advance(minutes=15)
        result = post(client, 'feeds/1/stop')

        expected = feed_row(1, 'bottle', NOW, utc('12:15'), bottle_ml=80)
        assert result == expected

    def test_stop_can_set_it_when_the_start_did_not(self, client, clock):
        post(client, 'feeds', {'kind': 'bottle'})
        clock.advance(minutes=15)
        result = post(client, 'feeds/1/stop', {'amount_ml': 60, 'bottle_ml': 90})

        expected = feed_row(1, 'bottle', NOW, utc('12:15'), amount_ml=60, bottle_ml=90, intake_ml=60, intake_source='measured')
        assert result == expected

    def test_stop_can_correct_it(self, client, clock):
        post(client, 'feeds', {'kind': 'bottle', 'bottle_ml': 80})
        clock.advance(minutes=15)
        result = post(client, 'feeds/1/stop', {'bottle_ml': 100})['bottle_ml']

        expected = 100
        assert result == expected


class TestBottleCreateAndEdit:
    def test_finished_feed_round_trips_both_amounts(self, client):
        post(client, 'feeds', bottle(amount_ml=60, bottle_ml=80))
        result = client.get('/api/events', params=DAY).json()['feeds']

        expected = [feed_row(1, 'bottle', utc('08:00'), utc('08:20'), amount_ml=60, bottle_ml=80, intake_ml=60, intake_source='measured')]
        assert result == expected

    def test_taken_may_be_more_than_was_in_the_bottle(self, client):
        'A top-up: the server does not compare the two'
        created = post(client, 'feeds', bottle(amount_ml=100, bottle_ml=80))
        result  = (created['amount_ml'], created['bottle_ml'], created['intake_ml'])

        expected = (100, 80, 100)
        assert result == expected

    def test_edit_changes_it(self, client):
        post(client, 'feeds', bottle(amount_ml=60, bottle_ml=80))
        result = client.put('/api/feeds/1', json=bottle(amount_ml=60, bottle_ml=90)).json()

        expected = feed_row(1, 'bottle', utc('08:00'), utc('08:20'), amount_ml=60, bottle_ml=90, intake_ml=60, intake_source='measured')
        assert result == expected

    def test_edit_with_null_clears_it(self, client):
        post(client, 'feeds', bottle(amount_ml=60, bottle_ml=80))
        result = client.put('/api/feeds/1', json=bottle(amount_ml=60, bottle_ml=None)).json()['bottle_ml']

        expected = None
        assert result == expected

    def test_edit_without_the_key_keeps_what_is_stored(self, client):
        'A page loaded before the field existed saves a feed without wiping it'
        post(client, 'feeds', bottle(amount_ml=60, bottle_ml=80))
        result = client.put('/api/feeds/1', json=bottle(amount_ml=50, notes='slow')).json()

        expected = feed_row(1, 'bottle', utc('08:00'), utc('08:20'), amount_ml=50, bottle_ml=80, intake_ml=50, intake_source='measured', notes='slow')
        assert result == expected

    def test_running_feed_can_be_edited_to_change_it(self, client):
        post(client, 'feeds', {'kind': 'bottle', 'bottle_ml': 80})
        result = client.put('/api/feeds/1', json={'kind': 'bottle', 'started_at': utc('11:50'), 'bottle_ml': 120}).json()

        expected = feed_row(1, 'bottle', utc('11:50'), None, bottle_ml=120)
        assert result == expected


class TestBottleValidation:
    @pytest.mark.parametrize('value', [-1, 2001, 'lots', 12.5])
    def test_create_rejects_a_bad_amount(self, client, value):
        result = error(client, 'POST', 'feeds', bottle(bottle_ml=value))[0]

        expected = 422
        assert result == expected

    @pytest.mark.parametrize('value', [0, 2000])
    def test_create_accepts_the_ends_of_the_range(self, client, value):
        result = post(client, 'feeds', bottle(bottle_ml=value))['bottle_ml']

        expected = value
        assert result == expected

    def test_edit_rejects_a_bad_amount(self, client):
        post(client, 'feeds', bottle(bottle_ml=80))
        result = error(client, 'PUT', 'feeds/1', bottle(bottle_ml=2001))[0]

        expected = 422
        assert result == expected

    def test_stop_rejects_a_bad_amount_and_leaves_the_feed_running(self, client):
        post(client, 'feeds', {'kind': 'bottle', 'bottle_ml': 80})
        status = error(client, 'POST', 'feeds/1/stop', {'bottle_ml': -5})[0]
        result = (status, client.get('/api/status').json()['active']['feed'])

        expected = (422, feed_row(1, 'bottle', NOW, None, bottle_ml=80))
        assert result == expected


class TestBottleAmountOnBreastFeeds:
    def test_create_ignores_it(self, client):
        result = post(client, 'feeds', {'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:20'), 'bottle_ml': 80})

        expected = default_breast_row(1, utc('08:00'), utc('08:20'))
        assert result == expected

    def test_start_ignores_it(self, client):
        result = post(client, 'feeds', {'kind': 'breast', 'side': 'left', 'bottle_ml': 80})

        expected = feed_row(1, 'breast', NOW, None, left_seconds=0, right_seconds=0, active_side='left', side_since=NOW)
        assert result == expected

    def test_stop_ignores_it(self, client, clock):
        post(client, 'feeds', {'kind': 'breast'})
        clock.advance(minutes=10)
        result = post(client, 'feeds/1/stop', {'bottle_ml': 80})

        expected = default_breast_row(1, NOW, utc('12:10'))
        assert result == expected

    def test_bottle_feed_edited_into_a_breast_feed_loses_it(self, client):
        post(client, 'feeds', bottle(amount_ml=60, bottle_ml=80))
        result = client.put('/api/feeds/1', json={**bottle(), 'kind': 'breast'}).json()

        expected = default_breast_row(1, utc('08:00'), utc('08:20'))
        assert result == expected


class TestBottleAmountIsNotIntake:
    def test_finished_feed_with_no_amount_taken_has_no_intake(self, client):
        result = post(client, 'feeds', bottle(bottle_ml=80))

        expected = feed_row(1, 'bottle', utc('08:00'), utc('08:20'), bottle_ml=80)
        assert result == expected

    def test_summary_counts_only_what_was_taken(self, client):
        post(client, 'feeds', bottle(amount_ml=60, bottle_ml=80))
        post(client, 'feeds', {**bottle(bottle_ml=120), 'started_at': utc('10:00'), 'ended_at': utc('10:10')})
        post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('11:50'), 'bottle_ml': 90})
        result = client.get('/api/summary', params=DAY).json()

        expected = empty_summary(DAY['start'], DAY['end'], feed_count=3, bottle_count=3, feed_seconds=40 * 60, intake_ml=60)
        assert result == expected

    def test_summary_is_the_same_with_and_without_it(self, client, db_path, tmp_path, clock):
        feeds = [bottle(amount_ml=60), {**bottle(amount_ml=45), 'started_at': utc('10:00'), 'ended_at': utc('10:10')}]
        for feed in feeds:
            post(client, 'feeds', {**feed, 'bottle_ml': 150})
        with TestClient(create_app(str(tmp_path / 'plain.duckdb'))) as plain:
            for feed in feeds:
                post(plain, 'feeds', feed)
            expected = plain.get('/api/summary', params=DAY).json()

        result = client.get('/api/summary', params=DAY).json()
        assert result == expected

    def test_daily_totals_count_only_what_was_taken(self, client):
        post(client, 'feeds', bottle(amount_ml=60, bottle_ml=80))
        post(client, 'feeds', {**bottle(bottle_ml=120), 'started_at': utc('10:00'), 'ended_at': utc('10:10')})
        day    = client.get('/api/daily', params={'tz': 'UTC', 'start': '2026-03-10', 'end': '2026-03-10'}).json()[0]
        result = (day['intake_ml'], day['estimated_ml'], day['bottle_count'])

        expected = (60, 0, 2)
        assert result == expected


class TestBottleMigration:
    def test_old_rows_read_back_with_none(self, db_path):
        build_old_database(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            feeds = upgraded.get('/api/events', params=WINDOW).json()['feeds']
        result = [feed['bottle_ml'] for feed in feeds]

        expected = [None, None, None, None]
        assert result == expected

    def test_column_is_added_once_and_old_values_are_untouched(self, db_path):
        build_old_database(db_path)
        Store(db_path).close()
        Store(db_path).close()
        with duckdb.connect(db_path) as conn:
            result = conn.execute('SELECT id, kind, amount_ml, bottle_ml FROM feeds ORDER BY id').fetchall()

        expected = [(1, 'bottle', 80, None), (2, 'breast', None, None), (3, 'breast', None, None), (4, 'breast', None, None)]
        assert result == expected

    def test_old_summary_is_unchanged(self, db_path, clock):
        build_old_database(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            totals = upgraded.get('/api/summary', params=WINDOW).json()
        result = (totals['intake_ml'], totals['estimated_ml'], totals['feed_count'])

        expected = (80 + 45 + 20, 45 + 20, 4)
        assert result == expected

    def test_old_bottle_feed_saved_unchanged_reads_the_same(self, db_path, clock):
        build_old_database(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            body   = {'kind': 'bottle', 'started_at': utc('03:10'), 'ended_at': utc('03:30'), 'amount_ml': 80, 'bottle_ml': None, 'notes': ''}
            result = upgraded.put('/api/feeds/1', json=body).json()

        expected = old_rows_as_served_now()['feeds'][0]
        assert result == expected

    def test_old_bottle_feed_can_take_an_amount_in_the_bottle(self, db_path, clock):
        build_old_database(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            body   = {'kind': 'bottle', 'started_at': utc('03:10'), 'ended_at': utc('03:30'), 'amount_ml': 80, 'bottle_ml': 100}
            result = upgraded.put('/api/feeds/1', json=body).json()

        expected = feed_row(1, 'bottle', utc('03:10'), utc('03:30'), amount_ml=80, bottle_ml=100, intake_ml=80, intake_source='measured')
        assert result == expected
