'''
Express sessions as a start/pause/resume/stop timer, mirroring the feed timer tests (test_timed.py,
test_pause.py). Sessions logged at one moment are in test_instant.py.
'''

from concurrent.futures import ThreadPoolExecutor

from test.helper import NOW, empty_events, empty_summary, error, express_row, feed_row, post, sleep_row, utc

DAY = {'start': utc('00:00'), 'end': utc('00:00', day=11)}


def put(client, path: str, body: dict[str, object]) -> dict[str, object]:
    response = client.put(f'/api/{path}', json=body)
    assert response.status_code == 200, response.text
    result: dict[str, object] = response.json()
    return result


def running_row(row_id: int, started_at: str, **fields: object) -> dict[str, object]:
    'An express session whose timer is running: no end and no amount yet'
    return express_row(row_id, started_at, None, **{'ended_at': None, **fields})


class TestExpressStartStop:
    def test_start_without_a_time_starts_now(self, client):
        result = post(client, 'expresses')

        expected = running_row(1, NOW)
        assert result == expected

    def test_start_accepts_an_explicit_start_time(self, client):
        result = post(client, 'expresses', {'started_at': utc('11:40'), 'notes': 'pump'})

        expected = running_row(1, utc('11:40'), notes='pump')
        assert result == expected

    def test_running_express_is_reported_as_active(self, client):
        post(client, 'expresses')
        result = client.get('/api/status').json()['active']

        expected = {'sleep': None, 'feed': None, 'express': running_row(1, NOW)}
        assert result == expected

    def test_stop_with_the_amount_finishes_the_session(self, client, clock):
        post(client, 'expresses')
        clock.advance(minutes=15)
        result = post(client, 'expresses/1/stop', {'amount_ml': 80})

        expected = express_row(1, NOW, 80, ended_at=utc('12:15'))
        assert result == expected

    def test_stop_is_never_blocked_by_a_missing_amount(self, client, clock):
        post(client, 'expresses')
        clock.advance(minutes=15)
        result = post(client, 'expresses/1/stop')

        expected = express_row(1, NOW, None, ended_at=utc('12:15'))
        assert result == expected

    def test_amount_can_be_added_after_stopping(self, client, clock):
        post(client, 'expresses')
        clock.advance(minutes=15)
        stopped = post(client, 'expresses/1/stop')
        body    = {'started_at': stopped['started_at'], 'ended_at': stopped['ended_at'], 'amount_ml': 70}
        result  = put(client, 'expresses/1', body)

        expected = express_row(1, NOW, 70, ended_at=utc('12:15'))
        assert result == expected

    def test_stop_accepts_an_explicit_end_time(self, client):
        post(client, 'expresses', {'started_at': utc('10:30')})
        result = post(client, 'expresses/1/stop', {'ended_at': utc('10:50'), 'amount_ml': 55})

        expected = express_row(1, utc('10:30'), 55, ended_at=utc('10:50'))
        assert result == expected

    def test_stop_before_the_start_is_rejected(self, client):
        post(client, 'expresses', {'started_at': utc('10:30')})
        result = client.post('/api/expresses/1/stop', json={'ended_at': utc('10:00'), 'amount_ml': 55}).status_code

        expected = 422
        assert result == expected

    def test_stop_with_no_millilitres_is_rejected(self, client):
        post(client, 'expresses')
        result = client.post('/api/expresses/1/stop', json={'amount_ml': 0}).status_code

        expected = 422
        assert result == expected

    def test_stopped_express_is_no_longer_active(self, client):
        post(client, 'expresses')
        post(client, 'expresses/1/stop', {'amount_ml': 80})
        result = client.get('/api/status').json()['active']

        expected = {'sleep': None, 'feed': None, 'express': None}
        assert result == expected

    def test_stopping_twice_is_rejected(self, client):
        post(client, 'expresses')
        post(client, 'expresses/1/stop', {'amount_ml': 80})
        result = error(client, 'POST', 'expresses/1/stop')

        expected = (409, 'already stopped')
        assert result == expected

    def test_stop_unknown_express_is_not_found(self, client):
        result = client.post('/api/expresses/9/stop').status_code

        expected = 404
        assert result == expected

    def test_session_logged_at_one_moment_cannot_be_stopped(self, client):
        post(client, 'expresses', {'amount_ml': 60})
        result = error(client, 'POST', 'expresses/1/stop')

        expected = (409, 'already stopped')
        assert result == expected

    def test_finished_session_can_be_logged_with_start_and_end(self, client):
        result = post(client, 'expresses', {'started_at': utc('09:00'), 'ended_at': utc('09:20'), 'amount_ml': 90, 'paused_seconds': 120})

        expected = express_row(1, utc('09:00'), 90, ended_at=utc('09:20'), paused_seconds=120)
        assert result == expected

    def test_finished_session_ending_before_it_starts_is_rejected(self, client):
        result = client.post('/api/expresses', json={'started_at': utc('09:00'), 'ended_at': utc('08:00'), 'amount_ml': 90}).status_code

        expected = 422
        assert result == expected

    def test_delete_a_running_express(self, client):
        post(client, 'expresses')
        client.delete('/api/expresses/1')
        result = client.get('/api/status').json()['active']['express']

        expected = None
        assert result == expected


