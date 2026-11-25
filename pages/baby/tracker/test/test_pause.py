from concurrent.futures import ThreadPoolExecutor

from test.helper import NOW, default_breast_row, error, feed_row, post, sleep_row, utc

BREAST_LEFT = {'kind': 'breast', 'side': 'left'}


def put(client, path: str, body: dict[str, object]) -> dict[str, object]:
    response = client.put(f'/api/{path}', json=body)
    assert response.status_code == 200, response.text
    result: dict[str, object] = response.json()
    return result


class TestPauseResume:
    def test_pause_marks_the_moment_it_was_paused(self, client, clock):
        post(client, 'sleeps')
        clock.advance(minutes=10)
        result = post(client, 'sleeps/1/pause')

        expected = sleep_row(1, NOW, None, paused_at=utc('12:10'))
        assert result == expected

    def test_resume_adds_the_pause_to_the_paused_total(self, client, clock):
        post(client, 'sleeps')
        clock.advance(minutes=10)
        post(client, 'sleeps/1/pause')
        clock.advance(minutes=5)
        result = post(client, 'sleeps/1/resume')

        expected = sleep_row(1, NOW, None, paused_seconds=300)
        assert result == expected

    def test_several_pauses_add_up(self, client, clock):
        post(client, 'sleeps')
        for _ in range(3):
            clock.advance(minutes=10)
            post(client, 'sleeps/1/pause')
            clock.advance(minutes=2)
            post(client, 'sleeps/1/resume')
        result = client.get('/api/status').json()['active']['sleep']

        expected = sleep_row(1, NOW, None, paused_seconds=360)
        assert result == expected

    def test_stop_after_a_pause_leaves_the_pause_out_of_the_duration(self, client, clock):
        'Runs 12:00-12:25 with five minutes paused: twenty minutes of sleep'
        post(client, 'sleeps')
        clock.advance(minutes=10)
        post(client, 'sleeps/1/pause')
        clock.advance(minutes=5)
        post(client, 'sleeps/1/resume')
        clock.advance(minutes=10)
        result = post(client, 'sleeps/1/stop')

        expected = sleep_row(1, NOW, utc('12:25'), paused_seconds=300, duration_seconds=1200)
        assert result == expected

    def test_stop_while_paused_ends_at_the_pause(self, client, clock):
        post(client, 'sleeps')
        clock.advance(minutes=10)
        post(client, 'sleeps/1/pause')
        clock.advance(minutes=30)
        result = post(client, 'sleeps/1/stop')

        expected = sleep_row(1, NOW, utc('12:10'))
        assert result == expected

    def test_stop_while_paused_ignores_a_requested_end_time(self, client, clock):
        post(client, 'sleeps')
        clock.advance(minutes=10)
        post(client, 'sleeps/1/pause')
        clock.advance(minutes=30)
        result = post(client, 'sleeps/1/stop', {'ended_at': utc('12:35')})

        expected = sleep_row(1, NOW, utc('12:10'))
        assert result == expected

    def test_stop_while_paused_keeps_earlier_pauses(self, client, clock):
        post(client, 'sleeps')
        clock.advance(minutes=10)
        post(client, 'sleeps/1/pause')
        clock.advance(minutes=5)
        post(client, 'sleeps/1/resume')
        clock.advance(minutes=5)
        post(client, 'sleeps/1/pause')
        clock.advance(minutes=40)
        result = post(client, 'sleeps/1/stop')

        expected = sleep_row(1, NOW, utc('12:20'), paused_seconds=300, duration_seconds=900)
        assert result == expected

    def test_bottle_feed_pauses_and_resumes_without_side_tracking(self, client, clock):
        post(client, 'feeds', {'kind': 'bottle'})
        clock.advance(minutes=4)
        post(client, 'feeds/1/pause')
        clock.advance(minutes=1)
        result = post(client, 'feeds/1/resume')

        expected = feed_row(1, 'bottle', NOW, None, paused_seconds=60)
        assert result == expected

    def test_pausing_twice_is_rejected(self, client):
        post(client, 'sleeps')
        post(client, 'sleeps/1/pause')
        result = error(client, 'POST', 'sleeps/1/pause')

        expected = (409, 'already paused')
        assert result == expected

    def test_rejected_second_pause_leaves_the_first_in_place(self, client, clock):
        post(client, 'feeds', {'kind': 'bottle'})
        post(client, 'feeds/1/pause')
        clock.advance(minutes=3)
        client.post('/api/feeds/1/pause')
        result = client.get('/api/status').json()['active']['feed']

        expected = feed_row(1, 'bottle', NOW, None, paused_at=NOW)
        assert result == expected

    def test_resume_when_not_paused_is_rejected(self, client):
        post(client, 'feeds', {'kind': 'bottle'})
        result = error(client, 'POST', 'feeds/1/resume')

        expected = (409, 'not paused')
        assert result == expected

    def test_pause_after_stop_is_rejected(self, client):
        post(client, 'sleeps')
        post(client, 'sleeps/1/stop')
        result = error(client, 'POST', 'sleeps/1/pause')

        expected = (409, 'already stopped')
        assert result == expected

    def test_resume_after_stop_is_rejected(self, client):
        post(client, 'feeds', {'kind': 'bottle'})
        post(client, 'feeds/1/pause')
        post(client, 'feeds/1/stop')
        result = error(client, 'POST', 'feeds/1/resume')

        expected = (409, 'already stopped')
        assert result == expected

    def test_pausing_an_unknown_entry_is_not_found(self, client):
        result = [client.post(f'/api/{path}').status_code for path in ('sleeps/9/pause', 'feeds/9/pause', 'sleeps/9/resume', 'feeds/9/resume')]

        expected = [404, 404, 404, 404]
        assert result == expected


