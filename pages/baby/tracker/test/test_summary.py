from test.helper import NOW, default_breast_row, empty_summary, feed_row, post, sleep_row, utc

DAY = {'start': utc('00:00'), 'end': utc('00:00', day=11)}


def log_a_typical_day(client) -> None:
    post(client, 'sleeps', {'started_at': utc('22:00', day=9), 'ended_at': utc('02:00')})
    post(client, 'sleeps', {'started_at': utc('04:00'), 'ended_at': utc('05:30')})
    post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('02:10'), 'ended_at': utc('02:30'), 'amount_ml': 80})
    post(client, 'feeds', {
        'kind': 'breast', 'started_at': utc('06:00'), 'ended_at': utc('06:30'),
        'weight_before_g': 3500, 'weight_after_g': 3545,
    })
    post(client, 'nappies', {'logged_at': utc('02:35'), 'wet': True})
    post(client, 'nappies', {'logged_at': utc('06:40'), 'wet': True, 'dirty': True, 'dirty_size': 'big'})
    post(client, 'weights', {'logged_at': utc('07:00'), 'grams': 3510})
    post(client, 'weights', {'logged_at': utc('09:00'), 'grams': 3530})


class TestSummary:
    def test_empty_database_gives_zero_totals(self, client):
        result = client.get('/api/summary', params=DAY).json()

        expected = empty_summary(DAY['start'], DAY['end'])
        assert result == expected

    def test_totals_for_a_day(self, client):
        log_a_typical_day(client)
        result = client.get('/api/summary', params=DAY).json()

        expected = empty_summary(
            DAY['start'], DAY['end'],
            sleep_seconds = 2 * 3600 + 90 * 60,
            sleep_count   = 1,
            feed_count    = 2,
            bottle_count  = 1,
            breast_count  = 1,
            feed_seconds  = 50 * 60,
            intake_ml     = 125,
            estimated_ml  = 45,
            nappy_count   = 2,
            wet_count     = 2,
            dirty_count   = 1,
            weight_g      = 3530,
        )
        assert result == expected

    def test_in_progress_sleep_counts_up_to_now(self, client):
        post(client, 'sleeps', {'started_at': utc('11:00')})
        result = client.get('/api/summary', params=DAY).json()

        expected = empty_summary(DAY['start'], DAY['end'], sleep_seconds=3600, sleep_count=1)
        assert result == expected

    def test_window_must_end_after_it_starts(self, client):
        result = client.get('/api/summary', params={'start': DAY['end'], 'end': DAY['start']}).status_code

        expected = 422
        assert result == expected


class TestDaily:
    def test_sleep_spanning_midnight_is_split_across_days(self, client):
        log_a_typical_day(client)
        params = {'tz': 'UTC', 'start': '2026-03-09', 'end': '2026-03-10'}
        result = client.get('/api/daily', params=params).json()

        expected = [
            empty_summary(utc('00:00', day=9), utc('00:00'), date='2026-03-09', sleep_seconds=2 * 3600, sleep_count=1),
            empty_summary(
                utc('00:00'), utc('00:00', day=11),
                date          = '2026-03-10',
                sleep_seconds = 2 * 3600 + 90 * 60,
                sleep_count   = 1,
                feed_count    = 2,
                bottle_count  = 1,
                breast_count  = 1,
                feed_seconds  = 50 * 60,
                intake_ml     = 125,
                estimated_ml  = 45,
                nappy_count   = 2,
                wet_count     = 2,
                dirty_count   = 1,
                weight_g      = 3530,
            ),
        ]
        assert result == expected

    def test_day_boundaries_follow_the_requested_timezone(self, client):
        'Melbourne is UTC+11 in March, so 14:00 UTC on the 9th is 01:00 local on the 10th'
        post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('14:00', day=9), 'ended_at': utc('14:20', day=9), 'amount_ml': 70})
        params = {'tz': 'Australia/Melbourne', 'start': '2026-03-09', 'end': '2026-03-10'}
        result = client.get('/api/daily', params=params).json()

        expected = [
            empty_summary(utc('13:00', day=8), utc('13:00', day=9), date='2026-03-09'),
            empty_summary(
                utc('13:00', day=9), utc('13:00'),
                date='2026-03-10', feed_count=1, bottle_count=1, feed_seconds=20 * 60, intake_ml=70,
            ),
        ]
        assert result == expected

    def test_without_a_start_the_range_begins_at_the_first_entry(self, client):
        post(client, 'weights', {'logged_at': utc('09:00', day=8), 'grams': 3400})
        result = [day['date'] for day in client.get('/api/daily', params={'tz': 'UTC', 'end': '2026-03-10'}).json()]

        expected = ['2026-03-08', '2026-03-09', '2026-03-10']
        assert result == expected

    def test_unknown_timezone_is_rejected(self, client):
        result = client.get('/api/daily', params={'tz': 'Mars/Olympus', 'end': '2026-03-10'}).status_code

        expected = 422
        assert result == expected