class TestSingleExpressInProgress:
    def test_second_running_express_is_rejected(self, client):
        post(client, 'expresses')
        result = client.post('/api/expresses', json={}).status_code

        expected = 409
        assert result == expected

    def test_new_express_allowed_after_stopping_the_first(self, client):
        post(client, 'expresses')
        post(client, 'expresses/1/stop', {'amount_ml': 80})
        result = client.post('/api/expresses', json={}).status_code

        expected = 201
        assert result == expected

    def test_finished_express_allowed_while_another_is_running(self, client):
        post(client, 'expresses')
        result = client.post('/api/expresses', json={'logged_at': utc('09:00'), 'amount_ml': 60}).status_code

        expected = 201
        assert result == expected

    def test_express_may_run_beside_a_sleep_and_a_feed(self, client):
        post(client, 'sleeps')
        post(client, 'feeds', {'kind': 'bottle'})
        post(client, 'expresses')
        result = client.get('/api/status').json()['active']

        expected = {'sleep': sleep_row(1, NOW, None), 'feed': feed_row(1, 'bottle', NOW, None), 'express': running_row(1, NOW)}
        assert result == expected

    def test_reopening_a_finished_express_is_rejected_while_another_runs(self, client):
        post(client, 'expresses', {'started_at': utc('09:00'), 'ended_at': utc('09:20'), 'amount_ml': 90})
        post(client, 'expresses')
        result = client.put('/api/expresses/1', json={'started_at': utc('09:00')}).status_code

        expected = 409
        assert result == expected