class TestBreastSides:
    def test_starting_on_a_side_begins_timing_it(self, client):
        result = post(client, 'feeds', BREAST_LEFT)

        expected = feed_row(1, 'breast', NOW, None, left_seconds=0, right_seconds=0, active_side='left', side_since=NOW)
        assert result == expected

    def test_side_timing_starts_at_a_backdated_start(self, client):
        result = post(client, 'feeds', {**BREAST_LEFT, 'started_at': utc('11:50')})

        expected = feed_row(1, 'breast', utc('11:50'), None, left_seconds=0, right_seconds=0, active_side='left', side_since=utc('11:50'))
        assert result == expected

    def test_breast_feed_started_without_a_side_tracks_none(self, client):
        result = post(client, 'feeds', {'kind': 'breast'})

        expected = feed_row(1, 'breast', NOW, None)
        assert result == expected

    def test_bottle_feed_cannot_start_on_a_side(self, client):
        result = client.post('/api/feeds', json={'kind': 'bottle', 'side': 'left'}).status_code

        expected = 422
        assert result == expected

    def test_switching_banks_the_time_on_the_old_side(self, client, clock):
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=6)
        result = post(client, 'feeds/1/side', {'side': 'right'})

        expected = feed_row(1, 'breast', NOW, None, left_seconds=360, right_seconds=0, active_side='right', side_since=utc('12:06'))
        assert result == expected

    def test_switching_to_the_side_already_active_changes_nothing(self, client, clock):
        'Two phones sending the same switch must not restart the segment'
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=6)
        post(client, 'feeds/1/side', {'side': 'right'})
        clock.advance(minutes=1)
        result = post(client, 'feeds/1/side', {'side': 'right'})

        expected = feed_row(1, 'breast', NOW, None, left_seconds=360, right_seconds=0, active_side='right', side_since=utc('12:06'))
        assert result == expected

    def test_first_side_on_a_feed_started_without_one_times_from_the_switch(self, client, clock):
        post(client, 'feeds', {'kind': 'breast'})
        clock.advance(minutes=3)
        result = post(client, 'feeds/1/side', {'side': 'right'})

        expected = feed_row(1, 'breast', NOW, None, left_seconds=0, right_seconds=0, active_side='right', side_since=utc('12:03'))
        assert result == expected

    def test_pause_banks_the_running_side(self, client, clock):
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=6)
        result = post(client, 'feeds/1/pause')

        expected = feed_row(1, 'breast', NOW, None, left_seconds=360, right_seconds=0, active_side='left', paused_at=utc('12:06'))
        assert result == expected

    def test_resume_restarts_the_active_side(self, client, clock):
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=6)
        post(client, 'feeds/1/pause')
        clock.advance(minutes=2)
        result = post(client, 'feeds/1/resume')

        expected = feed_row(
            1, 'breast', NOW, None,
            paused_seconds=120, left_seconds=360, right_seconds=0, active_side='left', side_since=utc('12:08'),
        )
        assert result == expected

    def test_switching_while_paused_changes_the_side_that_resumes(self, client, clock):
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=6)
        post(client, 'feeds/1/pause')
        clock.advance(minutes=1)
        post(client, 'feeds/1/side', {'side': 'right'})
        clock.advance(minutes=1)
        post(client, 'feeds/1/resume')
        clock.advance(minutes=4)
        result = post(client, 'feeds/1/stop')

        expected = default_breast_row(
            1, NOW, utc('12:12'),
            paused_seconds=120, left_seconds=360, right_seconds=240, active_side='right',
        )
        assert result == expected

    def test_sides_add_up_to_the_duration_across_switches_and_a_pause(self, client, clock):
        'Left 6m, right 2m, paused 3m, right 4m, left 1m: 13 active minutes of 16'
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=6)
        post(client, 'feeds/1/side', {'side': 'right'})
        clock.advance(minutes=2)
        post(client, 'feeds/1/pause')
        clock.advance(minutes=3)
        post(client, 'feeds/1/resume')
        clock.advance(minutes=4)
        post(client, 'feeds/1/side', {'side': 'left'})
        clock.advance(minutes=1)
        result = post(client, 'feeds/1/stop')

        expected = default_breast_row(
            1, NOW, utc('12:16'),
            paused_seconds=180, left_seconds=420, right_seconds=360, active_side='left', duration_seconds=420 + 360,
        )
        assert result == expected

    def test_stop_with_an_earlier_end_banks_the_side_up_to_that_end(self, client, clock):
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=10)
        result = post(client, 'feeds/1/stop', {'ended_at': utc('12:07')})

        expected = default_breast_row(1, NOW, utc('12:07'), left_seconds=420, right_seconds=0, active_side='left')
        assert result == expected

    def test_stop_with_an_end_before_the_last_switch_banks_nothing_more(self, client, clock):
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=10)
        post(client, 'feeds/1/side', {'side': 'right'})
        result = post(client, 'feeds/1/stop', {'ended_at': utc('12:07')})

        expected = default_breast_row(1, NOW, utc('12:07'), left_seconds=600, right_seconds=0, active_side='right')
        assert result == expected

    def test_side_on_a_bottle_feed_is_rejected(self, client):
        post(client, 'feeds', {'kind': 'bottle'})
        result = error(client, 'POST', 'feeds/1/side', {'side': 'left'})

        expected = (409, 'only breast feeds have sides')
        assert result == expected

    def test_side_after_stop_is_rejected(self, client):
        post(client, 'feeds', BREAST_LEFT)
        post(client, 'feeds/1/stop')
        result = error(client, 'POST', 'feeds/1/side', {'side': 'right'})

        expected = (409, 'already stopped')
        assert result == expected

    def test_unknown_side_is_rejected(self, client):
        post(client, 'feeds', BREAST_LEFT)
        result = [client.post('/api/feeds/1/side', json=body).status_code for body in ({'side': 'middle'}, {})]

        expected = [422, 422]
        assert result == expected

    def test_side_on_an_unknown_feed_is_not_found(self, client):
        result = client.post('/api/feeds/9/side', json={'side': 'left'}).status_code

        expected = 404
        assert result == expected


