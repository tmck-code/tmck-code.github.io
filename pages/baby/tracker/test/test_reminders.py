from __future__ import annotations

from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

import duckdb
from fastapi.testclient import TestClient

from babytracker.api import create_app
from babytracker.reminders import Cadence, Plan, Progress, plan, restart_anchor

from test.helper import NOW, error, post, utc
from test.test_migration import WINDOW, build_old_database, old_rows_as_served_now

LONDON = 'Europe/London'
DAILY  = {'title': 'Vitamin D droplet', 'every': 1, 'unit': 'days', 'tz': LONDON}
BATH   = {'title': 'Bath', 'every': 2, 'unit': 'days', 'at': '08:00', 'tz': LONDON}
MEDS   = {'title': 'Drops', 'every': 4, 'unit': 'hours', 'tz': LONDON}


def at(text: str) -> datetime:
    'A UTC moment in March 2026 from "<day> hh:mm"'
    day, hhmm = text.split()
    return datetime.fromisoformat(f'2026-03-{int(day):02d}T{hhmm}:00+00:00')


class Schedule:
    'A cadence with the ticks made so far, as the API keeps them'

    def __init__(
        self, anchor: str, every: int, unit: str, at_time: str | None = None, zone: str = LONDON, on: date | None = None,
    ) -> None:
        when         = time.fromisoformat(at_time) if at_time else None
        self.cadence = Cadence(every=every, unit=unit, at=when, zone=ZoneInfo(zone), anchor=at(anchor), on=on)  # type: ignore[arg-type]
        self.ticks: list[tuple[datetime, datetime]] = []

    @property
    def progress(self) -> Progress:
        counted = [t for t in self.ticks if t[0] >= self.cadence.anchor]
        return Progress(
            last_completed_at = max((t[0] for t in self.ticks), default=None),
            counted_at        = max((t[0] for t in counted), default=None),
            counted_due_at    = max((t[1] for t in counted), default=None),
        )

    def plan(self, now: str) -> Plan:
        return plan(self.cadence, self.progress, at(now))

    def state(self, now: str) -> tuple[str, datetime | None]:
        found = self.plan(now)
        return (found.state, found.due_at)

    def tick(self, now: str) -> datetime:
        'Tick at that moment; returns the occurrence it counted for'
        satisfied = self.plan(now).satisfies
        self.ticks.append((at(now), satisfied))
        return satisfied


