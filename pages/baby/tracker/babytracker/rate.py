'''
Estimate the intake of a breast feed that was not weighed, from how long it lasted.

The rate (ml per active minute) is learned from earlier breast feeds that were weighed before
and after, unless one was typed in on the Settings page. Nothing here touches the database: the
API hands over the weighed feeds and the saved settings, and the Feed model applies the rate it
is given.
'''

from __future__ import annotations

from bisect import bisect_right
from collections.abc import Iterable
from datetime import datetime, timezone
from itertools import accumulate
from typing import NamedTuple

# A weighed feed teaches the rate only if it is plausible: the baby gained weight, by no more than
# a feed could hold, over long enough for scale error not to swamp it.
BREAST_REF_MIN_SECONDS  = 120
BREAST_REF_MIN_ML       = 1
BREAST_REF_MAX_ML       = 300
# The rate pools the most recent weighed feeds (a newborn's rate changes week to week) ...
BREAST_RATE_FEEDS       = 10
# ... and is not trusted on fewer than this: the feed then counts the flat default instead.
BREAST_RATE_MIN_FEEDS   = 3
# Time past this earns nothing more, so a forgotten timer cannot run the estimate away.
BREAST_RATE_MAX_SECONDS = 45 * 60
# A feed that happened is never estimated at nothing.
BREAST_RATE_MIN_ML      = 1
# A rate typed in on the Settings page replaces the learned one. Anything past this is a typo.
BREAST_MANUAL_RATE_MAX  = 20.0
# The flat default set on the Settings page: no more than a weighed feed may count.
BREAST_DEFAULT_MAX_ML   = BREAST_REF_MAX_ML

BEGINNING = datetime.min.replace(tzinfo=timezone.utc)

# Whether a weighed feed is part of the rate, or why it is not (see RateHistory.verdicts).
USED      = 'used'
NO_GAIN   = 'no_gain'
OVER_MAX  = 'over_max'
TOO_SHORT = 'too_short'
OLDER     = 'older'
NOT_ENDED = 'not_ended'

VERDICT_TEXT = {
    USED:      'used',
    NO_GAIN:   'no weight gain',
    OVER_MAX:  f'gain over {BREAST_REF_MAX_ML} ml',
    TOO_SHORT: f'under {BREAST_REF_MIN_SECONDS // 60} minutes',
    OLDER:     f'older than the {BREAST_RATE_FEEDS} most recent',
    NOT_ENDED: 'had not ended yet',
}


class BreastRate(NamedTuple):
    ml_per_min: float
    feeds:      int | None    # how many weighed feeds it was pooled from; None: set by hand in Settings

    @property
    def manual(self) -> bool:
        return self.feeds is None


class WeighedFeed(NamedTuple):
    ended_at: datetime
    ml:       int      # weight gained over the feed, 1 g taken as 1 ml
    seconds:  int      # active length, pauses excluded
    feed_id:  int | None = None


def unusable(feed: WeighedFeed) -> str | None:
    'Why a weighed feed cannot teach the rate; None when it can'
    if feed.ml < BREAST_REF_MIN_ML:
        return NO_GAIN
    if feed.ml > BREAST_REF_MAX_ML:
        return OVER_MAX
    if feed.seconds < BREAST_REF_MIN_SECONDS:
        return TOO_SHORT
    return None


def usable(feed: WeighedFeed) -> bool:
    return unusable(feed) is None


class Pool(NamedTuple):
    'The weighed feeds behind the rate at one moment, and their sum'

    ml:      int
    seconds: int
    feeds:   list[WeighedFeed]

    @property
    def enough(self) -> bool:
        return len(self.feeds) >= BREAST_RATE_MIN_FEEDS

    @property
    def ml_per_min(self) -> float | None:
        'What the feeds pool to, also while there are too few of them for it to be used'
        return self.ml * 60 / self.seconds if self.seconds else None

    @property
    def rate(self) -> BreastRate | None:
        return BreastRate(ml_per_min=self.ml * 60 / self.seconds, feeds=len(self.feeds)) if self.enough else None


