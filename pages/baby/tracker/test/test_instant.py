from test.helper import NOW, empty_events, empty_summary, express_row, post, utc


def nappy_row(
    row_id: int, at: str, wet: bool, dirty: bool, dirty_size: str | None = None, wet_size: str | None = None,
) -> dict[str, object]:
    return {'id': row_id, 'logged_at': at, 'wet': wet, 'dirty': dirty, 'wet_size': wet_size, 'dirty_size': dirty_size, 'notes': ''}


class TestNappies:
    def test_wet_nappy_defaults_to_now(self, client):
        result = post(client, 'nappies', {'wet': True})

        expected = nappy_row(1, NOW, wet=True, dirty=False)
        assert result == expected

    def test_nappy_can_be_both_wet_and_dirty_with_a_size(self, client):
        result = post(client, 'nappies', {'logged_at': utc('09:15'), 'wet': True, 'dirty': True, 'dirty_size': 'big'})

        expected = nappy_row(1, utc('09:15'), wet=True, dirty=True, dirty_size='big')
        assert result == expected

    def test_size_is_dropped_when_not_dirty(self, client):
        result = post(client, 'nappies', {'wet': True, 'dirty_size': 'small'})

        expected = nappy_row(1, NOW, wet=True, dirty=False)
        assert result == expected

    def test_wet_nappy_can_have_a_size(self, client):
        result = post(client, 'nappies', {'logged_at': utc('09:15'), 'wet': True, 'wet_size': 'heavy'})

        expected = nappy_row(1, utc('09:15'), wet=True, dirty=False, wet_size='heavy')
        assert result == expected

    def test_nappy_can_have_both_sizes(self, client):
        result = post(client, 'nappies', {'wet': True, 'dirty': True, 'wet_size': 'light', 'dirty_size': 'big'})

        expected = nappy_row(1, NOW, wet=True, dirty=True, dirty_size='big', wet_size='light')
        assert result == expected

    def test_wet_size_is_dropped_when_not_wet(self, client):
        result = post(client, 'nappies', {'dirty': True, 'wet_size': 'heavy'})

        expected = nappy_row(1, NOW, wet=False, dirty=True)
        assert result == expected

    def test_unknown_wet_size_is_rejected(self, client):
        result = client.post('/api/nappies', json={'wet': True, 'wet_size': 'soaked'}).status_code

        expected = 422
        assert result == expected

    def test_wet_size_round_trips_through_events(self, client):
        post(client, 'nappies', {'logged_at': utc('09:15'), 'wet': True, 'wet_size': 'heavy'})
        result = client.get('/api/events', params={'start': utc('00:00'), 'end': utc('00:00', day=11)}).json()['nappies']

        expected = [nappy_row(1, utc('09:15'), wet=True, dirty=False, wet_size='heavy')]
        assert result == expected

    def test_nappy_that_is_neither_wet_nor_dirty_is_rejected(self, client):
        result = client.post('/api/nappies', json={}).status_code

        expected = 422
        assert result == expected

    def test_edit_nappy(self, client):
        post(client, 'nappies', {'wet': True})
        result = client.put('/api/nappies/1', json={'logged_at': utc('11:00'), 'dirty': True, 'dirty_size': 'small'}).json()

        expected = nappy_row(1, utc('11:00'), wet=False, dirty=True, dirty_size='small')
        assert result == expected

    def test_edit_nappy_wet_size(self, client):
        post(client, 'nappies', {'wet': True, 'wet_size': 'light'})
        result = client.put('/api/nappies/1', json={'logged_at': utc('11:00'), 'wet': True, 'wet_size': 'heavy'}).json()

        expected = nappy_row(1, utc('11:00'), wet=True, dirty=False, wet_size='heavy')
        assert result == expected

    def test_edit_to_not_wet_clears_the_wet_size(self, client):
        post(client, 'nappies', {'wet': True, 'wet_size': 'heavy'})
        result = client.put('/api/nappies/1', json={'dirty': True, 'wet_size': 'heavy'}).json()

        expected = nappy_row(1, NOW, wet=False, dirty=True)
        assert result == expected

    def test_delete_nappy(self, client):
        post(client, 'nappies', {'wet': True})
        client.delete('/api/nappies/1')
        result = client.get('/api/status').json()['last']['nappy']

        expected = None
        assert result == expected


class TestWeights:
    def test_weigh_in_defaults_to_now(self, client):
        result = post(client, 'weights', {'grams': 3620})

        expected = {'id': 1, 'logged_at': NOW, 'grams': 3620, 'notes': ''}
        assert result == expected

    def test_weigh_in_needs_a_positive_weight(self, client):
        result = client.post('/api/weights', json={'grams': 0}).status_code

        expected = 422
        assert result == expected

    def test_edit_weigh_in(self, client):
        post(client, 'weights', {'grams': 3620})
        result = client.put('/api/weights/1', json={'logged_at': utc('07:00'), 'grams': 3640, 'notes': 'clinic scales'}).json()

        expected = {'id': 1, 'logged_at': utc('07:00'), 'grams': 3640, 'notes': 'clinic scales'}
        assert result == expected

    def test_delete_weigh_in(self, client):
        post(client, 'weights', {'grams': 3620})
        result = client.delete('/api/weights/1').status_code

        expected = 204
        assert result == expected


