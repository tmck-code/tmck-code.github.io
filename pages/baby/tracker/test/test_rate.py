from babytracker import models, rate

from test.helper import NOW, default_breast_row, empty_summary, feed_row, post, utc

DAY     = {'start': utc('00:00'), 'end': utc('00:00', day=11)}
MAX_SEC = rate.BREAST_RATE_MAX_SECONDS


def weighed(client, started_at: str, ended_at: str, ml: int, **fields: object) -> dict[str, object]:
    'Log a breast feed weighed before and after, the baby ml grams heavier for it'
    body = {'kind': 'breast', 'started_at': started_at, 'ended_at': ended_at, 'weight_before_g': 3500, 'weight_after_g': 3500 + ml}
    return post(client, 'feeds', {**body, **fields})


def unweighed(client, started_at: str, ended_at: str, **fields: object) -> dict[str, object]:
    return post(client, 'feeds', {'kind': 'breast', 'started_at': started_at, 'ended_at': ended_at, **fields})


def log_three_weighed_feeds(client) -> None:
    'The day before: 100 ml over 40 active minutes, so 2.5 ml a minute (ids 1-3)'
    weighed(client, utc('08:00', day=9), utc('08:10', day=9), 30)
    weighed(client, utc('12:00', day=9), utc('12:20', day=9), 50)
    weighed(client, utc('16:00', day=9), utc('16:10', day=9), 20)


def rate_row(row_id: int, started_at: str, ended_at: str, intake_ml: int, ml_per_min: float = 2.5, feeds: int = 3, **fields: object) -> dict[str, object]:
    'A finished unweighed breast feed, estimated from its length at the learned rate'
    intake: dict[str, object] = {
        'intake_ml':               intake_ml,
        'intake_estimated':        True,
        'intake_source':           'rate',
        'intake_rate_ml_per_min':  ml_per_min,
        'intake_rate_feeds':       feeds,
        'intake_rate_max_seconds': MAX_SEC,
    }
    return feed_row(row_id, 'breast', started_at, ended_at, **{**intake, **fields})


def feeds_in(client, window: dict[str, str]) -> dict[int, dict[str, object]]:
    return {f['id']: f for f in client.get('/api/events', params=window).json()['feeds']}