class TestFixedTimeCadence:
    def test_first_due_is_the_next_occurrence_after_creation(self):
        result = Schedule('10 12:00', 2, 'days', '08:00').state('10 12:00')

        expected = ('upcoming', at('11 08:00'))
        assert result == expected

    def test_first_due_is_today_when_the_time_is_still_ahead(self):
        result = Schedule('10 06:00', 2, 'days', '08:00').state('10 06:00')

        expected = ('upcoming', at('10 08:00'))
        assert result == expected

    def test_due_at_its_time_then_overdue_an_hour_later(self):
        bath   = Schedule('11 09:00', 2, 'days', '08:00')
        result = [bath.state(now)[0] for now in ('12 07:59', '12 08:00', '12 08:59', '12 09:00')]

        expected = ['upcoming', 'due', 'due', 'overdue']
        assert result == expected

    def test_ticking_early_counts_for_the_upcoming_occurrence(self):
        'Bath due Thursday 08:00, ticked Wednesday 19:00: next due Saturday 08:00'
        bath      = Schedule('11 09:00', 2, 'days', '08:00')
        satisfied = bath.tick('11 19:00')
        result    = (satisfied, bath.plan('11 19:01').due_at)

        expected = (at('12 08:00'), at('14 08:00'))
        assert result == expected

    def test_ticked_early_reads_done_through_the_day_it_was_due(self):
        bath = Schedule('11 09:00', 2, 'days', '08:00')
        bath.tick('11 19:00')
        result = [bath.state(now)[0] for now in ('11 19:01', '12 08:30', '12 23:59', '13 00:00', '14 08:00')]

        expected = ['done', 'done', 'done', 'upcoming', 'due']
        assert result == expected

    def test_ticking_on_time_moves_to_the_next_occurrence(self):
        bath = Schedule('11 09:00', 2, 'days', '08:00')
        bath.tick('12 08:10')
        result = bath.state('12 08:11')

        expected = ('done', at('14 08:00'))
        assert result == expected

    def test_ticking_late_leaves_no_backlog(self):
        'Three occurrences missed, one tick: the next due is the next one on the grid'
        bath      = Schedule('11 09:00', 2, 'days', '08:00')
        before    = bath.state('16 19:00')
        satisfied = bath.tick('16 19:00')
        result    = (before, satisfied, bath.state('16 19:01'))

        expected = (('overdue', at('12 08:00')), at('16 08:00'), ('done', at('18 08:00')))
        assert result == expected

    def test_weekly_repeats_on_the_same_weekday(self):
        weekly = Schedule('10 12:00', 1, 'weeks', '09:30')
        weekly.tick('11 09:30')
        result = weekly.plan('11 09:31').due_at

        expected = at('18 09:30')
        assert result == expected

    def test_time_of_day_is_local_across_a_daylight_saving_change(self):
        'London clocks go forward on 29 March 2026: 08:00 local moves from 08:00 to 07:00 UTC'
        daily  = Schedule('27 12:00', 1, 'days', '08:00')
        result = [daily.tick(now) for now in ('27 13:00', '28 13:00', '29 13:00')]

        expected = [at('28 08:00'), at('29 07:00'), at('30 07:00')]
        assert result == expected

    def test_zone_decides_the_moment(self):
        'Melbourne is UTC+11 in March: 08:00 there is 21:00 UTC the day before'
        result = Schedule('10 12:00', 1, 'days', '08:00', zone='Australia/Melbourne').plan('10 12:00').due_at

        expected = at('10 21:00')
        assert result == expected


class TestWholeDayCadence:
    def test_due_on_the_day_it_is_created(self):
        result = Schedule('10 12:00', 1, 'days').state('10 12:00')

        expected = ('due', at('10 00:00'))
        assert result == expected

    def test_not_nagged_at_nine_because_yesterday_was_at_eight(self):
        'Ticked Monday 08:00: on Tuesday it is due all day, and never overdue'
        daily = Schedule('09 07:00', 1, 'days')
        daily.tick('09 08:00')
        result = [daily.state(now)[0] for now in ('09 08:01', '09 23:59', '10 00:00', '10 09:00', '10 23:59')]

        expected = ['done', 'done', 'due', 'due', 'due']
        assert result == expected

    def test_overdue_once_the_day_has_passed(self):
        daily = Schedule('09 07:00', 1, 'days')
        daily.tick('09 08:00')
        result = daily.state('11 00:00')

        expected = ('overdue', at('10 00:00'))
        assert result == expected

    def test_late_tick_counts_for_today(self):
        'Tuesday missed, ticked on Wednesday: Wednesday is done and Thursday is next'
        daily = Schedule('09 07:00', 1, 'days')
        daily.tick('09 08:00')
        satisfied = daily.tick('11 10:00')
        result    = (satisfied, daily.state('11 10:01'), daily.state('12 00:00')[0])

        expected = (at('11 00:00'), ('done', at('12 00:00')), 'due')
        assert result == expected

    def test_every_two_days_is_upcoming_on_the_day_between(self):
        every2 = Schedule('10 12:00', 2, 'days')
        every2.tick('10 13:00')
        result = [every2.state(now) for now in ('10 14:00', '11 09:00', '12 00:00')]

        expected = [('done', at('12 00:00')), ('upcoming', at('12 00:00')), ('due', at('12 00:00'))]
        assert result == expected

    def test_day_starts_at_local_midnight(self):
        'Melbourne (UTC+11): Wednesday begins at 13:00 UTC on Tuesday'
        daily = Schedule('10 02:00', 1, 'days', zone='Australia/Melbourne')
        daily.tick('10 03:00')
        result = [daily.state(now)[0] for now in ('10 12:59', '10 13:00')]

        expected = ['done', 'due']
        assert result == expected


