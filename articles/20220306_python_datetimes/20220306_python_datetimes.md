# 20220306 Python Datetimes

- [Standard Library vs. Packages](#standard-library-vs-packages)
- [Current Datetime](#current-datetime)
  - [Current Datetime as UTC](#current-datetime-as-utc)
  - [But what if my timezone isn't UTC?](#but-what-if-my-timezone-isnt-utc)
  - [Using the computer's local timezone](#using-the-computers-local-timezone)
- [Bonus](#bonus)
  - [Removing microseconds from the datetime](#removing-microseconds-from-the-datetime)


## Standard Library vs. Packages

Python `datetime` frequently trip me up when I use them, usually due to a combination of

1. dense documentation that is hard to read
2. unexpected default behaviour

I've made this post mostly so that I can reference it myself when I need to.

Essentially, if you are using the pip package `pytz` for anything except looking up definitions & metadata of UTC offsets, then you could just be using the standard library! (and the officially-recommended `dateutil` if you need a good parser)

One quick note is that python 3.9+ improve the behaiour of the `.isoformat()` method so that it produces a string with the colon between the hours and minutes of the offset, e.g.

```text
+0000 -> +00:00
```

This change means that the strings more closly meet the stricter RFC3339 standard for datetimes, and is much more usable by different systems in the wild. If you're frustrated with `.isoformat()`, try upgrading to 3.9+ first!

---

## Current Datetime

### Current Datetime as UTC

This should be simple, right? Let's try to
a) Get the current time in UTC and
b) convert to ISO 8601

There is a method `datetime.datetime.utcnow()`, it sounds perfect!

```python
In [1]: from datetime import datetime

In [2]: datetime.utcnow().isoformat()
Out[2]: '2022-03-06T00:48:07.160164'

# It turns out that utcnow is _not_ timezone-aware
In [3]: datetime.utcnow()
Out[3]: datetime.datetime(2022, 3, 6, 0, 49, 0, 407065)
```

> https://docs.python.org/3/library/datetime.html#datetime.datetime.now

Looking at the documentation for the `datetime.now` method:

"This function is preferred over today() and utcnow()."

```python
In [6]: from datetime import timezone

In [7]: datetime.now(tz=timezone.utc)
Out[7]: datetime.datetime(2022, 3, 6, 0, 51, 50, 160870, tzinfo=datetime.timezone.utc)

In [8]: datetime.now(tz=timezone.utc).isoformat()
Out[8]: '2022-03-06T00:51:54.887995+00:00'
```

Success! This format is (as stated in the intro) unexpected, and it's the existence of methods like `utcnow` that make the `datetime` module all the more confusing, especially for newcomers to python that are unaware of how confusing it is.

### But what if my timezone isn't UTC?

If all you need is to apply an offset, then you can do this without having to mess around with classes

```python
n [9]: from datetime import timedelta

In [10]: datetime.now(tz=timezone(timedelta(hours=11))).isoformat()
Out[10]: '2022-03-06T11:54:45.133517+11:00'

In [11]: datetime.now(tz=timezone.utc).isoformat()
Out[11]: '2022-03-06T00:54:59.331494+00:00'
```

### Using the computer's local timezone

This can be done via the `astimezone()` method, which of course is chained onto a `datetime` object and modifies it

```python
In [14]: datetime.now().astimezone()
Out[14]: datetime.datetime(2022, 3, 6, 11, 57, 28, 962640, tzinfo=datetime.timezone(datetime.timedelta(seconds=39600), 'AEDT'))
```

You can see that the timezone name is correctly, displaying the Daylight-Savings version of Australian Eastern Standard time

> `.astimezone()` **converts** a datetime in a certain timezone to another, **converting all datetime values as it does so**. This makes it extremely handy for converting datetimes to different timezones

## Bonus

### Removing microseconds from the datetime

Call the `replace` method and set microseconds to 0

```python
In [19]: datetime.now().replace(microsecond=0).astimezone(timezone.utc).isoformat()
Out[19]: '2022-03-06T01:02:55+00:00'
```