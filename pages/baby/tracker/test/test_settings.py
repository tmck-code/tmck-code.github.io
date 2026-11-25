import duckdb
import pytest
from fastapi.testclient import TestClient

from babytracker import rate
from babytracker.api import create_app

from test.helper import NOW, default_breast_row, feed_row, post, utc
from test.test_migration import build_old_database, old_rows_as_served_now
from test.test_migration import WINDOW as OLD_WINDOW
from test.test_rate import feeds_in, log_three_weighed_feeds, rate_row, unweighed, weighed

SETTINGS = '/api/settings/breast-estimate'
DAY      = {'start': utc('00:00'), 'end': utc('00:00', day=11)}
MAX_SEC  = rate.BREAST_RATE_MAX_SECONDS


def save(client, scope: str, default_ml: int | None = None, manual_rate: float | None = None) -> dict[str, object]:
    response = client.put(SETTINGS, json={'default_ml': default_ml, 'manual_rate_ml_per_min': manual_rate, 'scope': scope})
    assert response.status_code == 200, response.text
    result: dict[str, object] = response.json()
    return result


def manual_row(row_id: int, started_at: str, ended_at: str, intake_ml: int, ml_per_min: float, **fields: object) -> dict[str, object]:
    'A finished unweighed breast feed, estimated from its length at the rate set in Settings'
    return rate_row(row_id, started_at, ended_at, intake_ml, ml_per_min=ml_per_min, feeds=None, intake_source='manual_rate', **fields)


def intakes(client, window: dict[str, str] = DAY) -> dict[int, tuple[object, object]]:
    return {i: (f['intake_ml'], f['intake_source']) for i, f in feeds_in(client, window).items()}


def history(client) -> list[tuple[object, object, object]]:
    'The saved rows, oldest first: (effective_from, default_ml, manual rate)'
    rows = client.get(SETTINGS).json()['history'][::-1]
    return [(r['effective_from'], r['default_ml'], r['manual_rate_ml_per_min']) for r in rows]


class TestNoSettingsSaved:
    def test_nothing_is_overridden(self, client):
        result = client.get(SETTINGS).json()

        expected = (None, [], 20, {'source': 'default', 'ml_per_min': None, 'feeds': None, 'default_ml': 20, 'examples': [
            {'minutes': 10, 'ml': 20}, {'minutes': 20, 'ml': 20},
        ]})
        assert (result['current'], result['history'], result['env_default_ml'], result['in_force']) == expected

    def test_env_default_is_the_fallback(self, client, monkeypatch):
        monkeypatch.setattr('babytracker.models.BREAST_DEFAULT_ML', 35)
        result = client.get(SETTINGS).json()

        expected = (35, 35)
        assert (result['env_default_ml'], result['in_force']['default_ml']) == expected