class TestHourCadence:
    def test_due_n_hours_after_creation(self):
        result = Schedule('10 12:00', 4, 'hours').state('10 12:00')

        expected = ('upcoming', at('10 16:00'))
        assert result == expected

    def test_due_n_hours_after_the_last_tick(self):
        drops = Schedule('10 12:00', 4, 'hours')
        drops.tick('10 15:00')
        result = drops.plan('10 15:01').due_at

        expected = at('10 19:00')
        assert result == expected

    def test_states_through_one_interval(self):
        drops = Schedule('10 12:00', 4, 'hours')
        drops.tick('10 16:30')
        result = [drops.state(now)[0] for now in ('10 16:31', '10 17:30', '10 20:30', '10 21:29', '10 21:30')]

        expected = ['done', 'upcoming', 'due', 'due', 'overdue']
        assert result == expected


class TestRestart:
    def test_schedule_restarts_from_now(self):
        bath   = Schedule('10 12:00', 2, 'days', '08:00')
        result = restart_anchor(bath.cadence, bath.progress, at('15 10:00'))

        expected = at('15 10:00')
        assert result == expected

    def test_whole_day_reminder_ticked_today_restarts_tomorrow(self):
        daily = Schedule('10 07:00', 1, 'days')
        daily.tick('10 08:00')
        result = restart_anchor(daily.cadence, daily.progress, at('10 10:00'))

        expected = at('11 00:00')
        assert result == expected

    def test_ticks_from_before_the_anchor_do_not_count_on_the_new_grid(self):
        bath = Schedule('15 10:00', 2, 'days', '08:00')
        bath.ticks.append((at('14 08:00'), at('14 08:00')))
        result = bath.state('15 10:00')

        expected = ('upcoming', at('16 08:00'))
        assert result == expected


def once(day: int, at_time: str, anchor: str = '10 12:00', zone: str = LONDON) -> Schedule:
    return Schedule(anchor, 1, 'once', at_time, zone=zone, on=date(2026, 3, day))


class TestOneTime:
    def test_upcoming_then_due_then_overdue_and_never_expires(self):
        jab    = once(12, '14:30')
        result = [jab.state(now) for now in ('10 12:00', '12 14:29', '12 14:30', '12 15:29', '12 15:30', '30 09:00')]

        due      = at('12 14:30')
        expected = [('upcoming', due), ('upcoming', due), ('due', due), ('due', due), ('overdue', due), ('overdue', due)]
        assert result == expected

    def test_ticked_early_is_finished_with_nothing_due_next(self):
        jab       = once(12, '14:30')
        satisfied = jab.tick('11 09:00')
        result    = (satisfied, [jab.state(now) for now in ('11 09:01', '12 14:30', '20 00:00')])

        expected = (at('12 14:30'), [('done', None)] * 3)
        assert result == expected

    def test_ticked_late_is_finished(self):
        jab = once(12, '14:30')
        jab.tick('15 08:00')
        result = jab.state('15 08:01')

        expected = ('done', None)
        assert result == expected

    def test_a_date_in_the_past_is_simply_overdue(self):
        result = once(8, '09:00').state('10 12:00')

        expected = ('overdue', at('08 09:00'))
        assert result == expected

    def test_time_is_local_to_the_zone(self):
        'Melbourne is UTC+11 in March: 14:30 on the 12th there is 03:30 UTC'
        result = once(12, '14:30', zone='Australia/Melbourne').plan('10 12:00').due_at

        expected = at('12 03:30')
        assert result == expected

    def test_time_is_local_after_a_daylight_saving_change(self):
        'London is on summer time from 29 March: 14:30 local is 13:30 UTC'
        result = once(30, '14:30').plan('10 12:00').due_at

        expected = at('30 13:30')
        assert result == expected

    def test_ticks_from_before_the_anchor_do_not_finish_it(self):
        'Re-armed: its date was changed after the earlier tick'
        jab = once(20, '14:30', anchor='15 10:00')
        jab.ticks.append((at('12 14:00'), at('12 14:30')))
        result = jab.state('15 10:00')

        expected = ('upcoming', at('20 14:30'))
        assert result == expected