class TestEditFinishedEntry:
    def test_side_times_are_replaced(self, client):
        post(client, 'feeds', {'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:20'), 'left_seconds': 300, 'right_seconds': 400})
        body   = {'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:20'), 'left_seconds': 540, 'right_seconds': 480}
        result = put(client, 'feeds/1', body)

        expected = default_breast_row(1, utc('08:00'), utc('08:20'), left_seconds=540, right_seconds=480)
        assert result == expected

    def test_leaving_side_times_out_clears_them(self, client):
        post(client, 'feeds', {'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:20'), 'left_seconds': 300, 'right_seconds': 400})
        result = put(client, 'feeds/1', {'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:20')})

        expected = default_breast_row(1, utc('08:00'), utc('08:20'))
        assert result == expected

    def test_the_side_a_feed_ended_on_survives_an_edit(self, client, clock):
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=10)
        post(client, 'feeds/1/stop')
        body   = {'kind': 'breast', 'started_at': NOW, 'ended_at': utc('12:10'), 'left_seconds': 600, 'right_seconds': 0, 'notes': 'sleepy'}
        result = put(client, 'feeds/1', body)

        expected = default_breast_row(1, NOW, utc('12:10'), left_seconds=600, right_seconds=0, active_side='left', notes='sleepy')
        assert result == expected

    def test_changing_a_feed_to_bottle_drops_its_sides(self, client, clock):
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=10)
        post(client, 'feeds/1/stop')
        body   = {'kind': 'bottle', 'started_at': NOW, 'ended_at': utc('12:10'), 'amount_ml': 60, 'left_seconds': 600, 'right_seconds': 0}
        result = put(client, 'feeds/1', body)

        expected = feed_row(1, 'bottle', NOW, utc('12:10'), amount_ml=60, intake_ml=60, intake_source='measured')
        assert result == expected

    def test_retrospective_feed_records_sides_and_pause(self, client):
        body   = {
            'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:20'),
            'side': 'right', 'left_seconds': 300, 'right_seconds': 600, 'paused_seconds': 300,
        }
        result = post(client, 'feeds', body)

        expected = default_breast_row(
            1, utc('08:00'), utc('08:20'),
            paused_seconds=300, left_seconds=300, right_seconds=600, active_side='right',
        )
        assert result == expected

    def test_edit_without_paused_seconds_keeps_the_recorded_pause(self, client):
        post(client, 'sleeps', {'started_at': utc('08:00'), 'ended_at': utc('09:00'), 'paused_seconds': 600})
        result = put(client, 'sleeps/1', {'started_at': utc('08:00'), 'ended_at': utc('09:30'), 'notes': 'pram'})

        expected = sleep_row(1, utc('08:00'), utc('09:30'), 'pram', paused_seconds=600)
        assert result == expected

    def test_edit_with_paused_seconds_replaces_the_recorded_pause(self, client):
        post(client, 'sleeps', {'started_at': utc('08:00'), 'ended_at': utc('09:00'), 'paused_seconds': 600})
        result = put(client, 'sleeps/1', {'started_at': utc('08:00'), 'ended_at': utc('09:00'), 'paused_seconds': 0})

        expected = sleep_row(1, utc('08:00'), utc('09:00'))
        assert result == expected

    def test_pause_as_long_as_the_entry_is_allowed(self, client):
        post(client, 'sleeps', {'started_at': utc('08:00'), 'ended_at': utc('09:00')})
        result = put(client, 'sleeps/1', {'started_at': utc('08:00'), 'ended_at': utc('09:00'), 'paused_seconds': 3600})

        expected = sleep_row(1, utc('08:00'), utc('09:00'), paused_seconds=3600)
        assert result == expected

    def test_pause_longer_than_the_entry_is_rejected_on_edit(self, client):
        post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('08:00'), 'ended_at': utc('08:20')})
        body   = {'kind': 'bottle', 'started_at': utc('08:00'), 'ended_at': utc('08:20'), 'paused_seconds': 1201}
        result = error(client, 'PUT', 'feeds/1', body)

        expected = (422, 'paused_seconds is longer than the entry')
        assert result == expected

    def test_pause_longer_than_the_entry_is_rejected_on_create(self, client):
        result = error(client, 'POST', 'sleeps', {'started_at': utc('08:00'), 'ended_at': utc('09:00'), 'paused_seconds': 3601})

        expected = (422, 'paused_seconds is longer than the entry')
        assert result == expected

    def test_kept_pause_is_capped_when_the_entry_is_shortened(self, client):
        post(client, 'sleeps', {'started_at': utc('08:00'), 'ended_at': utc('09:00'), 'paused_seconds': 1800})
        result = put(client, 'sleeps/1', {'started_at': utc('08:00'), 'ended_at': utc('08:10')})

        expected = sleep_row(1, utc('08:00'), utc('08:10'), paused_seconds=600)
        assert result == expected

    def test_negative_paused_seconds_are_rejected(self, client):
        result = client.post('/api/sleeps', json={'started_at': utc('08:00'), 'ended_at': utc('09:00'), 'paused_seconds': -1}).status_code

        expected = 422
        assert result == expected

    def test_side_time_over_a_day_is_rejected(self, client):
        body   = {'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:20'), 'left_seconds': 86401}
        result = client.post('/api/feeds', json=body).status_code

        expected = 422
        assert result == expected

    def test_reopening_keeps_recorded_times_with_nothing_running(self, client, clock):
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=6)
        post(client, 'feeds/1/pause')
        clock.advance(minutes=2)
        post(client, 'feeds/1/resume')
        clock.advance(minutes=2)
        post(client, 'feeds/1/stop')
        body   = {'kind': 'breast', 'started_at': NOW, 'ended_at': None, 'left_seconds': 480, 'right_seconds': 0}
        result = put(client, 'feeds/1', body)

        expected = feed_row(1, 'breast', NOW, None, paused_seconds=120, left_seconds=480, right_seconds=0, active_side='left')
        assert result == expected