class TestBreastRateIntake:
    def test_unweighed_feed_is_estimated_from_its_length_at_the_learned_rate(self, client):
        log_three_weighed_feeds(client)
        result = unweighed(client, utc('08:00'), utc('08:12'))

        expected = rate_row(4, utc('08:00'), utc('08:12'), intake_ml=30)
        assert result == expected

    def test_rate_is_pooled_not_a_mean_of_each_feeds_rate(self, client):
        'Per-feed rates are 3, 2.5 and 2 here; a 4 ml feed over 2 minutes barely moves the pooled rate'
        log_three_weighed_feeds(client)
        weighed(client, utc('18:00', day=9), utc('18:02', day=9), 8)
        result = unweighed(client, utc('08:00'), utc('08:21'))

        expected = rate_row(5, utc('08:00'), utc('08:21'), intake_ml=54, ml_per_min=2.571, feeds=4)
        assert result == expected

    def test_feed_weighed_later_does_not_change_an_earlier_estimate(self, client):
        log_three_weighed_feeds(client)
        unweighed(client, utc('08:00'), utc('08:12'))
        weighed(client, utc('09:00'), utc('09:10'), 100)
        unweighed(client, utc('10:00'), utc('10:12'))
        feeds  = feeds_in(client, DAY)
        result = [feeds[4], feeds[6]]

        expected = [
            rate_row(4, utc('08:00'), utc('08:12'), intake_ml=30),
            rate_row(6, utc('10:00'), utc('10:12'), intake_ml=48, ml_per_min=4.0, feeds=4),
        ]
        assert result == expected

    def test_weighed_feed_still_running_when_the_feed_started_is_not_used(self, client):
        log_three_weighed_feeds(client)
        weighed(client, utc('07:00'), utc('08:05'), 300)
        result = unweighed(client, utc('08:00'), utc('08:12'))

        expected = rate_row(5, utc('08:00'), utc('08:12'), intake_ml=30)
        assert result == expected

    def test_paused_time_earns_nothing(self, client):
        log_three_weighed_feeds(client)
        result = unweighed(client, utc('08:00'), utc('08:20'), paused_seconds=8 * 60)

        expected = rate_row(4, utc('08:00'), utc('08:20'), intake_ml=30, paused_seconds=8 * 60)
        assert result == expected

    def test_rate_counts_only_the_active_time_of_weighed_feeds(self, client):
        '80 ml over 20 active minutes (the first feed sat paused for 20 more): 4 ml a minute'
        weighed(client, utc('08:00', day=9), utc('08:30', day=9), 30, paused_seconds=20 * 60)
        weighed(client, utc('12:00', day=9), utc('12:05', day=9), 30)
        weighed(client, utc('16:00', day=9), utc('16:05', day=9), 20)
        result = unweighed(client, utc('08:00'), utc('08:10'))

        expected = rate_row(4, utc('08:00'), utc('08:10'), intake_ml=40, ml_per_min=4.0)
        assert result == expected

    def test_only_the_most_recent_weighed_feeds_teach_the_rate(self, client):
        'Eleven weighed feeds: the oldest (250 ml in 10 minutes) has dropped out of the last ten'
        weighed(client, utc('01:00', day=8), utc('01:10', day=8), 250)
        for hour in range(10):
            weighed(client, utc(f'{hour:02d}:00', day=9), utc(f'{hour:02d}:10', day=9), 20)
        result = unweighed(client, utc('08:00'), utc('08:12'))

        expected = rate_row(12, utc('08:00'), utc('08:12'), intake_ml=24, ml_per_min=2.0, feeds=rate.BREAST_RATE_FEEDS)
        assert result == expected

    def test_stopping_a_running_feed_estimates_it_at_the_rate(self, client):
        log_three_weighed_feeds(client)
        post(client, 'feeds', {'kind': 'breast', 'started_at': utc('11:40')})
        result = post(client, 'feeds/4/stop')

        expected = rate_row(4, utc('11:40'), NOW, intake_ml=50)
        assert result == expected

    def test_adding_weights_to_an_estimated_feed_makes_it_weighed(self, client):
        log_three_weighed_feeds(client)
        unweighed(client, utc('08:00'), utc('08:12'))
        body   = {'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:12'), 'weight_before_g': 3500, 'weight_after_g': 3555}
        result = client.put('/api/feeds/4', json=body).json()

        expected = feed_row(
            4, 'breast', utc('08:00'), utc('08:12'),
            weight_before_g=3500, weight_after_g=3555, intake_ml=55, intake_estimated=True, intake_source='weights',
        )
        assert result == expected

    def test_weighed_feed_reports_its_weights_whatever_the_rate_says(self, client):
        log_three_weighed_feeds(client)
        result = weighed(client, utc('08:00'), utc('08:12'), 70)

        expected = feed_row(
            4, 'breast', utc('08:00'), utc('08:12'),
            weight_before_g=3500, weight_after_g=3570, intake_ml=70, intake_estimated=True, intake_source='weights',
        )
        assert result == expected

    def test_bottle_feed_is_untouched_by_the_rate(self, client):
        log_three_weighed_feeds(client)
        result = post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('08:00'), 'ended_at': utc('08:12'), 'amount_ml': 60})

        expected = feed_row(4, 'bottle', utc('08:00'), utc('08:12'), amount_ml=60, intake_ml=60, intake_source='measured')
        assert result == expected


