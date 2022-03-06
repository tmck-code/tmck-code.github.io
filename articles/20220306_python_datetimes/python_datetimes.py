#!/usr/bin/env python3

from datetime import date, datetime, timezone, timedelta


def current_datetime_local() -> datetime:
    'Returns current datetime as timezone-aware, i.e. with a tzinfo field representing the timezone'
    return datetime.now().astimezone()

def current_datetime_in_timezone(utc_offset_seconds: int = 0) -> datetime:
    'Returns urrent datetime as timezone-aware translated to a UTC offset'
    return datetime.now(timezone(timedelta(seconds=utc_offset_seconds)))

def current_datetime_as_timezone(utc_offset_seconds: int = 0) -> datetime:
    'Returns current datetime as timezone-aware translated to a UTC offset'
    return datetime.now().replace(tzinfo=timezone(timedelta(seconds=utc_offset_seconds)))

def current_tz_name() -> str:
    return current_datetime_local().tzname()

def current_tz_offset_seconds() -> timedelta:
    return current_datetime_local().utcoffset().total_seconds()


def convert_datetime_to_timezone(dt: datetime, utc_offset_seconds: int = 0) -> datetime:
    return dt.astimezone(timezone(timedelta(seconds=utc_offset_seconds)))


def iso8601_str(dt, microsecond=True):
    if not microsecond:
        dt = dt.replace(microsecond=0)
    return dt.isoformat()