class TestEditRunningEntry:
    def test_fix_time_keeps_the_pause_and_side_state(self, client, clock):
        'Timer fields in the body are ignored: the server owns them while the feed runs'
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=10)
        post(client, 'feeds/1/pause')
        body   = {'kind': 'breast', 'started_at': utc('11:50'), 'ended_at': None, 'paused_seconds': 5, 'left_seconds': 1, 'right_seconds': 2}
        result = put(client, 'feeds/1', body)

        expected = feed_row(1, 'breast', utc('11:50'), None, left_seconds=600, right_seconds=0, active_side='left', paused_at=utc('12:10'))
        assert result == expected

    def test_fix_time_keeps_a_finished_pause(self, client, clock):
        post(client, 'sleeps')
        clock.advance(minutes=10)
        post(client, 'sleeps/1/pause')
        clock.advance(minutes=5)
        post(client, 'sleeps/1/resume')
        result = put(client, 'sleeps/1', {'started_at': utc('11:45'), 'ended_at': None, 'paused_seconds': 0})

        expected = sleep_row(1, utc('11:45'), None, paused_seconds=300)
        assert result == expected

    def test_start_moved_past_the_side_marker_pulls_the_marker_forward(self, client):
        post(client, 'feeds', {**BREAST_LEFT, 'started_at': utc('11:00')})
        result = put(client, 'feeds/1', {'kind': 'breast', 'started_at': utc('11:30'), 'ended_at': None})

        expected = feed_row(1, 'breast', utc('11:30'), None, left_seconds=0, right_seconds=0, active_side='left', side_since=utc('11:30'))
        assert result == expected

    def test_start_moved_past_the_pause_pulls_the_pause_forward(self, client, clock):
        post(client, 'sleeps', {'started_at': utc('11:00')})
        post(client, 'sleeps/1/pause')
        clock.advance(minutes=10)
        result = put(client, 'sleeps/1', {'started_at': utc('12:05'), 'ended_at': None})

        expected = sleep_row(1, utc('12:05'), None, paused_at=utc('12:05'))
        assert result == expected

    def test_start_moved_later_caps_the_paused_total_at_the_time_elapsed(self, client, clock):
        post(client, 'sleeps', {'started_at': utc('11:00')})
        post(client, 'sleeps/1/pause')
        clock.advance(minutes=30)
        post(client, 'sleeps/1/resume')
        clock.advance(minutes=10)
        result = put(client, 'sleeps/1', {'started_at': utc('12:30'), 'ended_at': None})

        expected = sleep_row(1, utc('12:30'), None, paused_seconds=600)
        assert result == expected

    def test_changing_a_running_feed_to_bottle_drops_its_sides(self, client, clock):
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=5)
        result = put(client, 'feeds/1', {'kind': 'bottle', 'started_at': NOW, 'ended_at': None})

        expected = feed_row(1, 'bottle', NOW, None)
        assert result == expected

    def test_giving_an_end_finalises_the_running_side(self, client, clock):
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=10)
        result = put(client, 'feeds/1', {'kind': 'breast', 'ended_at': utc('12:08')})

        expected = default_breast_row(1, NOW, utc('12:08'), left_seconds=480, right_seconds=0, active_side='left')
        assert result == expected

    def test_giving_an_end_while_paused_counts_the_open_pause_up_to_that_end(self, client, clock):
        post(client, 'sleeps')
        clock.advance(minutes=10)
        post(client, 'sleeps/1/pause')
        clock.advance(minutes=10)
        result = put(client, 'sleeps/1', {'ended_at': utc('12:15')})

        expected = sleep_row(1, NOW, utc('12:15'), paused_seconds=300)
        assert result == expected

    def test_giving_an_end_before_the_pause_drops_the_open_pause(self, client, clock):
        post(client, 'sleeps')
        clock.advance(minutes=10)
        post(client, 'sleeps/1/pause')
        result = put(client, 'sleeps/1', {'ended_at': utc('12:05')})

        expected = sleep_row(1, NOW, utc('12:05'))
        assert result == expected