class TestExpressPauseResume:
    def test_pause_marks_the_moment_it_was_paused(self, client, clock):
        post(client, 'expresses')
        clock.advance(minutes=10)
        result = post(client, 'expresses/1/pause')

        expected = running_row(1, NOW, paused_at=utc('12:10'))
        assert result == expected

    def test_resume_adds_the_pause_to_the_paused_total(self, client, clock):
        post(client, 'expresses')
        clock.advance(minutes=10)
        post(client, 'expresses/1/pause')
        clock.advance(minutes=5)
        result = post(client, 'expresses/1/resume')

        expected = running_row(1, NOW, paused_seconds=300)
        assert result == expected

    def test_several_pauses_add_up(self, client, clock):
        post(client, 'expresses')
        for _ in range(3):
            clock.advance(minutes=10)
            post(client, 'expresses/1/pause')
            clock.advance(minutes=2)
            post(client, 'expresses/1/resume')
        result = client.get('/api/status').json()['active']['express']

        expected = running_row(1, NOW, paused_seconds=360)
        assert result == expected

    def test_stop_after_a_pause_leaves_the_pause_out_of_the_duration(self, client, clock):
        'Runs 12:00-12:25 with five minutes paused: twenty minutes of expressing'
        post(client, 'expresses')
        clock.advance(minutes=10)
        post(client, 'expresses/1/pause')
        clock.advance(minutes=5)
        post(client, 'expresses/1/resume')
        clock.advance(minutes=10)
        result = post(client, 'expresses/1/stop', {'amount_ml': 80})

        expected = express_row(1, NOW, 80, ended_at=utc('12:25'), paused_seconds=300, duration_seconds=1200)
        assert result == expected

    def test_stop_while_paused_ends_at_the_pause(self, client, clock):
        post(client, 'expresses')
        clock.advance(minutes=10)
        post(client, 'expresses/1/pause')
        clock.advance(minutes=30)
        result = post(client, 'expresses/1/stop', {'amount_ml': 80})

        expected = express_row(1, NOW, 80, ended_at=utc('12:10'))
        assert result == expected

    def test_stop_while_paused_ignores_a_requested_end_time(self, client, clock):
        post(client, 'expresses')
        clock.advance(minutes=10)
        post(client, 'expresses/1/pause')
        clock.advance(minutes=30)
        result = post(client, 'expresses/1/stop', {'ended_at': utc('12:35'), 'amount_ml': 80})

        expected = express_row(1, NOW, 80, ended_at=utc('12:10'))
        assert result == expected

    def test_pausing_twice_is_rejected(self, client):
        post(client, 'expresses')
        post(client, 'expresses/1/pause')
        result = error(client, 'POST', 'expresses/1/pause')

        expected = (409, 'already paused')
        assert result == expected

    def test_resume_when_not_paused_is_rejected(self, client):
        post(client, 'expresses')
        result = error(client, 'POST', 'expresses/1/resume')

        expected = (409, 'not paused')
        assert result == expected

    def test_pause_after_stop_is_rejected(self, client):
        post(client, 'expresses')
        post(client, 'expresses/1/stop', {'amount_ml': 80})
        result = error(client, 'POST', 'expresses/1/pause')

        expected = (409, 'already stopped')
        assert result == expected

    def test_resume_after_stop_is_rejected(self, client):
        post(client, 'expresses')
        post(client, 'expresses/1/pause')
        post(client, 'expresses/1/stop', {'amount_ml': 80})
        result = error(client, 'POST', 'expresses/1/resume')

        expected = (409, 'already stopped')
        assert result == expected

    def test_pausing_an_express_leaves_a_running_feed_alone(self, client, clock):
        post(client, 'feeds', {'kind': 'bottle'})
        post(client, 'expresses')
        clock.advance(minutes=5)
        post(client, 'expresses/1/pause')
        result = client.get('/api/status').json()['active']['feed']

        expected = feed_row(1, 'bottle', NOW, None)
        assert result == expected

    def test_simultaneous_pauses_pause_exactly_once(self, client):
        post(client, 'expresses')
        with ThreadPoolExecutor(max_workers=8) as pool:
            codes = list(pool.map(lambda _: client.post('/api/expresses/1/pause').status_code, range(16)))
        result = (sorted(codes), client.get('/api/status').json()['active']['express'])

        expected = ([200] + [409] * 15, running_row(1, NOW, paused_at=NOW))
        assert result == expected


class TestEditExpress:
    def test_fix_time_keeps_the_timer_running_and_its_pause(self, client, clock):
        'Timer fields in the body are ignored: the server owns them while the session runs'
        post(client, 'expresses')
        clock.advance(minutes=10)
        post(client, 'expresses/1/pause')
        result = put(client, 'expresses/1', {'started_at': utc('11:50'), 'ended_at': None, 'paused_seconds': 5})

        expected = running_row(1, utc('11:50'), paused_at=utc('12:10'))
        assert result == expected

    def test_start_moved_past_the_pause_pulls_the_pause_forward(self, client, clock):
        post(client, 'expresses', {'started_at': utc('11:00')})
        post(client, 'expresses/1/pause')
        clock.advance(minutes=10)
        result = put(client, 'expresses/1', {'started_at': utc('12:05')})

        expected = running_row(1, utc('12:05'), paused_at=utc('12:05'))
        assert result == expected

    def test_giving_an_end_and_amount_finalises_a_running_session(self, client, clock):
        post(client, 'expresses')
        clock.advance(minutes=10)
        post(client, 'expresses/1/pause')
        clock.advance(minutes=10)
        result = put(client, 'expresses/1', {'ended_at': utc('12:15'), 'amount_ml': 75})

        expected = express_row(1, NOW, 75, ended_at=utc('12:15'), paused_seconds=300)
        assert result == expected

    def test_edit_finished_session_keeps_its_pause_when_none_is_given(self, client):
        post(client, 'expresses', {'started_at': utc('09:00'), 'ended_at': utc('09:20'), 'amount_ml': 90, 'paused_seconds': 120})
        result = put(client, 'expresses/1', {'started_at': utc('09:00'), 'ended_at': utc('09:30'), 'amount_ml': 95})

        expected = express_row(1, utc('09:00'), 95, ended_at=utc('09:30'), paused_seconds=120)
        assert result == expected

    def test_edit_finished_session_takes_a_new_pause(self, client):
        post(client, 'expresses', {'started_at': utc('09:00'), 'ended_at': utc('09:20'), 'amount_ml': 90})
        result = put(client, 'expresses/1', {'started_at': utc('09:00'), 'ended_at': utc('09:20'), 'amount_ml': 90, 'paused_seconds': 300})

        expected = express_row(1, utc('09:00'), 90, ended_at=utc('09:20'), paused_seconds=300)
        assert result == expected

    def test_pause_longer_than_the_session_is_rejected(self, client):
        post(client, 'expresses', {'started_at': utc('09:00'), 'ended_at': utc('09:20'), 'amount_ml': 90})
        body   = {'started_at': utc('09:00'), 'ended_at': utc('09:20'), 'amount_ml': 90, 'paused_seconds': 1500}
        result = error(client, 'PUT', 'expresses/1', body)

        expected = (422, 'paused_seconds is longer than the entry')
        assert result == expected

    def test_edit_with_an_end_needs_an_amount(self, client):
        post(client, 'expresses')
        result = client.put('/api/expresses/1', json={'ended_at': utc('12:00')}).status_code

        expected = 422
        assert result == expected

    def test_saving_a_timed_session_unchanged_changes_nothing(self, client, clock):
        post(client, 'expresses')
        clock.advance(minutes=15)
        stopped = post(client, 'expresses/1/stop', {'amount_ml': 80})
        body    = {key: stopped[key] for key in ('started_at', 'ended_at', 'amount_ml', 'notes')}
        result  = put(client, 'expresses/1', body)

        expected = stopped
        assert result == expected