def reminder_row(row_id: int, body: dict[str, object], **fields: object) -> dict[str, object]:
    return {
        'id':                 row_id,
        'description':        '',
        'at':                 None,
        'on':                 None,
        'finished':           False,
        'icon':               'bell',
        'colour':             'neutral',
        'active':             True,
        'created_at':         NOW,
        'last_completed_at':  None,
        'last_completion_id': None,
        **body,
        **fields,
    }


def listed(client: TestClient) -> list[dict[str, object]]:
    result: list[dict[str, object]] = client.get('/api/reminders').json()
    return result


def standing(client: TestClient) -> list[tuple[object, object, object]]:
    return [(r['title'], r['state'], r['next_due_at']) for r in listed(client)]


class TestReminderApi:
    def test_daily_reminder_is_due_today(self, client):
        result = post(client, 'reminders', DAILY)

        expected = reminder_row(1, DAILY, state='due', next_due_at=utc('00:00'), overdue_at=utc('00:00', day=11), all_day=True)
        assert result == expected

    def test_bath_every_two_days_at_eight(self, client):
        result = post(client, 'reminders', {**BATH, 'description': 'hair too', 'icon': 'bath', 'colour': 'blue'})

        expected = reminder_row(
            1, BATH, description='hair too', icon='bath', colour='blue',
            state='upcoming', next_due_at=utc('08:00', day=11), overdue_at=utc('09:00', day=11), all_day=False,
        )
        assert result == expected

    def test_title_is_trimmed(self, client):
        result = post(client, 'reminders', {**DAILY, 'title': '  Vitamin D  '})['title']

        expected = 'Vitamin D'
        assert result == expected

    def test_hour_cadence_ignores_a_time_of_day(self, client):
        result = post(client, 'reminders', {**MEDS, 'at': '08:00'})['at']

        expected = None
        assert result == expected

    def test_list_puts_the_most_pressing_first(self, client, clock):
        post(client, 'reminders', BATH)
        post(client, 'reminders', MEDS)
        post(client, 'reminders', DAILY)
        post(client, 'reminders/3/complete')
        post(client, 'reminders', {**DAILY, 'title': 'Paused'})
        post(client, 'reminders/4/pause')
        clock.advance(minutes=5 * 60)
        result = standing(client)

        expected = [
            ('Drops', 'overdue', utc('16:00')),
            ('Bath', 'upcoming', utc('08:00', day=11)),
            ('Vitamin D droplet', 'done', utc('00:00', day=11)),
            ('Paused', 'paused', None),
        ]
        assert result == expected

    def test_tick_early_counts_for_the_upcoming_occurrence(self, client):
        result = post(client, 'reminders/' + str(post(client, 'reminders', BATH)['id']) + '/complete')

        expected = {
            'reminder': reminder_row(
                1, BATH, state='done', next_due_at=utc('08:00', day=13), overdue_at=utc('09:00', day=13), all_day=False,
                last_completed_at=NOW, last_completion_id=1,
            ),
            'completion': {'id': 1, 'reminder_id': 1, 'completed_at': NOW, 'due_at': utc('08:00', day=11)},
        }
        assert result == expected

    def test_second_tick_while_done_is_refused(self, client):
        post(client, 'reminders', BATH)
        post(client, 'reminders/1/complete')
        result = (error(client, 'post', 'reminders/1/complete'), len(client.get('/api/reminders/1/completions').json()))

        expected = ((409, 'already done'), 1)
        assert result == expected

    def test_tick_late_leaves_no_backlog(self, client, clock):
        post(client, 'reminders', BATH)
        clock.advance(minutes=5 * 24 * 60)
        before = standing(client)
        ticked = post(client, 'reminders/1/complete')['completion']
        result = (before, ticked['due_at'], standing(client))  # type: ignore[index]

        expected = (
            [('Bath', 'overdue', utc('08:00', day=11))],
            utc('08:00', day=15),
            [('Bath', 'done', utc('08:00', day=17))],
        )
        assert result == expected

    def test_undo_restores_what_was_due(self, client):
        post(client, 'reminders', BATH)
        post(client, 'reminders/1/complete')
        undone = client.delete('/api/reminders/1/completions/1').json()
        result = (undone['state'], undone['next_due_at'], undone['last_completed_at'], client.get('/api/reminders/1/completions').json())

        expected = ('upcoming', utc('08:00', day=11), None, [])
        assert result == expected

    def test_undo_of_another_reminders_tick_is_not_found(self, client):
        post(client, 'reminders', BATH)
        post(client, 'reminders', DAILY)
        post(client, 'reminders/2/complete')
        result = client.delete('/api/reminders/1/completions/1').status_code

        expected = 404
        assert result == expected

    def test_daily_is_due_not_overdue_the_morning_after(self, client, clock):
        post(client, 'reminders', DAILY)
        post(client, 'reminders/1/complete')
        clock.advance(minutes=21 * 60)
        morning = standing(client)
        clock.advance(minutes=15 * 60)
        result = (morning, standing(client))

        expected = (
            [('Vitamin D droplet', 'due', utc('00:00', day=11))],
            [('Vitamin D droplet', 'overdue', utc('00:00', day=11))],
        )
        assert result == expected

    def test_hour_cadence_runs_from_the_tick(self, client, clock):
        post(client, 'reminders', MEDS)
        clock.advance(minutes=90)
        post(client, 'reminders/1/complete')
        result = standing(client)

        expected = [('Drops', 'done', utc('17:30'))]
        assert result == expected

    def test_backdated_tick(self, client, clock):
        post(client, 'reminders', MEDS)
        clock.advance(minutes=120)
        result = post(client, 'reminders/1/complete', {'completed_at': utc('13:00')})['reminder']['next_due_at']  # type: ignore[index]

        expected = utc('17:00')
        assert result == expected

    def test_tick_in_the_future_is_rejected(self, client):
        post(client, 'reminders', MEDS)
        result = error(client, 'post', 'reminders/1/complete', {'completed_at': utc('13:00')})

        expected = (422, 'completed_at is in the future')
        assert result == expected

    def test_tick_before_the_schedule_started_is_rejected(self, client):
        post(client, 'reminders', MEDS)
        result = error(client, 'post', 'reminders/1/complete', {'completed_at': utc('11:00')})

        expected = (422, 'completed_at is before the schedule started')
        assert result == expected

    def test_completions_are_newest_first(self, client, clock):
        post(client, 'reminders', MEDS)
        post(client, 'reminders/1/complete')
        clock.advance(minutes=5 * 60)
        post(client, 'reminders/1/complete')
        result = client.get('/api/reminders/1/completions').json()

        expected = [
            {'id': 2, 'reminder_id': 1, 'completed_at': utc('17:00'), 'due_at': utc('16:00')},
            {'id': 1, 'reminder_id': 1, 'completed_at': NOW, 'due_at': utc('16:00')},
        ]
        assert result == expected

    def test_editing_the_look_keeps_the_schedule(self, client, clock):
        post(client, 'reminders', BATH)
        post(client, 'reminders/1/complete')
        clock.advance(minutes=60)
        edited = client.put('/api/reminders/1', json={**BATH, 'title': 'Bath time', 'icon': 'bath', 'colour': 'blue'}).json()
        result = (edited['title'], edited['icon'], edited['colour'], edited['state'], edited['next_due_at'])

        expected = ('Bath time', 'bath', 'blue', 'done', utc('08:00', day=13))
        assert result == expected

    def test_editing_the_cadence_restarts_the_schedule(self, client, clock):
        post(client, 'reminders', BATH)
        post(client, 'reminders/1/complete')
        clock.advance(minutes=60)
        edited = client.put('/api/reminders/1', json={**BATH, 'every': 3, 'at': '18:00'}).json()
        result = (edited['every'], edited['at'], edited['state'], edited['next_due_at'], edited['last_completed_at'])

        expected = (3, '18:00', 'upcoming', utc('18:00'), NOW)
        assert result == expected

    def test_daily_ticked_today_does_not_ask_again_when_its_cadence_changes(self, client, clock):
        post(client, 'reminders', DAILY)
        post(client, 'reminders/1/complete')
        clock.advance(minutes=60)
        edited = client.put('/api/reminders/1', json={**DAILY, 'every': 2}).json()
        again  = error(client, 'post', 'reminders/1/complete')
        clock.advance(minutes=12 * 60)
        result = ((edited['state'], edited['next_due_at']), again, standing(client))

        expected = (('done', utc('00:00', day=11)), (409, 'already done'), [('Vitamin D droplet', 'due', utc('00:00', day=11))])
        assert result == expected

    def test_paused_reminder_is_never_due_and_cannot_be_ticked(self, client, clock):
        post(client, 'reminders', BATH)
        paused = post(client, 'reminders/1/pause')
        clock.advance(minutes=5 * 24 * 60)
        result = ((paused['active'], paused['state'], paused['next_due_at']), standing(client), error(client, 'post', 'reminders/1/complete'))

        expected = ((False, 'paused', None), [('Bath', 'paused', None)], (409, 'reminder is paused'))
        assert result == expected

    def test_resumed_reminder_does_not_come_back_overdue(self, client, clock):
        post(client, 'reminders', BATH)
        post(client, 'reminders/1/pause')
        clock.advance(minutes=5 * 24 * 60)
        resumed = post(client, 'reminders/1/resume')
        result  = (resumed['active'], resumed['state'], resumed['next_due_at'])

        expected = (True, 'upcoming', utc('08:00', day=16))
        assert result == expected

    def test_resuming_a_running_reminder_changes_nothing(self, client, clock):
        created = post(client, 'reminders', BATH)
        clock.advance(minutes=60)
        result = post(client, 'reminders/1/resume')

        expected = created
        assert result == expected

    def test_delete_removes_the_reminder_and_its_ticks(self, client, db_path):
        post(client, 'reminders', BATH)
        post(client, 'reminders/1/complete')
        status = client.delete('/api/reminders/1').status_code
        result = (status, listed(client), client.get('/api/reminders/1/completions').status_code)

        expected = (204, [], 404)
        assert result == expected

    def test_ticks_of_a_deleted_reminder_are_gone_from_the_database(self, db_path, clock):
        with TestClient(create_app(db_path)) as client:
            post(client, 'reminders', BATH)
            post(client, 'reminders/1/complete')
            client.delete('/api/reminders/1')
        with duckdb.connect(db_path) as conn:
            result = conn.execute('SELECT count(*) FROM reminder_completions').fetchone()

        expected = (0,)
        assert result == expected

    def test_unknown_reminder_is_not_found(self, client):
        result = [
            client.put('/api/reminders/9', json=BATH).status_code,
            client.delete('/api/reminders/9').status_code,
            client.post('/api/reminders/9/complete').status_code,
            client.post('/api/reminders/9/pause').status_code,
            client.post('/api/reminders/9/resume').status_code,
            client.get('/api/reminders/9/completions').status_code,
        ]

        expected = [404] * 6
        assert result == expected