class TestScopeAll:
    def test_default_change_re_estimates_default_feeds_everywhere(self, client):
        unweighed(client, utc('08:00'), utc('08:20'))
        unweighed(client, utc('07:00', day=9), utc('07:20', day=9))
        save(client, 'all', default_ml=35)
        result = {
            'feed':    intakes(client),
            'earlier': intakes(client, {'start': utc('00:00', day=9), 'end': utc('00:00')}),
            'summary': client.get('/api/summary', params=DAY).json()['intake_ml'],
            'daily':   [d['intake_ml'] for d in client.get('/api/daily', params={'tz': 'UTC', 'start': '2026-03-09', 'end': '2026-03-10'}).json()],
            'rate':    client.get('/api/breast-rate', params={'at': utc('08:00')}).json()['default_ml'],
        }

        expected = {'feed': {1: (35, 'default')}, 'earlier': {2: (35, 'default')}, 'summary': 35, 'daily': [35, 35], 'rate': 35}
        assert result == expected

    def test_history_is_one_row_from_the_beginning(self, client):
        save(client, 'all', default_ml=35)
        result = client.get(SETTINGS).json()

        row      = {'id': 1, 'effective_from': None, 'default_ml': 35, 'manual_rate_ml_per_min': None, 'created_at': NOW}
        expected = (row, [row])
        assert (result['current'], result['history']) == expected

    def test_manual_rate_applies_with_too_few_weighed_feeds(self, client):
        unweighed(client, utc('08:00'), utc('08:10'))
        save(client, 'all', manual_rate=2.0)
        result = feeds_in(client, DAY)[1]

        expected = manual_row(1, utc('08:00'), utc('08:10'), intake_ml=20, ml_per_min=2.0)
        assert result == expected

    def test_manual_rate_replaces_the_calculated_rate(self, client):
        log_three_weighed_feeds(client)
        before = unweighed(client, utc('08:00'), utc('08:12'))
        save(client, 'all', manual_rate=4.0)
        result = [before, feeds_in(client, DAY)[4]]

        expected = [
            rate_row(4, utc('08:00'), utc('08:12'), intake_ml=30),
            manual_row(4, utc('08:00'), utc('08:12'), intake_ml=48, ml_per_min=4.0),
        ]
        assert result == expected

    def test_manual_rate_keeps_the_cap_and_the_floor(self, client):
        unweighed(client, utc('06:00'), utc('07:00'))
        unweighed(client, utc('08:00'), utc('08:01'))
        save(client, 'all', manual_rate=0.2)
        result = intakes(client)

        expected = {1: (9, 'manual_rate'), 2: (1, 'manual_rate')}
        assert result == expected

    def test_feed_of_no_length_counts_the_saved_default_even_with_a_manual_rate(self, client):
        unweighed(client, utc('08:00'), utc('08:00'))
        save(client, 'all', default_ml=12, manual_rate=2.0)
        result = feeds_in(client, DAY)[1]

        expected = default_breast_row(1, utc('08:00'), utc('08:00'), intake_ml=12)
        assert result == expected

    def test_collapses_a_history_of_future_rows(self, client, clock):
        unweighed(client, utc('08:00'), utc('08:20'))
        save(client, 'future', default_ml=30)
        clock.advance(minutes=60)
        save(client, 'future', default_ml=40)
        unweighed(client, utc('13:30'), utc('13:50'))
        clock.advance(minutes=60)
        save(client, 'all', default_ml=50)
        result = (history(client), intakes(client))

        expected = ([(None, 50, None)], {1: (50, 'default'), 2: (50, 'default')})
        assert result == expected