class TestExpresses:
    def test_express_defaults_to_now(self, client):
        result = post(client, 'expresses', {'amount_ml': 60})

        expected = express_row(1, NOW, 60)
        assert result == expected

    def test_express_keeps_its_time_and_notes(self, client):
        result = post(client, 'expresses', {'logged_at': utc('09:15'), 'amount_ml': 45, 'notes': 'left only'})

        expected = express_row(1, utc('09:15'), 45, 'left only')
        assert result == expected

    def test_express_with_an_end_needs_an_amount(self, client):
        'Without an amount or an end it starts a timer instead: see test_express_timer.py'
        result = client.post('/api/expresses', json={'started_at': utc('09:00'), 'ended_at': utc('09:15')}).status_code

        expected = 422
        assert result == expected

    def test_express_of_nothing_is_rejected(self, client):
        result = client.post('/api/expresses', json={'amount_ml': 0}).status_code

        expected = 422
        assert result == expected

    def test_express_over_two_litres_is_rejected(self, client):
        result = client.post('/api/expresses', json={'amount_ml': 2001}).status_code

        expected = 422
        assert result == expected

    def test_edit_express(self, client):
        post(client, 'expresses', {'amount_ml': 60})
        result = client.put('/api/expresses/1', json={'logged_at': utc('07:00'), 'amount_ml': 80, 'notes': 'morning'}).json()

        expected = express_row(1, utc('07:00'), 80, 'morning')
        assert result == expected

    def test_edit_without_a_time_keeps_the_logged_time(self, client):
        post(client, 'expresses', {'logged_at': utc('07:00'), 'amount_ml': 60})
        result = client.put('/api/expresses/1', json={'amount_ml': 70}).json()

        expected = express_row(1, utc('07:00'), 70)
        assert result == expected

    def test_edit_unknown_express_is_not_found(self, client):
        result = client.put('/api/expresses/4', json={'amount_ml': 70}).status_code

        expected = 404
        assert result == expected

    def test_delete_express(self, client):
        post(client, 'expresses', {'amount_ml': 60})
        result = client.delete('/api/expresses/1').status_code

        expected = 204
        assert result == expected

    def test_delete_unknown_express_is_not_found(self, client):
        result = client.delete('/api/expresses/1').status_code

        expected = 404
        assert result == expected

    def test_events_include_expresses_in_the_window(self, client):
        post(client, 'expresses', {'logged_at': utc('09:00'), 'amount_ml': 60})
        post(client, 'expresses', {'logged_at': utc('09:00', day=11), 'amount_ml': 90})
        result = client.get('/api/events', params={'start': utc('00:00'), 'end': utc('00:00', day=11)}).json()

        expected = empty_events(expresses=[express_row(1, utc('09:00'), 60)])
        assert result == expected

    def test_summary_totals_expressed_milk_apart_from_intake(self, client):
        post(client, 'expresses', {'logged_at': utc('09:00'), 'amount_ml': 60})
        post(client, 'expresses', {'logged_at': utc('11:00'), 'amount_ml': 45})
        post(client, 'feeds', {'kind': 'bottle', 'started_at': utc('10:00'), 'ended_at': utc('10:10'), 'amount_ml': 70})
        start, end = utc('00:00'), utc('00:00', day=11)
        result = client.get('/api/summary', params={'start': start, 'end': end}).json()

        expected = empty_summary(
            start, end,
            feed_count=1, bottle_count=1, feed_seconds=600, intake_ml=70, express_ml=105, express_count=2,
        )
        assert result == expected

    def test_daily_totals_put_each_express_on_its_own_day(self, client):
        post(client, 'expresses', {'logged_at': utc('23:30', day=9), 'amount_ml': 50})
        post(client, 'expresses', {'logged_at': utc('09:00'), 'amount_ml': 60})
        result = client.get('/api/daily', params={'tz': 'UTC', 'end': '2026-03-10'}).json()

        expected = [
            empty_summary(utc('00:00', day=9), utc('00:00'), date='2026-03-09', express_ml=50, express_count=1),
            empty_summary(utc('00:00'), utc('00:00', day=11), date='2026-03-10', express_ml=60, express_count=1),
        ]
        assert result == expected

    def test_status_reports_the_latest_express(self, client):
        post(client, 'expresses', {'logged_at': utc('11:00'), 'amount_ml': 45})
        post(client, 'expresses', {'logged_at': utc('09:00'), 'amount_ml': 60})
        result = client.get('/api/status').json()['last']['express']

        expected = express_row(1, utc('11:00'), 45)
        assert result == expected
