from fastapi.testclient import TestClient

from babytracker.api import create_app

from test.helper import NOW, empty_events, feed_row, post, sleep_row, utc


class TestSleepStartStop:
    def test_start_defaults_to_now_and_is_in_progress(self, client):
        result = post(client, 'sleeps')

        expected = sleep_row(1, NOW, None)
        assert result == expected

    def test_in_progress_sleep_is_reported_as_active(self, client):
        post(client, 'sleeps')
        result = client.get('/api/status').json()['active']

        expected = {'sleep': sleep_row(1, NOW, None), 'feed': None, 'express': None}
        assert result == expected

    def test_stop_sets_end_to_now(self, client):
        post(client, 'sleeps', {'started_at': utc('10:30')})
        result = post(client, 'sleeps/1/stop')

        expected = sleep_row(1, utc('10:30'), NOW)
        assert result == expected

    def test_stopped_sleep_is_no_longer_active(self, client):
        post(client, 'sleeps')
        post(client, 'sleeps/1/stop')
        result = client.get('/api/status').json()['active']

        expected = {'sleep': None, 'feed': None, 'express': None}
        assert result == expected

    def test_stop_accepts_an_explicit_end_time(self, client):
        post(client, 'sleeps', {'started_at': utc('10:30')})
        result = post(client, 'sleeps/1/stop', {'ended_at': utc('11:15')})

        expected = sleep_row(1, utc('10:30'), utc('11:15'))
        assert result == expected

    def test_stopping_twice_is_rejected(self, client):
        post(client, 'sleeps')
        post(client, 'sleeps/1/stop')
        result = client.post('/api/sleeps/1/stop').status_code

        expected = 409
        assert result == expected

    def test_stop_before_start_is_rejected(self, client):
        post(client, 'sleeps', {'started_at': utc('10:30')})
        result = client.post('/api/sleeps/1/stop', json={'ended_at': utc('09:00')}).status_code

        expected = 422
        assert result == expected

    def test_stopping_unknown_sleep_is_not_found(self, client):
        result = client.post('/api/sleeps/99/stop').status_code

        expected = 404
        assert result == expected

    def test_timestamps_with_offsets_are_stored_as_utc(self, client):
        result = post(client, 'sleeps', {'started_at': '2026-03-10T21:30:00+11:00', 'ended_at': '2026-03-10T22:00:00+11:00'})

        expected = sleep_row(1, utc('10:30'), utc('11:00'))
        assert result == expected

    def test_naive_timestamps_are_rejected(self, client):
        result = client.post('/api/sleeps', json={'started_at': '2026-03-10T10:30:00'}).status_code

        expected = 422
        assert result == expected


class TestFeedStartStop:
    def test_start_breast_feed_with_weight_before(self, client):
        result = post(client, 'feeds', {'kind': 'breast', 'weight_before_g': 3500})

        expected = feed_row(1, 'breast', NOW, None, weight_before_g=3500)
        assert result == expected

    def test_stop_breast_feed_with_weight_after_estimates_intake(self, client):
        post(client, 'feeds', {'kind': 'breast', 'started_at': utc('11:40'), 'weight_before_g': 3500})
        result = post(client, 'feeds/1/stop', {'weight_after_g': 3560})

        expected = feed_row(
            1, 'breast', utc('11:40'), NOW,
            weight_before_g=3500, weight_after_g=3560, intake_ml=60, intake_estimated=True, intake_source='weights',
        )
        assert result == expected

    def test_stop_bottle_feed_with_amount(self, client):
        post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('11:40')})
        result = post(client, 'feeds/1/stop', {'amount_ml': 90})

        expected = feed_row(1, 'bottle', utc('11:40'), NOW, amount_ml=90, intake_ml=90, intake_source='measured')
        assert result == expected

    def test_stop_without_details_is_allowed(self, client):
        post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('11:40')})
        result = post(client, 'feeds/1/stop')

        expected = feed_row(1, 'bottle', utc('11:40'), NOW)
        assert result == expected

    def test_weight_loss_over_a_breast_feed_estimates_zero_intake(self, client):
        body = {'kind': 'breast', 'started_at': utc('11:00'), 'ended_at': utc('11:20'), 'weight_before_g': 3500, 'weight_after_g': 3490}
        result = post(client, 'feeds', body)

        expected = feed_row(
            1, 'breast', utc('11:00'), utc('11:20'),
            weight_before_g=3500, weight_after_g=3490, intake_ml=0, intake_estimated=True, intake_source='weights',
        )
        assert result == expected

    def test_unknown_feed_kind_is_rejected(self, client):
        result = client.post('/api/feeds', json={'kind': 'solid'}).status_code

        expected = 422
        assert result == expected