class TestRunningExpressInTotals:
    def test_running_express_is_listed_in_the_events_of_its_day(self, client):
        post(client, 'expresses')
        result = client.get('/api/events', params=DAY).json()

        expected = empty_events(expresses=[running_row(1, NOW)])
        assert result == expected

    def test_summary_ignores_a_running_express(self, client, clock):
        post(client, 'expresses', {'logged_at': utc('09:00'), 'amount_ml': 60})
        post(client, 'expresses')
        clock.advance(minutes=10)
        result = client.get('/api/summary', params=DAY).json()

        expected = empty_summary(DAY['start'], DAY['end'], express_ml=60, express_count=1)
        assert result == expected

    def test_summary_counts_the_session_once_it_is_stopped(self, client, clock):
        post(client, 'expresses', {'logged_at': utc('09:00'), 'amount_ml': 60})
        post(client, 'expresses')
        clock.advance(minutes=10)
        post(client, 'expresses/2/stop', {'amount_ml': 45})
        result = client.get('/api/summary', params=DAY).json()

        expected = empty_summary(DAY['start'], DAY['end'], express_ml=105, express_count=2)
        assert result == expected

    def test_session_stopped_without_an_amount_counts_as_a_session_of_no_millilitres(self, client, clock):
        post(client, 'expresses')
        clock.advance(minutes=10)
        post(client, 'expresses/1/stop')
        result = client.get('/api/summary', params=DAY).json()

        expected = empty_summary(DAY['start'], DAY['end'], express_count=1)
        assert result == expected

    def test_daily_totals_ignore_a_running_express(self, client):
        post(client, 'expresses', {'logged_at': utc('09:00'), 'amount_ml': 60})
        post(client, 'expresses')
        params = {'tz': 'UTC', 'start': '2026-03-10', 'end': '2026-03-10'}
        result = client.get('/api/daily', params=params).json()

        expected = [empty_summary(utc('00:00'), utc('00:00', day=11), date='2026-03-10', express_ml=60, express_count=1)]
        assert result == expected

    def test_timed_session_counts_on_the_day_it_starts(self, client):
        post(client, 'expresses', {'started_at': utc('23:50', day=9), 'ended_at': utc('00:10'), 'amount_ml': 50})
        params = {'tz': 'UTC', 'start': '2026-03-09', 'end': '2026-03-10'}
        result = client.get('/api/daily', params=params).json()

        expected = [
            empty_summary(utc('00:00', day=9), utc('00:00'), date='2026-03-09', express_ml=50, express_count=1),
            empty_summary(utc('00:00'), utc('00:00', day=11), date='2026-03-10'),
        ]
        assert result == expected

    def test_status_last_express_skips_the_running_one(self, client):
        post(client, 'expresses', {'logged_at': utc('09:00'), 'amount_ml': 60})
        post(client, 'expresses')
        result = client.get('/api/status').json()['last']['express']

        expected = express_row(1, utc('09:00'), 60)
        assert result == expected