class RateHistory:
    '''
    The rate as it stood at any moment. A feed is estimated from the weighed feeds that had already
    ended when it started, so an estimate does not move when later feeds are weighed.
    '''

    def __init__(self, weighed: Iterable[WeighedFeed]) -> None:
        self._all     = list(weighed)
        feeds         = sorted((f for f in self._all if usable(f)), key=lambda f: f.ended_at)
        self._feeds   = feeds
        self._ended   = [f.ended_at for f in feeds]
        # Running totals, so any run of consecutive feeds is one subtraction.
        self._ml      = [0, *accumulate(f.ml for f in feeds)]
        self._seconds = [0, *accumulate(f.seconds for f in feeds)]

    def _window(self, moment: datetime) -> tuple[int, int]:
        'Where the latest usable feeds that ended by moment sit in the sorted list'
        last = bisect_right(self._ended, moment)
        return max(last - BREAST_RATE_FEEDS, 0), last

    def before(self, moment: datetime) -> BreastRate | None:
        'Pooled rate (total ml over total minutes) of the latest weighed feeds that ended by moment'
        first, last = self._window(moment)
        if last - first < BREAST_RATE_MIN_FEEDS:
            return None
        ml      = self._ml[last] - self._ml[first]
        seconds = self._seconds[last] - self._seconds[first]
        return BreastRate(ml_per_min=ml * 60 / seconds, feeds=last - first)

    def pool(self, moment: datetime) -> Pool:
        'The feeds before() pools at moment, with their totals: the same window and the same sums'
        first, last = self._window(moment)
        return Pool(
            ml      = self._ml[last] - self._ml[first],
            seconds = self._seconds[last] - self._seconds[first],
            feeds   = self._feeds[first:last],
        )

    def verdicts(self, moment: datetime) -> list[tuple[WeighedFeed, str]]:
        'Every weighed feed with whether the pool at moment uses it (USED) or why it does not'
        pooled = {id(f) for f in self.pool(moment).feeds}

        def verdict(feed: WeighedFeed) -> str:
            if id(feed) in pooled:
                return USED
            return unusable(feed) or (NOT_ENDED if feed.ended_at > moment else OLDER)

        return [(feed, verdict(feed)) for feed in self._all]


class EstimateSettings(NamedTuple):
    'One saved row of the Settings page. It applies to feeds that start at or after effective_from.'

    effective_from: datetime | None    # None: from the beginning
    default_ml:     int | None         # None: the configured fallback (BABY_BREAST_DEFAULT_ML)
    manual_rate:    float | None       # ml per active minute; None: the learned rate
    row_id:         int | None = None


class Basis(NamedTuple):
    'What an unweighed breast feed is estimated from'

    rate:       BreastRate | None      # None: no rate to go on, the feed counts default_ml
    default_ml: int


class Estimator:
    '''
    The learned rate and the saved settings together: what a feed starting at a given moment is
    estimated from. With no settings saved this is the learned rate and the fallback default.
    '''

    def __init__(self, history: RateHistory, settings: Iterable[EstimateSettings], fallback_ml: int) -> None:
        # Stable sort: of two rows effective from the same moment, the one saved later wins.
        rows           = sorted(settings, key=lambda s: s.effective_from or BEGINNING)
        self.history   = history
        self._rows     = rows
        self._from     = [s.effective_from or BEGINNING for s in rows]
        self._fallback = fallback_ml

    def settings_at(self, moment: datetime) -> EstimateSettings | None:
        'The row in force for a feed starting at moment; None before the first one'
        index = bisect_right(self._from, moment)
        return self._rows[index - 1] if index else None

    def at(self, moment: datetime) -> Basis:
        row        = self.settings_at(moment)
        default_ml = self._fallback if row is None or row.default_ml is None else row.default_ml
        if row is not None and row.manual_rate is not None:
            return Basis(BreastRate(ml_per_min=row.manual_rate, feeds=None), default_ml)
        return Basis(self.history.before(moment), default_ml)


def estimate_ml(rate: BreastRate, seconds: int) -> int:
    'Whole ml for an unweighed feed of that active length, rounding halves up'
    minutes = min(seconds, BREAST_RATE_MAX_SECONDS) / 60
    return max(int(rate.ml_per_min * minutes + 0.5), BREAST_RATE_MIN_ML)