class TestConcurrentRequests:
    def test_simultaneous_pauses_pause_exactly_once(self, client):
        post(client, 'sleeps')
        with ThreadPoolExecutor(max_workers=8) as pool:
            codes = list(pool.map(lambda _: client.post('/api/sleeps/1/pause').status_code, range(16)))
        result = (sorted(codes), client.get('/api/status').json()['active']['sleep'])

        expected = ([200] + [409] * 15, sleep_row(1, NOW, None, paused_at=NOW))
        assert result == expected

    def test_simultaneous_pause_resume_and_side_switches_keep_the_feed_consistent(self, client, clock):
        'Whatever order the requests land in, every active second is on exactly one side'
        post(client, 'feeds', BREAST_LEFT)
        clock.advance(minutes=5)
        paths = ['feeds/1/pause', 'feeds/1/resume'] * 6
        sides = ['left', 'right'] * 6
        with ThreadPoolExecutor(max_workers=8) as pool:
            pauses   = pool.map(lambda path: client.post(f'/api/{path}').status_code, paths)
            switches = pool.map(lambda side: client.post('/api/feeds/1/side', json={'side': side}).status_code, sides)
            codes    = [*pauses, *switches]
        clock.advance(minutes=5)
        client.post('/api/feeds/1/resume')
        clock.advance(minutes=5)
        feed = post(client, 'feeds/1/stop')
        assert set(codes) <= {200, 409}
        result = feed['left_seconds'] + feed['right_seconds']

        expected = feed['duration_seconds']
        assert result == expected