class TestScopeFuture:
    def test_first_ever_save_leaves_earlier_feeds_as_they_were(self, client, clock):
        'Nothing is backfilled: before the row, the configured default and the calculated rate still apply'
        log_three_weighed_feeds(client)
        unweighed(client, utc('08:00'), utc('08:12'))
        unweighed(client, utc('09:00'), utc('09:00'))
        before = intakes(client)
        save(client, 'future', default_ml=35, manual_rate=4.0)
        clock.advance(minutes=30)
        unweighed(client, utc('12:10'), utc('12:22'))
        unweighed(client, utc('12:25'), utc('12:25'))
        result = (before, intakes(client), history(client))

        earlier  = {4: (30, 'rate'), 5: (20, 'default')}
        expected = (earlier, {**earlier, 6: (48, 'manual_rate'), 7: (35, 'default')}, [(NOW, 35, 4.0)])
        assert result == expected

    def test_feed_starting_at_the_moment_of_saving_takes_the_new_figures(self, client):
        save(client, 'future', default_ml=35)
        unweighed(client, utc('11:59'), utc('12:10'))
        unweighed(client, NOW, utc('12:10'))
        result = intakes(client)

        expected = {1: (20, 'default'), 2: (35, 'default')}
        assert result == expected

    def test_second_change_layers_on_the_first(self, client, clock):
        unweighed(client, utc('11:00'), utc('11:20'))
        save(client, 'future', default_ml=30)
        unweighed(client, utc('12:30'), utc('12:50'))
        clock.advance(minutes=60)
        save(client, 'future', default_ml=40, manual_rate=1.0)
        unweighed(client, utc('13:30'), utc('13:50'))
        unweighed(client, utc('13:55'), utc('13:55'))
        result = (intakes(client), history(client))

        expected = (
            {1: (20, 'default'), 2: (30, 'default'), 3: (20, 'manual_rate'), 4: (40, 'default')},
            [(NOW, 30, None), (utc('13:00'), 40, 1.0)],
        )
        assert result == expected

    def test_going_back_to_calculated_only_from_now_keeps_earlier_manual_estimates(self, client, clock):
        log_three_weighed_feeds(client)
        save(client, 'all', manual_rate=4.0)
        unweighed(client, utc('08:00'), utc('08:12'))
        save(client, 'future')
        clock.advance(minutes=30)
        unweighed(client, utc('12:10'), utc('12:22'))
        result = (intakes(client), history(client))

        expected = ({4: (48, 'manual_rate'), 5: (30, 'rate')}, [(None, None, 4.0), (NOW, None, None)])
        assert result == expected

    def test_saving_what_is_already_in_force_adds_no_row(self, client, clock):
        save(client, 'future')
        save(client, 'future', default_ml=30)
        clock.advance(minutes=5)
        save(client, 'future', default_ml=30)
        result = history(client)

        expected = [(NOW, 30, None)]
        assert result == expected

    def test_current_is_the_row_in_force_now(self, client, clock):
        save(client, 'all', default_ml=25)
        clock.advance(minutes=5)
        save(client, 'future', manual_rate=3.0)
        result = client.get(SETTINGS).json()

        expected = (2, {'source': 'manual_rate', 'ml_per_min': 3.0, 'feeds': None, 'default_ml': 20, 'examples': [
            {'minutes': 10, 'ml': 30}, {'minutes': 20, 'ml': 60},
        ]})
        assert (result['current']['id'], result['in_force']) == expected


class TestReset:
    def test_delete_restores_the_original_figures(self, client, clock):
        log_three_weighed_feeds(client)
        unweighed(client, utc('08:00'), utc('08:12'))
        unweighed(client, utc('09:00'), utc('09:00'))
        original = feeds_in(client, DAY)
        save(client, 'all', default_ml=35, manual_rate=4.0)
        clock.advance(minutes=5)
        save(client, 'future', default_ml=50)
        changed  = feeds_in(client, DAY)
        response = client.delete(SETTINGS)
        result   = (changed != original, response.status_code, response.json()['history'], feeds_in(client, DAY))

        expected = (True, 200, [], original)
        assert result == expected

    def test_saving_no_overrides_for_all_feeds_is_the_same_reset(self, client):
        unweighed(client, utc('08:00'), utc('08:12'))
        save(client, 'all', default_ml=35, manual_rate=4.0)
        save(client, 'all')
        result = (history(client), intakes(client))

        expected = ([], {1: (20, 'default')})
        assert result == expected


class TestValidation:
    @pytest.mark.parametrize('body', [
        {'default_ml': -1, 'scope': 'all'},
        {'default_ml': rate.BREAST_DEFAULT_MAX_ML + 1, 'scope': 'all'},
        {'default_ml': 20.5, 'scope': 'all'},
        {'default_ml': 'lots', 'scope': 'all'},
        {'manual_rate_ml_per_min': 0, 'scope': 'all'},
        {'manual_rate_ml_per_min': -2.5, 'scope': 'all'},
        {'manual_rate_ml_per_min': rate.BREAST_MANUAL_RATE_MAX + 0.1, 'scope': 'all'},
        {'default_ml': 20},
        {'default_ml': 20, 'scope': 'past'},
    ])
    def test_bad_values_are_refused_and_nothing_is_saved(self, client, body):
        response = client.put(SETTINGS, json=body)
        result   = (response.status_code, history(client))

        expected = (422, [])
        assert result == expected

    def test_limits_are_accepted(self, client):
        save(client, 'all', default_ml=0, manual_rate=rate.BREAST_MANUAL_RATE_MAX)
        save(client, 'future', default_ml=rate.BREAST_DEFAULT_MAX_ML, manual_rate=0.1)
        result = history(client)

        expected = [(None, 0, rate.BREAST_MANUAL_RATE_MAX), (NOW, rate.BREAST_DEFAULT_MAX_ML, 0.1)]
        assert result == expected