class TestEvents:
    def test_returns_entries_overlapping_the_window(self, client):
        log_a_typical_day(client)
        window = {'start': utc('00:00'), 'end': utc('03:00')}
        result = client.get('/api/events', params=window).json()

        expected = {
            'sleeps':  [sleep_row(1, utc('22:00', day=9), utc('02:00'))],
            'feeds':   [feed_row(1, 'bottle', utc('02:10'), utc('02:30'), amount_ml=80, intake_ml=80, intake_source='measured')],
            'nappies': [{'id': 1, 'logged_at': utc('02:35'), 'wet': True, 'dirty': False, 'wet_size': None, 'dirty_size': None, 'notes': ''}],
            'weights': [],
            'expresses': [],
        }
        assert result == expected


class TestStatus:
    def test_reports_the_most_recent_entry_of_each_type(self, client):
        log_a_typical_day(client)
        result = client.get('/api/status').json()

        expected = {
            'now':    NOW,
            'active': {'sleep': None, 'feed': None, 'express': None},
            'last':   {
                'sleep': sleep_row(2, utc('04:00'), utc('05:30')),
                'feed':  feed_row(
                    2, 'breast', utc('06:00'), utc('06:30'),
                    weight_before_g=3500, weight_after_g=3545, intake_ml=45, intake_estimated=True, intake_source='weights',
                ),
                'nappy':  {'id': 2, 'logged_at': utc('06:40'), 'wet': True, 'dirty': True, 'wet_size': None, 'dirty_size': 'big', 'notes': ''},
                'weight': {'id': 2, 'logged_at': utc('09:00'), 'grams': 3530, 'notes': ''},
                'express': None,
                'breast':  feed_row(
                    2, 'breast', utc('06:00'), utc('06:30'),
                    weight_before_g=3500, weight_after_g=3545, intake_ml=45, intake_estimated=True, intake_source='weights',
                ),
            },
        }
        assert result == expected

    def test_last_breast_is_the_latest_finished_breast_feed(self, client):
        'A later bottle feed and a breast feed still running are both skipped'
        post(client, 'feeds', {'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:20'), 'side': 'right'})
        post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('10:00'), 'ended_at': utc('10:10'), 'amount_ml': 50})
        post(client, 'feeds', {'kind': 'breast', 'started_at': utc('11:50'), 'side': 'left'})
        result = client.get('/api/status').json()['last']['breast']

        expected = default_breast_row(1, utc('08:00'), utc('08:20'), active_side='right')
        assert result == expected

    def test_last_breast_is_empty_before_any_breast_feed_finishes(self, client):
        post(client, 'feeds', {'kind': 'breast', 'side': 'left'})
        result = client.get('/api/status').json()['last']['breast']

        expected = None
        assert result == expected


class TestPausedTimeInSummaries:
    def test_paused_time_is_left_out_of_sleep_seconds(self, client):
        post(client, 'sleeps', {'started_at': utc('08:00'), 'ended_at': utc('10:00'), 'paused_seconds': 1800})
        result = client.get('/api/summary', params=DAY).json()

        expected = empty_summary(DAY['start'], DAY['end'], sleep_seconds=90 * 60, sleep_count=1)
        assert result == expected

    def test_paused_time_is_left_out_of_feed_seconds(self, client):
        post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('08:00'), 'ended_at': utc('08:30'), 'amount_ml': 60, 'paused_seconds': 600})
        result = client.get('/api/summary', params=DAY).json()

        expected = empty_summary(DAY['start'], DAY['end'], feed_count=1, bottle_count=1, feed_seconds=20 * 60, intake_ml=60)
        assert result == expected

    def test_paused_time_is_shared_evenly_when_a_sleep_crosses_the_window_edge(self, client):
        'Four hours with one paused: each day gets three quarters of its two wall-clock hours'
        post(client, 'sleeps', {'started_at': utc('22:00', day=9), 'ended_at': utc('02:00'), 'paused_seconds': 3600})
        params = {'tz': 'UTC', 'start': '2026-03-09', 'end': '2026-03-10'}
        result = client.get('/api/daily', params=params).json()

        expected = [
            empty_summary(utc('00:00', day=9), utc('00:00'), date='2026-03-09', sleep_seconds=90 * 60, sleep_count=1),
            empty_summary(utc('00:00'), utc('00:00', day=11), date='2026-03-10', sleep_seconds=90 * 60),
        ]
        assert result == expected

    def test_a_paused_sleep_stops_counting_at_the_pause(self, client, clock):
        post(client, 'sleeps', {'started_at': utc('11:00')})
        post(client, 'sleeps/1/pause')
        clock.advance(minutes=45)
        result = client.get('/api/summary', params=DAY).json()

        expected = empty_summary(DAY['start'], DAY['end'], sleep_seconds=3600, sleep_count=1)
        assert result == expected

    def test_a_resumed_sleep_counts_only_its_active_time(self, client, clock):
        post(client, 'sleeps', {'started_at': utc('11:00')})
        post(client, 'sleeps/1/pause')
        clock.advance(minutes=30)
        post(client, 'sleeps/1/resume')
        clock.advance(minutes=30)
        result = client.get('/api/summary', params=DAY).json()

        expected = empty_summary(DAY['start'], DAY['end'], sleep_seconds=90 * 60, sleep_count=1)
        assert result == expected


def test_health_reports_ok(client):
    result = client.get('/api/health').json()

    expected = {'status': 'ok'}
    assert result == expected


def test_frontend_is_served_at_the_root(client):
    result = client.get('/').status_code

    expected = 200
    assert result == expected
