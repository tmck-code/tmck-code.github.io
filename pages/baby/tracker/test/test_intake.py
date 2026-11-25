from babytracker import models

from test.helper import NOW, default_breast_row, empty_summary, feed_row, post, utc

DAY = {'start': utc('00:00'), 'end': utc('00:00', day=11)}


class TestBreastDefaultIntake:
    def test_finished_breast_feed_without_weights_counts_the_default(self, client):
        result = post(client, 'feeds', {'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:20')})

        expected = default_breast_row(1, utc('08:00'), utc('08:20'))
        assert result == expected

    def test_one_weight_alone_still_counts_the_default(self, client):
        result = post(client, 'feeds', {'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:20'), 'weight_before_g': 3500})

        expected = default_breast_row(1, utc('08:00'), utc('08:20'), weight_before_g=3500)
        assert result == expected

    def test_in_progress_breast_feed_has_no_intake_yet(self, client):
        result = post(client, 'feeds', {'kind': 'breast'})

        expected = feed_row(1, 'breast', NOW, None)
        assert result == expected

    def test_stopping_a_breast_feed_without_weights_counts_the_default(self, client):
        post(client, 'feeds', {'kind': 'breast', 'started_at': utc('11:40')})
        result = post(client, 'feeds/1/stop')

        expected = default_breast_row(1, utc('11:40'), NOW)
        assert result == expected

    def test_weights_win_over_the_default(self, client):
        body = {'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:20'), 'weight_before_g': 3500, 'weight_after_g': 3555}
        result = post(client, 'feeds', body)

        expected = feed_row(
            1, 'breast', utc('08:00'), utc('08:20'),
            weight_before_g=3500, weight_after_g=3555, intake_ml=55, intake_estimated=True, intake_source='weights',
        )
        assert result == expected

    def test_bottle_feed_without_an_amount_gets_no_default(self, client):
        result = post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('08:00'), 'ended_at': utc('08:20')})

        expected = feed_row(1, 'bottle', utc('08:00'), utc('08:20'))
        assert result == expected

    def test_summary_counts_default_estimates_but_not_feeds_in_progress(self, client):
        post(client, 'feeds', {'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:20')})
        post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('10:00'), 'ended_at': utc('10:10'), 'amount_ml': 70})
        post(client, 'feeds', {'kind': 'breast', 'started_at': utc('11:50')})
        result = client.get('/api/summary', params=DAY).json()

        expected = empty_summary(
            DAY['start'], DAY['end'],
            feed_count=3, bottle_count=1, breast_count=2, feed_seconds=40 * 60, intake_ml=90, estimated_ml=20,
        )
        assert result == expected

    def test_default_follows_the_configured_amount(self, client, monkeypatch):
        monkeypatch.setattr(models, 'BREAST_DEFAULT_ML', 35)
        result = post(client, 'feeds', {'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:20')})

        expected = default_breast_row(1, utc('08:00'), utc('08:20'), intake_ml=35)
        assert result == expected

    def test_default_of_zero_still_counts_as_an_estimate(self, client, monkeypatch):
        monkeypatch.setattr(models, 'BREAST_DEFAULT_ML', 0)
        result = post(client, 'feeds', {'kind': 'breast', 'started_at': utc('08:00'), 'ended_at': utc('08:20')})

        expected = default_breast_row(1, utc('08:00'), utc('08:20'), intake_ml=0)
        assert result == expected


class TestBreastDefaultSetting:
    def test_unset_gives_twenty(self):
        result = models.breast_default_ml(None)

        expected = 20
        assert result == expected

    def test_whole_number_overrides_the_default(self):
        result = models.breast_default_ml(' 35 ')

        expected = 35
        assert result == expected

    def test_zero_is_allowed(self):
        result = models.breast_default_ml('0')

        expected = 0
        assert result == expected

    def test_values_that_are_not_whole_numbers_fall_back(self):
        result = [models.breast_default_ml(raw) for raw in ('', 'lots', '-5', '12.5', '2001')]

        expected = [20, 20, 20, 20, 20]
        assert result == expected