class TestBreastRateFallback:
    def test_too_few_weighed_feeds_keeps_the_default(self, client):
        weighed(client, utc('08:00', day=9), utc('08:10', day=9), 30)
        weighed(client, utc('12:00', day=9), utc('12:20', day=9), 50)
        result = unweighed(client, utc('08:00'), utc('08:12'))

        expected = default_breast_row(3, utc('08:00'), utc('08:12'))
        assert result == expected

    def test_implausible_weighed_feeds_teach_nothing(self, client):
        'A weight loss, no gain, no length, under two minutes and an impossible gain leave two usable feeds'
        weighed(client, utc('08:00', day=9), utc('08:10', day=9), 30)
        weighed(client, utc('09:00', day=9), utc('09:10', day=9), 50)
        weighed(client, utc('10:00', day=9), utc('10:10', day=9), -10)
        weighed(client, utc('11:00', day=9), utc('11:10', day=9), 0)
        weighed(client, utc('12:00', day=9), utc('12:00', day=9), 40)
        weighed(client, utc('13:00', day=9), utc('13:01', day=9), 40)
        weighed(client, utc('14:00', day=9), utc('14:10', day=9), rate.BREAST_REF_MAX_ML + 1)
        result = unweighed(client, utc('08:00'), utc('08:12'))

        expected = default_breast_row(8, utc('08:00'), utc('08:12'))
        assert result == expected

    def test_weighed_feeds_that_come_later_teach_nothing(self, client):
        result = unweighed(client, utc('08:00', day=9), utc('08:12', day=9))
        log_three_weighed_feeds(client)
        result = [result, feeds_in(client, {'start': utc('00:00', day=9), 'end': utc('00:00')})[1]]

        expected = [default_breast_row(1, utc('08:00', day=9), utc('08:12', day=9))] * 2
        assert result == expected

    def test_feed_with_no_length_keeps_the_default(self, client):
        log_three_weighed_feeds(client)
        result = unweighed(client, utc('08:00'), utc('08:00'))

        expected = default_breast_row(4, utc('08:00'), utc('08:00'))
        assert result == expected

    def test_default_follows_the_configured_amount(self, client, monkeypatch):
        monkeypatch.setattr(models, 'BREAST_DEFAULT_ML', 35)
        weighed(client, utc('08:00', day=9), utc('08:10', day=9), 30)
        result = unweighed(client, utc('08:00'), utc('08:12'))

        expected = default_breast_row(2, utc('08:00'), utc('08:12'), intake_ml=35)
        assert result == expected

    def test_deleting_the_weighed_feeds_brings_the_default_back(self, client):
        log_three_weighed_feeds(client)
        unweighed(client, utc('08:00'), utc('08:12'))
        client.delete('/api/feeds/3')
        result = feeds_in(client, DAY)[4]

        expected = default_breast_row(4, utc('08:00'), utc('08:12'))
        assert result == expected


class TestBreastRateClamps:
    def test_time_past_the_cap_earns_nothing(self, client):
        'A timer left running for three hours counts 45 minutes: 112.5 ml, rounded up'
        log_three_weighed_feeds(client)
        result = unweighed(client, utc('06:00'), utc('09:00'))

        expected = rate_row(4, utc('06:00'), utc('09:00'), intake_ml=113)
        assert result == expected

    def test_very_short_feed_is_never_estimated_at_nothing(self, client):
        log_three_weighed_feeds(client)
        result = unweighed(client, '2026-03-10T08:00:00Z', '2026-03-10T08:00:05Z')

        expected = rate_row(4, utc('08:00'), '2026-03-10T08:00:05Z', intake_ml=1)
        assert result == expected


class TestBreastRateTotals:
    def test_summary_adds_up_the_per_feed_figures(self, client):
        'Bottle 70, rate 30 and 113 (capped), weighed 55, one still running: 268 in all, 198 of it breast'
        log_three_weighed_feeds(client)
        post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('01:00'), 'ended_at': utc('01:10'), 'amount_ml': 70})
        unweighed(client, utc('03:00'), utc('03:12'))
        unweighed(client, utc('04:00'), utc('07:00'))
        weighed(client, utc('08:00'), utc('08:20'), 55)
        post(client, 'feeds', {'kind': 'breast', 'started_at': utc('11:50')})
        feeds  = feeds_in(client, DAY).values()
        totals = {
            'intake_ml':    sum(f['intake_ml'] or 0 for f in feeds),
            'estimated_ml': sum(f['intake_ml'] or 0 for f in feeds if f['intake_estimated']),
        }
        result = [client.get('/api/summary', params=DAY).json(), totals]

        expected = [
            empty_summary(
                DAY['start'], DAY['end'],
                feed_count=5, bottle_count=1, breast_count=4, feed_seconds=(10 + 12 + 180 + 20 + 10) * 60,
                intake_ml=268, estimated_ml=198,
            ),
            {'intake_ml': 268, 'estimated_ml': 198},
        ]
        assert result == expected

    def test_daily_uses_the_rate_learned_on_earlier_days(self, client):
        'The weighed feeds are outside the second day, and still teach its estimate'
        log_three_weighed_feeds(client)
        unweighed(client, utc('08:00'), utc('08:12'))
        result = client.get('/api/daily', params={'tz': 'UTC', 'start': '2026-03-09', 'end': '2026-03-10'}).json()

        expected = [
            empty_summary(
                utc('00:00', day=9), utc('00:00'),
                date='2026-03-09', feed_count=3, breast_count=3, feed_seconds=40 * 60, intake_ml=100, estimated_ml=100,
            ),
            empty_summary(
                utc('00:00'), utc('00:00', day=11),
                date='2026-03-10', feed_count=1, breast_count=1, feed_seconds=12 * 60, intake_ml=30, estimated_ml=30,
            ),
        ]
        assert result == expected


