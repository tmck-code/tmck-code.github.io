import pytest
from fastapi.testclient import TestClient

from babytracker import api

from test.helper import Clock


@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / 'baby.duckdb')


@pytest.fixture
def clock(monkeypatch):
    'The server clock, frozen at helper.NOW; tests move it with clock.advance()'
    frozen = Clock()
    monkeypatch.setattr(api, 'utcnow', frozen)
    return frozen


@pytest.fixture
def client(db_path, clock):
    'API client on a fresh DuckDB file, with the server clock frozen at helper.NOW'
    with TestClient(api.create_app(db_path)) as test_client:
        yield test_client