class TestUnaffectedFeeds:
    def test_weighed_and_bottle_feeds_ignore_the_settings(self, client):
        weighed(client, utc('06:00'), utc('06:20'), 45)
        post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('07:00'), 'ended_at': utc('07:15'), 'amount_ml': 80})
        post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('08:00'), 'ended_at': utc('08:15')})
        original = feeds_in(client, DAY)
        save(client, 'all', default_ml=99, manual_rate=9.0)
        result = feeds_in(client, DAY)

        expected = original
        assert result == expected
        assert [f['intake_ml'] for f in result.values()] == [45, 80, None]


class TestEverythingAgrees:
    def test_summary_daily_and_breast_rate_match_the_feeds(self, client, clock):
        log_three_weighed_feeds(client)
        unweighed(client, utc('08:00'), utc('08:12'))
        unweighed(client, utc('09:00'), utc('09:00'))
        post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('10:00'), 'ended_at': utc('10:15'), 'amount_ml': 80})
        save(client, 'future', default_ml=35, manual_rate=4.0)
        clock.advance(minutes=30)
        unweighed(client, utc('12:10'), utc('12:22'))
        unweighed(client, utc('12:25'), utc('12:25'))
        feeds   = feeds_in(client, DAY)
        breast  = sum(f['intake_ml'] for f in feeds.values() if f['kind'] == 'breast')
        summary = client.get('/api/summary', params=DAY).json()
        daily   = client.get('/api/daily', params={'tz': 'UTC', 'start': '2026-03-10', 'end': '2026-03-10'}).json()[0]
        rates   = [client.get('/api/breast-rate', params={'at': at}).json() for at in (utc('08:00'), utc('12:10'))]
        result  = {
            'feeds':   [f['intake_ml'] for f in feeds.values()],
            'summary': (summary['intake_ml'], summary['estimated_ml']),
            'daily':   (daily['intake_ml'], daily['estimated_ml']),
            'rates':   [(r['ml_per_min'], r['feeds'], r['default_ml']) for r in rates],
        }

        expected = {
            'feeds':   [30, 20, 80, 48, 35],
            'summary': (213, 133),
            'daily':   (213, 133),
            'rates':   [(2.5, 3, 20), (4.0, None, 35)],
        }
        assert result == expected
        assert breast == summary['estimated_ml']

    def test_running_feed_carries_the_manual_rate_for_its_live_estimate(self, client, clock):
        save(client, 'all', manual_rate=3.0)
        post(client, 'feeds', {'kind': 'breast'})
        clock.advance(minutes=10)
        running = client.get('/api/status').json()['active']['feed']
        stopped = post(client, 'feeds/1/stop')
        last    = client.get('/api/status').json()['last']['breast']
        result  = (running, stopped, last)

        live     = feed_row(1, 'breast', NOW, None, intake_rate_ml_per_min=3.0, intake_rate_max_seconds=MAX_SEC)
        finished = manual_row(1, NOW, utc('12:10'), intake_ml=30, ml_per_min=3.0)
        expected = (live, finished, finished)
        assert result == expected

    def test_feed_running_since_before_a_future_save_keeps_its_figures(self, client, clock):
        post(client, 'feeds', {'kind': 'breast', 'started_at': utc('11:50')})
        save(client, 'future', manual_rate=3.0)
        result = client.get('/api/status').json()['active']['feed']

        expected = feed_row(1, 'breast', utc('11:50'), None)
        assert result == expected