JAB = {'title': 'Vaccination', 'unit': 'once', 'on': '2026-03-12', 'at': '14:30', 'tz': LONDON}


class TestOneTimeApi:
    def test_one_time_reminder_is_upcoming_until_its_moment(self, client):
        result = post(client, 'reminders', JAB)

        expected = reminder_row(
            1, JAB, every=1, state='upcoming', next_due_at=utc('14:30', day=12), overdue_at=utc('15:30', day=12), all_day=False,
        )
        assert result == expected

    def test_one_in_the_past_is_accepted_and_overdue(self, client):
        created = post(client, 'reminders', {**JAB, 'on': '2026-03-08'})
        result  = (created['state'], created['next_due_at'])

        expected = ('overdue', utc('14:30', day=8))
        assert result == expected

    def test_stays_overdue_until_ticked(self, client, clock):
        post(client, 'reminders', JAB)
        clock.advance(minutes=20 * 24 * 60)
        result = standing(client)

        expected = [('Vaccination', 'overdue', utc('14:30', day=12))]
        assert result == expected

    def test_tick_early_finishes_it(self, client, clock):
        post(client, 'reminders', JAB)
        ticked = post(client, 'reminders/1/complete')
        clock.advance(minutes=3 * 24 * 60)
        after  = listed(client)[0]
        result = (ticked['completion'], (after['state'], after['finished'], after['next_due_at'], after['last_completed_at']))

        expected = (
            {'id': 1, 'reminder_id': 1, 'completed_at': NOW, 'due_at': utc('14:30', day=12)},
            ('done', True, None, NOW),
        )
        assert result == expected

    def test_tick_late_finishes_it(self, client, clock):
        post(client, 'reminders', JAB)
        clock.advance(minutes=3 * 24 * 60)
        ticked = post(client, 'reminders/1/complete')['reminder']
        result = (ticked['state'], ticked['finished'], ticked['next_due_at'])  # type: ignore[index]

        expected = ('done', True, None)
        assert result == expected

    def test_finished_one_cannot_be_ticked_again(self, client, clock):
        post(client, 'reminders', JAB)
        post(client, 'reminders/1/complete')
        clock.advance(minutes=3 * 24 * 60)
        result = error(client, 'post', 'reminders/1/complete')

        expected = (409, 'already done')
        assert result == expected

    def test_undo_makes_it_due_again(self, client, clock):
        post(client, 'reminders', JAB)
        clock.advance(minutes=3 * 24 * 60)
        post(client, 'reminders/1/complete')
        undone = client.delete('/api/reminders/1/completions/1').json()
        result = (undone['state'], undone['finished'], undone['next_due_at'])

        expected = ('overdue', False, utc('14:30', day=12))
        assert result == expected

    def test_editing_the_date_arms_it_again_and_keeps_its_history(self, client, clock):
        post(client, 'reminders', JAB)
        post(client, 'reminders/1/complete')
        clock.advance(minutes=60)
        edited = client.put('/api/reminders/1', json={**JAB, 'on': '2026-03-20'}).json()
        result = (
            (edited['state'], edited['finished'], edited['next_due_at'], edited['last_completed_at']),
            len(client.get('/api/reminders/1/completions').json()),
        )

        expected = (('upcoming', False, utc('14:30', day=20), NOW), 1)
        assert result == expected

    def test_editing_only_the_title_keeps_it_finished(self, client, clock):
        post(client, 'reminders', JAB)
        post(client, 'reminders/1/complete')
        clock.advance(minutes=60)
        edited = client.put('/api/reminders/1', json={**JAB, 'title': 'Jab'}).json()
        result = (edited['title'], edited['state'], edited['finished'])

        expected = ('Jab', 'done', True)
        assert result == expected

    def test_repeating_reminder_can_become_one_time(self, client, clock):
        post(client, 'reminders', BATH)
        post(client, 'reminders/1/complete')
        clock.advance(minutes=60)
        edited = client.put('/api/reminders/1', json={**JAB, 'title': 'Bath'}).json()
        result = (
            (edited['unit'], edited['on'], edited['at'], edited['state'], edited['next_due_at']),
            len(client.get('/api/reminders/1/completions').json()),
        )

        expected = (('once', '2026-03-12', '14:30', 'upcoming', utc('14:30', day=12)), 1)
        assert result == expected

    def test_one_time_reminder_can_become_repeating(self, client, clock):
        post(client, 'reminders', JAB)
        post(client, 'reminders/1/complete')
        clock.advance(minutes=60)
        edited = client.put('/api/reminders/1', json={**BATH, 'on': '2026-03-12'}).json()
        result = (edited['unit'], edited['every'], edited['on'], edited['finished'], edited['state'], edited['next_due_at'])

        expected = ('days', 2, None, False, 'upcoming', utc('08:00', day=11))
        assert result == expected

    def test_paused_finished_one_still_reads_finished(self, client):
        post(client, 'reminders', JAB)
        post(client, 'reminders/1/complete')
        paused = post(client, 'reminders/1/pause')
        result = (paused['state'], paused['finished'])

        expected = ('paused', True)
        assert result == expected

    def test_date_and_time_are_required(self, client):
        result = [
            client.post('/api/reminders', json={**JAB, 'on': None}).status_code,
            client.post('/api/reminders', json={**JAB, 'at': None}).status_code,
            client.post('/api/reminders', json={**JAB, 'on': '12 March'}).status_code,
        ]

        expected = [422] * 3
        assert result == expected