class TestBreastRateStatus:
    def test_running_breast_feed_carries_the_rate_but_no_intake_yet(self, client):
        log_three_weighed_feeds(client)
        post(client, 'feeds', {'kind': 'breast', 'started_at': utc('11:50')})
        result = client.get('/api/status').json()['active']['feed']

        expected = feed_row(
            4, 'breast', utc('11:50'), None,
            intake_rate_ml_per_min=2.5, intake_rate_feeds=3, intake_rate_max_seconds=MAX_SEC,
        )
        assert result == expected

    def test_running_breast_feed_without_a_rate_carries_none(self, client):
        post(client, 'feeds', {'kind': 'breast', 'started_at': utc('11:50')})
        result = client.get('/api/status').json()['active']['feed']

        expected = feed_row(1, 'breast', utc('11:50'), None)
        assert result == expected

    def test_last_breast_feed_is_estimated_at_the_rate(self, client):
        log_three_weighed_feeds(client)
        unweighed(client, utc('08:00'), utc('08:12'))
        last   = client.get('/api/status').json()['last']
        result = [last['feed'], last['breast']]

        expected = [rate_row(4, utc('08:00'), utc('08:12'), intake_ml=30)] * 2
        assert result == expected


class TestBreastRateEndpoint:
    'GET /api/breast-rate: what a form needs to show the estimate of a feed before it is saved'

    def test_reports_the_rate_an_unweighed_feed_starting_then_is_estimated_from(self, client):
        log_three_weighed_feeds(client)
        saved  = unweighed(client, utc('09:00'), utc('09:14'))
        result = client.get('/api/breast-rate', params={'at': utc('09:00')}).json()

        expected = {'ml_per_min': 2.5, 'feeds': 3, 'max_seconds': MAX_SEC, 'min_ml': rate.BREAST_RATE_MIN_ML, 'default_ml': models.BREAST_DEFAULT_ML}
        assert result == expected
        assert saved['intake_ml'] == rate.estimate_ml(rate.BreastRate(result['ml_per_min'], result['feeds']), 14 * 60)

    def test_only_counts_weighed_feeds_that_had_ended_by_then(self, client):
        'At 16:05 on the 9th the third weighed feed is still under way: two feeds, no rate'
        log_three_weighed_feeds(client)
        result = client.get('/api/breast-rate', params={'at': utc('16:05', day=9)}).json()

        expected = {'ml_per_min': None, 'feeds': None, 'max_seconds': MAX_SEC, 'min_ml': rate.BREAST_RATE_MIN_ML, 'default_ml': models.BREAST_DEFAULT_ML}
        assert result == expected

    def test_leaves_out_the_feed_being_edited(self, client):
        'Editing weighed feed 3 into an unweighed one: its own weights must not teach its rate'
        log_three_weighed_feeds(client)
        result = client.get('/api/breast-rate', params={'at': utc('09:00'), 'exclude_id': 3}).json()

        expected = (None, None)
        assert (result['ml_per_min'], result['feeds']) == expected

    def test_needs_a_moment_with_an_offset(self, client):
        result = [client.get('/api/breast-rate', params=params).status_code for params in ({}, {'at': '2026-03-10T09:00:00'})]

        expected = [422, 422]
        assert result == expected