class TestMigration:
    def test_old_database_gains_the_table_and_serves_the_same_numbers(self, db_path):
        build_old_database(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            result = (upgraded.get('/api/events', params=OLD_WINDOW).json(), upgraded.get(SETTINGS).json()['history'])

        expected = (old_rows_as_served_now(), [])
        assert result == expected

    def test_settings_saved_on_an_upgraded_database_survive_a_restart(self, db_path, clock):
        build_old_database(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            save(upgraded, 'all', default_ml=35)
        with TestClient(create_app(db_path)) as reopened:
            result = (history(reopened), intakes(reopened, OLD_WINDOW)[3])

        expected = ([(None, 35, None)], (35, 'default'))
        assert result == expected

    def test_table_is_created_empty(self, db_path):
        build_old_database(db_path)
        with TestClient(create_app(db_path)):
            pass
        with duckdb.connect(db_path) as conn:
            result = conn.execute('SELECT count(*) FROM breast_settings').fetchall()

        expected = [(0,)]
        assert result == expected


class TestBreakdown:
    def test_rule_constants_come_from_the_rate_module(self, client):
        result = client.get(SETTINGS).json()

        expected = (
            {
                'recent_feeds':    rate.BREAST_RATE_FEEDS,
                'min_feeds':       rate.BREAST_RATE_MIN_FEEDS,
                'max_seconds':     MAX_SEC,
                'min_ml':          rate.BREAST_RATE_MIN_ML,
                'ref_min_ml':      1,
                'ref_max_ml':      rate.BREAST_REF_MAX_ML,
                'ref_min_seconds': rate.BREAST_REF_MIN_SECONDS,
            },
            {'default_ml_max': rate.BREAST_DEFAULT_MAX_ML, 'manual_rate_max': rate.BREAST_MANUAL_RATE_MAX},
        )
        assert (result['rule'], result['limits']) == expected

    def test_lists_every_weighed_feed_newest_first_with_its_figures(self, client):
        log_three_weighed_feeds(client)
        unweighed(client, utc('08:00'), utc('08:12'))
        listed = client.get(SETTINGS).json()['weighed']
        result = [{k: v for k, v in w.items() if k != 'feed'} for w in listed]

        def row(row_id: int, start: str, end: str, seconds: int, ml: int, ml_per_min: float) -> dict[str, object]:
            return {
                'id': row_id, 'started_at': utc(start, day=9), 'ended_at': utc(end, day=9), 'duration_seconds': seconds,
                'weight_before_g': 3500, 'weight_after_g': 3500 + ml, 'ml': ml, 'ml_per_min': ml_per_min,
                'used': True, 'reason': 'used', 'reason_text': 'used',
            }

        expected = [row(3, '16:00', '16:10', 600, 20, 2.0), row(2, '12:00', '12:20', 1200, 50, 2.5), row(1, '08:00', '08:10', 600, 30, 3.0)]
        assert result == expected
        assert listed[0]['feed'] == feeds_in(client, {'start': utc('00:00', day=9), 'end': utc('00:00')})[3]

    def test_marks_ignored_feeds_with_the_reason(self, client):
        weighed(client, utc('01:00', day=8), utc('01:10', day=8), 10)                      # 1: pushed out by ten newer ones
        for hour in range(10):                                                              # 2-11: the ten most recent
            weighed(client, utc(f'{hour:02d}:00', day=9), utc(f'{hour:02d}:10', day=9), 20)
        weighed(client, utc('12:00', day=9), utc('12:10', day=9), -15)                     # 12
        weighed(client, utc('13:00', day=9), utc('13:10', day=9), 0)                       # 13
        weighed(client, utc('14:00', day=9), utc('14:10', day=9), 301)                     # 14
        weighed(client, utc('15:00', day=9), utc('15:01', day=9), 5)                       # 15
        weighed(client, utc('11:50'), utc('12:10'), 40)                                    # 16: ends after now (12:00)
        listed = client.get(SETTINGS).json()['weighed']
        result = {w['id']: (w['used'], w['reason'], w['reason_text']) for w in listed}

        expected = {
            1:  (False, 'older', 'older than the 10 most recent'),
            **{i: (True, 'used', 'used') for i in range(2, 12)},
            12: (False, 'no_gain', 'weight went down'),
            13: (False, 'no_gain', 'no weight gain'),
            14: (False, 'over_max', 'gain over 300 ml'),
            15: (False, 'too_short', 'under 2 minutes'),
            16: (False, 'not_ended', 'had not ended yet'),
        }
        assert result == expected
        assert [w['id'] for w in listed] == sorted(expected, reverse=True)

    def test_pooled_sum_is_the_rate_actually_applied(self, client):
        log_three_weighed_feeds(client)
        weighed(client, utc('18:00', day=9), utc('18:02', day=9), 8)
        weighed(client, utc('19:00', day=9), utc('19:10', day=9), 0)
        settings = client.get(SETTINGS).json()
        applied  = unweighed(client, NOW, utc('12:21'))
        asked    = client.get('/api/breast-rate', params={'at': NOW}).json()
        pool     = settings['pool']
        result   = (pool, settings['in_force'], sum(w['ml'] for w in settings['weighed'] if w['used']), sum(w['duration_seconds'] for w in settings['weighed'] if w['used']))

        expected = (
            {'total_ml': 108, 'total_seconds': 2520, 'ml_per_min': 108 / 42, 'feeds': 4, 'min_feeds': 3, 'enough': True},
            {'source': 'rate', 'ml_per_min': 108 / 42, 'feeds': 4, 'default_ml': 20, 'examples': [{'minutes': 10, 'ml': 26}, {'minutes': 20, 'ml': 51}]},
            108,
            2520,
        )
        assert result == expected
        assert (applied['intake_ml'], applied['intake_rate_ml_per_min'], applied['intake_rate_feeds']) == (54, round(pool['ml_per_min'], 3), pool['feeds'])
        assert (asked['ml_per_min'], asked['feeds']) == (pool['ml_per_min'], pool['feeds'])

    def test_too_few_usable_feeds_reports_the_sum_but_the_default_stays_in_force(self, client):
        weighed(client, utc('08:00', day=9), utc('08:10', day=9), 30)
        weighed(client, utc('12:00', day=9), utc('12:20', day=9), 50)
        weighed(client, utc('16:00', day=9), utc('16:10', day=9), -20)
        settings = client.get(SETTINGS).json()
        result   = (settings['pool'], settings['in_force']['source'], [w['used'] for w in settings['weighed']])

        expected = (
            {'total_ml': 80, 'total_seconds': 1800, 'ml_per_min': 80 / 30, 'feeds': 2, 'min_feeds': 3, 'enough': False},
            'default',
            [False, True, True],
        )
        assert result == expected

    def test_manual_rate_is_in_force_while_the_pool_still_shows_the_calculated_one(self, client):
        log_three_weighed_feeds(client)
        result_before = client.get(SETTINGS).json()['pool']
        settings      = save(client, 'all', manual_rate=4.0)
        result        = (settings['pool'], settings['in_force']['source'], settings['in_force']['ml_per_min'])

        expected = (result_before, 'manual_rate', 4.0)
        assert result == expected

    def test_no_weighed_feeds_at_all(self, client):
        settings = client.get(SETTINGS).json()
        result   = (settings['weighed'], settings['pool'])

        expected = ([], {'total_ml': 0, 'total_seconds': 0, 'ml_per_min': None, 'feeds': 0, 'min_feeds': 3, 'enough': False})
        assert result == expected