class TestReminderValidation:
    def rejected(self, client: TestClient, **fields: object) -> int:
        return client.post('/api/reminders', json={**BATH, **fields}).status_code

    def test_bad_bodies_are_rejected(self, client):
        result = {
            'blank title':    self.rejected(client, title='   '),
            'long title':     self.rejected(client, title='x' * 61),
            'zero interval':  self.rejected(client, every=0),
            'too many days':  self.rejected(client, every=366),
            'too many hours': self.rejected(client, unit='hours', every=73),
            'too many weeks': self.rejected(client, unit='weeks', every=53),
            'unknown unit':   self.rejected(client, unit='months'),
            'bad time':       self.rejected(client, at='8am'),
            'hour 24':        self.rejected(client, at='24:00'),
            'unknown zone':   self.rejected(client, tz='Mars/Olympus'),
            'unknown icon':   self.rejected(client, icon='rocket'),
            'unknown colour': self.rejected(client, colour='#ff0000'),
            'long notes':     self.rejected(client, description='x' * 501),
        }

        expected = dict.fromkeys(result, 422)
        assert result == expected

    def test_nothing_is_stored_when_rejected(self, client):
        self.rejected(client, every=0)
        result = listed(client)

        expected: list[object] = []
        assert result == expected

    def test_limits_are_accepted(self, client):
        result = [
            self.rejected(client, title='x' * 60, every=365),
            self.rejected(client, unit='hours', every=72),
            self.rejected(client, unit='weeks', every=52, at='23:59'),
        ]

        expected = [201] * 3
        assert result == expected


class TestReminderMigration:
    def test_old_database_gains_reminders_and_keeps_its_rows(self, db_path, clock):
        build_old_database(db_path)
        with TestClient(create_app(db_path)) as upgraded:
            empty   = listed(upgraded)
            created = post(upgraded, 'reminders', DAILY)['id']
            events  = upgraded.get('/api/events', params=WINDOW).json()
        result = (empty, created, events)

        expected = ([], 1, old_rows_as_served_now())
        assert result == expected

    def test_reminders_survive_a_restart(self, db_path, clock):
        with TestClient(create_app(db_path)) as first:
            post(first, 'reminders', BATH)
            post(first, 'reminders/1/complete')
        with TestClient(create_app(db_path)) as reopened:
            result = standing(reopened)

        expected = [('Bath', 'done', utc('08:00', day=13))]
        assert result == expected


def test_anchor_moment_is_utc():
    result = Schedule('10 12:00', 1, 'days').plan('10 12:00').due_at.tzinfo

    expected = timezone.utc
    assert result == expected