class TestSingleInProgressGuard:
    def test_second_concurrent_sleep_is_rejected(self, client):
        post(client, 'sleeps')
        result = client.post('/api/sleeps', json={}).status_code

        expected = 409
        assert result == expected

    def test_second_concurrent_feed_is_rejected(self, client):
        post(client, 'feeds', {'kind': 'bottle'})
        result = client.post('/api/feeds', json={'kind': 'breast'}).status_code

        expected = 409
        assert result == expected

    def test_sleep_and_feed_may_run_together(self, client):
        post(client, 'sleeps')
        post(client, 'feeds', {'kind': 'bottle'})
        result = client.get('/api/status').json()['active']

        expected = {'sleep': sleep_row(1, NOW, None), 'feed': feed_row(1, 'bottle', NOW, None), 'express': None}
        assert result == expected

    def test_retrospective_sleep_is_allowed_while_one_is_in_progress(self, client):
        post(client, 'sleeps')
        result = post(client, 'sleeps', {'started_at': utc('08:00'), 'ended_at': utc('09:00')})

        expected = sleep_row(2, utc('08:00'), utc('09:00'))
        assert result == expected

    def test_new_sleep_can_start_after_the_previous_one_stops(self, client):
        post(client, 'sleeps')
        post(client, 'sleeps/1/stop')
        result = post(client, 'sleeps')

        expected = sleep_row(2, NOW, None)
        assert result == expected

    def test_reopening_a_sleep_while_another_is_in_progress_is_rejected(self, client):
        post(client, 'sleeps', {'started_at': utc('08:00'), 'ended_at': utc('09:00')})
        post(client, 'sleeps')
        result = client.put('/api/sleeps/1', json={'started_at': utc('08:00'), 'ended_at': None}).status_code

        expected = 409
        assert result == expected


class TestEditAndDelete:
    def test_edit_sleep_times_and_notes(self, client):
        post(client, 'sleeps', {'started_at': utc('08:00'), 'ended_at': utc('09:00')})
        result = client.put('/api/sleeps/1', json={'started_at': utc('07:45'), 'ended_at': utc('09:10'), 'notes': 'pram'}).json()

        expected = sleep_row(1, utc('07:45'), utc('09:10'), 'pram')
        assert result == expected

    def test_repeated_edits_of_the_same_row_succeed(self, client):
        post(client, 'sleeps', {'started_at': utc('08:00'), 'ended_at': utc('09:00')})
        client.put('/api/sleeps/1', json={'started_at': utc('07:45'), 'ended_at': utc('09:10')})
        result = client.put('/api/sleeps/1', json={'started_at': utc('07:50'), 'ended_at': utc('09:20')}).json()

        expected = sleep_row(1, utc('07:50'), utc('09:20'))
        assert result == expected

    def test_edit_in_progress_sleep_start_keeps_it_running(self, client):
        post(client, 'sleeps')
        result = client.put('/api/sleeps/1', json={'started_at': utc('11:30'), 'ended_at': None}).json()

        expected = sleep_row(1, utc('11:30'), None)
        assert result == expected

    def test_edit_with_end_before_start_is_rejected(self, client):
        post(client, 'sleeps', {'started_at': utc('08:00'), 'ended_at': utc('09:00')})
        result = client.put('/api/sleeps/1', json={'started_at': utc('10:00'), 'ended_at': utc('09:00')}).status_code

        expected = 422
        assert result == expected

    def test_edit_feed_replaces_details(self, client):
        post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('08:00'), 'ended_at': utc('08:20'), 'amount_ml': 60})
        body   = {'kind': 'bottle', 'started_at': utc('08:05'), 'ended_at': utc('08:25'), 'amount_ml': 75}
        result = client.put('/api/feeds/1', json=body).json()

        expected = feed_row(1, 'bottle', utc('08:05'), utc('08:25'), amount_ml=75, intake_ml=75, intake_source='measured')
        assert result == expected

    def test_edit_unknown_feed_is_not_found(self, client):
        result = client.put('/api/feeds/5', json={'kind': 'bottle'}).status_code

        expected = 404
        assert result == expected

    def test_delete_removes_the_sleep(self, client):
        post(client, 'sleeps', {'started_at': utc('08:00'), 'ended_at': utc('09:00')})
        client.delete('/api/sleeps/1')
        result = client.get('/api/events', params={'start': utc('00:00'), 'end': utc('00:00', day=11)}).json()

        expected = empty_events()
        assert result == expected

    def test_delete_returns_no_content(self, client):
        post(client, 'feeds', {'kind': 'bottle'})
        result = client.delete('/api/feeds/1').status_code

        expected = 204
        assert result == expected

    def test_delete_unknown_entry_is_not_found(self, client):
        result = client.delete('/api/sleeps/1').status_code

        expected = 404
        assert result == expected


class TestPersistence:
    def test_entries_survive_reopening_the_database_file(self, db_path):
        with TestClient(create_app(db_path)) as first:
            post(first, 'sleeps', {'started_at': utc('08:00'), 'ended_at': utc('09:00')})
        with TestClient(create_app(db_path)) as second:
            result = second.get('/api/events', params={'start': utc('00:00'), 'end': utc('00:00', day=11)}).json()

        expected = empty_events(sleeps=[sleep_row(1, utc('08:00'), utc('09:00'))])
        assert result == expected
