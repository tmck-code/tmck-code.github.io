'Request and response shapes for the API.'

from __future__ import annotations

import os
from datetime import date, datetime, time
from typing import Annotated, Literal, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, BaseModel, Field, computed_field, field_validator, model_validator

from babytracker.rate import BREAST_DEFAULT_MAX_ML, BREAST_MANUAL_RATE_MAX, BREAST_RATE_MAX_SECONDS, BreastRate, estimate_ml
from babytracker.reminders import EVERY_MAX, Cadence, State, Unit

FeedKind     = Literal['bottle', 'breast']
Side         = Literal['left', 'right']
WetSize      = Literal['light', 'heavy']
DirtySize    = Literal['small', 'big']
IntakeSource = Literal['measured', 'weights', 'rate', 'manual_rate', 'default']
Millis       = Annotated[int, Field(ge=0, le=2000)]
ExpressedMl  = Annotated[int, Field(ge=1, le=2000)]
Grams        = Annotated[int, Field(gt=0, le=30000)]
Notes        = Annotated[str, Field(max_length=500)]
SideSeconds  = Annotated[int, Field(ge=0, le=86400)]
# The ceiling only keeps the value inside the INTEGER column; the real limit is the entry's length.
PausedSeconds = Annotated[int, Field(ge=0, le=31_536_000)]
# What the Settings page may set for breast feeds that were not weighed.
DefaultMl     = Annotated[int, Field(ge=0, le=BREAST_DEFAULT_MAX_ML)]
ManualRate    = Annotated[float, Field(gt=0, le=BREAST_MANUAL_RATE_MAX)]
SettingsScope = Literal['all', 'future']
EstimateBasis = Literal['rate', 'manual_rate', 'default']
# What a reminder may look like. Keys, not artwork: the frontend maps them to its sprite and colour tokens.
ReminderIcon   = Literal['bell', 'clock', 'droplet', 'bath', 'pill', 'thermometer', 'scissors', 'sun', 'moon', 'calendar', 'heart', 'star']
ReminderColour = Literal['neutral', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink']
ReminderTitle  = Annotated[str, Field(min_length=1, max_length=60)]
TimeOfDay      = Annotated[str, Field(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')]

BREAST_DEFAULT_ML_ENV  = 'BABY_BREAST_DEFAULT_ML'
BREAST_DEFAULT_ML_BASE = 20
BREAST_DEFAULT_ML_MAX  = 2000


def breast_default_ml(raw: str | None) -> int:
    'Parse the BABY_BREAST_DEFAULT_ML setting: a whole number 0..2000, anything else falls back to 20'
    text = (raw or '').strip()
    if not text.isdecimal() or int(text) > BREAST_DEFAULT_ML_MAX:
        return BREAST_DEFAULT_ML_BASE
    return int(text)


# Intake assumed for a finished breast feed that has no before/after weights and no rate to
# estimate it from, until the Settings page saves another amount. Read once, at import.
BREAST_DEFAULT_ML = breast_default_ml(os.environ.get(BREAST_DEFAULT_ML_ENV))


class TimedIn(BaseModel):
    'An activity with a start and (once finished) an end. No start means now; no end means in progress.'

    started_at:     AwareDatetime | None = None
    ended_at:       AwareDatetime | None = None
    notes:          Notes = ''
    paused_seconds: PausedSeconds | None = None

    @model_validator(mode='after')
    def end_not_before_start(self) -> Self:
        if self.started_at and self.ended_at and self.ended_at < self.started_at:
            raise ValueError('ended_at is before started_at')
        return self


class SleepIn(TimedIn):
    pass


class FeedIn(TimedIn):
    kind:            FeedKind
    amount_ml:       Millis | None = None      # what the baby took
    bottle_ml:       Millis | None = None      # what was in the bottle; may be less than amount_ml (a top-up)
    weight_before_g: Grams | None = None
    weight_after_g:  Grams | None = None
    side:            Side | None = None
    left_seconds:    SideSeconds | None = None
    right_seconds:   SideSeconds | None = None

    @model_validator(mode='after')
    def sides_are_for_breast_feeds(self) -> Self:
        if self.kind == 'breast':
            self.bottle_ml = None
            return self
        if self.side is not None:
            raise ValueError('only breast feeds have sides')
        self.left_seconds  = None
        self.right_seconds = None
        return self


class StopIn(BaseModel):
    ended_at: AwareDatetime | None = None


class FeedStopIn(StopIn):
    'Details usually only known once the feed is over. All optional so stopping is never blocked.'

    amount_ml:       Millis | None = None
    bottle_ml:       Millis | None = None      # bottle feeds only; dropped for a breast feed
    weight_before_g: Grams | None = None
    weight_after_g:  Grams | None = None


class SideIn(BaseModel):
    side: Side


class BreastEstimateIn(BaseModel):
    '''
    The Settings page's figures for breast feeds that were not weighed. scope 'all' replaces every
    saved row, so all such feeds are re-estimated; 'future' only applies to feeds starting from now.
    '''

    default_ml:             DefaultMl | None = None     # None: the BABY_BREAST_DEFAULT_ML fallback
    manual_rate_ml_per_min: ManualRate | None = None    # None: the rate learned from weighed feeds
    scope:                  SettingsScope


class NappyIn(BaseModel):
    logged_at:         AwareDatetime | None = None
    wet:        bool = False
    dirty:      bool = False
    wet_size:   WetSize | None = None
    dirty_size: DirtySize | None = None
    notes:      Notes = ''

    @model_validator(mode='after')
    def wet_or_dirty(self) -> Self:
        if not (self.wet or self.dirty):
            raise ValueError('a nappy must be wet, dirty or both')
        if not self.wet:
            self.wet_size = None
        if not self.dirty:
            self.dirty_size = None
        return self


class WeightIn(BaseModel):
    logged_at:    AwareDatetime | None = None
    grams: Grams
    notes: Notes = ''


class ExpressIn(TimedIn):
    '''
    An express session. No amount_ml and no ended_at: a timer that starts running (at started_at, or
    now). With amount_ml it is a finished session: started_at to ended_at, or logged at one moment
    (logged_at, or started_at, or now) when there is no ended_at.
    '''

    logged_at: AwareDatetime | None = None
    amount_ml: ExpressedMl | None = None

    @model_validator(mode='after')
    def finished_has_an_amount(self) -> Self:
        if self.ended_at is not None and self.amount_ml is None:
            raise ValueError('a finished express session needs amount_ml')
        return self


class ExpressStopIn(StopIn):
    'The amount is usually measured just after stopping. Optional so stopping is never blocked.'

    amount_ml: ExpressedMl | None = None


class Timed(BaseModel):
    '''
    A sleep, feed or express session. started_at/ended_at are wall-clock; time spent paused is tracked separately.
    paused_seconds totals the pauses already finished, paused_at is set while a pause is open.
    '''

    id:             int
    started_at:     datetime
    ended_at:       datetime | None
    notes:          str
    paused_seconds: int = 0
    paused_at:      datetime | None = None

    @field_validator('paused_seconds', mode='before')
    @classmethod
    def no_pause_recorded(cls, value: object) -> object:
        'Rows from before pausing existed hold NULL'
        return 0 if value is None else value

    @computed_field  # type: ignore[prop-decorator]
    @property
    def duration_seconds(self) -> int | None:
        'Active (unpaused) length of a finished activity; None while it is in progress'
        if self.ended_at is None:
            return None
        wall = int((self.ended_at - self.started_at).total_seconds())
        return max(wall - self.paused_seconds, 0)


class Sleep(Timed):
    pass


class Feed(Timed):
    kind:            FeedKind
    amount_ml:       int | None
    # What was in the bottle. Never intake: that is amount_ml alone, also while there is none yet.
    bottle_ml:       int | None = None
    weight_before_g: int | None
    weight_after_g:  int | None
    left_seconds:    int | None = None
    right_seconds:   int | None = None
    active_side:     Side | None = None
    side_since:      datetime | None = None

    # Set by the API for a breast feed (see api.with_rates); never part of the payload itself.
    # rate: learned, or set by hand in Settings. default_ml: None means BREAST_DEFAULT_ML.
    rate:            BreastRate | None = Field(default=None, exclude=True)
    default_ml:      int | None = Field(default=None, exclude=True)

    @property
    def weighed(self) -> bool:
        return self.weight_before_g is not None and self.weight_after_g is not None

    @property
    def rate_applies(self) -> bool:
        'An unweighed breast feed with a rate: still running, or finished with some active time'
        if self.kind != 'breast' or self.weighed or self.rate is None:
            return False
        return self.ended_at is None or bool(self.duration_seconds)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def intake_source(self) -> IntakeSource | None:
        'Where intake_ml comes from; None when there is no figure (yet)'
        if self.kind == 'bottle':
            return None if self.amount_ml is None else 'measured'
        if self.weighed:
            return 'weights'
        if self.ended_at is None:
            return None
        if self.rate is None or not self.rate_applies:
            return 'default'
        return 'manual_rate' if self.rate.manual else 'rate'

    @computed_field  # type: ignore[prop-decorator]
    @property
    def intake_ml(self) -> int | None:
        '''
        Bottle: measured ml. Breast: weight gained over the feed (1 g taken as 1 ml). A breast feed
        that finished without both weights is estimated: its active length at the rate learned from
        earlier weighed feeds (or the one set in Settings), or the default amount when there is no
        rate (or no length) to go on.
        '''
        if self.kind == 'bottle':
            return self.amount_ml
        if self.weight_before_g is not None and self.weight_after_g is not None:
            return max(self.weight_after_g - self.weight_before_g, 0)
        if self.ended_at is None:
            return None
        if self.rate is not None and self.rate_applies:
            return estimate_ml(self.rate, self.duration_seconds or 0)
        return BREAST_DEFAULT_ML if self.default_ml is None else self.default_ml

    @computed_field  # type: ignore[prop-decorator]
    @property
    def intake_estimated(self) -> bool:
        return self.kind == 'breast' and self.intake_ml is not None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def intake_rate_ml_per_min(self) -> float | None:
        'The rate behind a rate estimate, learned or manual; also on a running breast feed, for a live figure'
        return round(self.rate.ml_per_min, 3) if self.rate is not None and self.rate_applies else None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def intake_rate_feeds(self) -> int | None:
        'How many weighed feeds the rate was learned from; None for a rate set by hand in Settings'
        return self.rate.feeds if self.rate is not None and self.rate_applies else None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def intake_rate_max_seconds(self) -> int | None:
        'Active time past this adds nothing to a rate estimate'
        return BREAST_RATE_MAX_SECONDS if self.rate_applies else None


class Nappy(BaseModel):
    id:         int
    logged_at:         datetime
    wet:        bool
    dirty:      bool
    wet_size:   WetSize | None
    dirty_size: DirtySize | None
    notes:      str


class Weight(BaseModel):
    id:    int
    logged_at:    datetime
    grams: int
    notes: str


class Express(Timed):
    '''
    An express session. logged_at is when it counts (its start). One logged at a single moment,
    as all were before the timer, reads as started_at = ended_at = logged_at. amount_ml is None
    while the timer runs, and for a session stopped without an amount.
    '''

    logged_at: datetime
    amount_ml: int | None

    @model_validator(mode='before')
    @classmethod
    def from_stored(cls, data: object) -> object:
        'A stored row: started_at NULL means logged at one moment; amount_ml 0 stands in for no amount'
        if not isinstance(data, dict):
            return data
        row = dict(data)
        if row.get('started_at') is None:
            row['started_at'] = row['ended_at'] = row.get('logged_at')
        if row.get('amount_ml') == 0:
            row['amount_ml'] = None
        return row


class Events(BaseModel):
    sleeps:    list[Sleep]
    feeds:     list[Feed]
    nappies:   list[Nappy]
    weights:   list[Weight]
    expresses: list[Express]


class Summary(BaseModel):
    '''
    Totals for one window. Feeds, nappies, weigh-ins and expresses count where they start; sleep and
    feed time is clipped to the window and excludes pauses. Expressed milk is never part of intake,
    and an express session whose timer is still running is not counted at all.
    '''

    start:           datetime
    end:             datetime
    sleep_seconds:   int
    sleep_count:     int
    feed_count:      int
    bottle_count:    int
    breast_count:    int
    feed_seconds:    int
    intake_ml:       int
    estimated_ml:    int
    nappy_count:     int
    wet_count:       int
    dirty_count:     int
    weight_g:        int | None
    express_ml:      int
    express_count:   int


class DaySummary(Summary):
    date: str


class Active(BaseModel):
    sleep:   Sleep | None
    feed:    Feed | None
    express: Express | None


class Last(BaseModel):
    sleep:   Sleep | None
    feed:    Feed | None
    nappy:   Nappy | None
    weight:  Weight | None
    express: Express | None
    breast:  Feed | None


class BreastRateOut(BaseModel):
    'What an unweighed breast feed starting at a given moment would be estimated from'

    ml_per_min:  float | None   # None: too few weighed feeds yet, so the feed counts default_ml
    feeds:       int | None     # None beside a rate: the rate was set by hand in Settings
    max_seconds: int            # active time past this earns nothing more
    min_ml:      int            # a rate estimate is never lower than this
    default_ml:  int            # the flat figure used when there is no rate, or no length


class Status(BaseModel):
    now:    datetime
    active: Active
    last:   Last


class BreastSettingsRow(BaseModel):
    'One saved change of the breast estimate settings; it applies to feeds starting at or after effective_from'

    id:                     int
    effective_from:         datetime | None   # None: from the beginning (saved with scope 'all')
    default_ml:             int | None        # None: the BABY_BREAST_DEFAULT_ML fallback
    manual_rate_ml_per_min: float | None      # None: the rate learned from weighed feeds
    created_at:             datetime


class BreastRule(BaseModel):
    'The constants of the rate rule (rate.py), so no client has to repeat them'

    recent_feeds:    int     # the rate pools this many of the most recent usable weighed feeds
    min_feeds:       int     # and is not used on fewer than this
    max_seconds:     int     # active time past this earns nothing more
    min_ml:          int     # a rate estimate is never lower than this
    ref_min_ml:      int     # a weighed feed is usable from this gain ...
    ref_max_ml:      int     # ... up to this one ...
    ref_min_seconds: int     # ... and from this active length


class BreastPool(BaseModel):
    'The sum behind the learned rate for a feed starting now'

    total_ml:      int
    total_seconds: int
    ml_per_min:    float | None   # what the feeds pool to; None with no usable feed at all
    feeds:         int
    min_feeds:     int
    enough:        bool           # False: too few feeds, the learned rate is not used yet


class BreastExample(BaseModel):
    minutes: int
    ml:      int


class BreastInForce(BaseModel):
    'What an unweighed breast feed starting now is estimated from, settings applied'

    source:     EstimateBasis
    ml_per_min: float | None
    feeds:      int | None       # weighed feeds behind a learned rate
    default_ml: int              # the flat figure used when there is no rate, or no length
    examples:   list[BreastExample]


class WeighedFeedOut(BaseModel):
    'A breast feed weighed before and after, and its part in the rate for a feed starting now'

    id:               int
    started_at:       datetime
    ended_at:         datetime
    duration_seconds: int
    weight_before_g:  int
    weight_after_g:   int
    ml:               int
    ml_per_min:       float | None   # None for a feed of no length
    used:             bool
    reason:           str            # 'used', or why not: no_gain, over_max, too_short, older, not_ended
    reason_text:      str
    feed:             Feed           # the whole feed, for an edit form


class BreastSettingsLimits(BaseModel):
    default_ml_max:  int
    manual_rate_max: float


class BreastEstimateOut(BaseModel):
    'Everything the Settings page shows about the estimate of an unweighed breast feed'

    now:            datetime
    current:        BreastSettingsRow | None   # the saved row in force now; None: nothing overridden
    history:        list[BreastSettingsRow]    # newest first
    env_default_ml: int                        # BABY_BREAST_DEFAULT_ML: used wherever no row sets a default
    in_force:       BreastInForce
    pool:           BreastPool
    rule:           BreastRule
    limits:         BreastSettingsLimits
    weighed:        list[WeighedFeedOut]       # newest first


class ReminderIn(BaseModel):
    '''
    A recurring task: every N hours, days or weeks. at is a wall-clock time of day in the IANA zone
    tz, for day and week cadences only (an hour cadence ignores it). tz is the zone of the phone
    that saved it, and also decides where a day begins for a reminder with no time.

    Or a one-time task, unit 'once': due on the local day on at the time at, both required. The day
    may be in the past (the reminder is simply overdue). every and on mean nothing outside their
    own kind and are ignored.
    '''

    title:       ReminderTitle
    description: Notes          = ''
    every:       Annotated[int, Field(ge=1)] = 1
    unit:        Unit
    at:          TimeOfDay | None = None
    on:          date | None    = None
    tz:          str
    icon:        ReminderIcon   = 'bell'
    colour:      ReminderColour = 'neutral'

    @field_validator('title', 'description', mode='before')
    @classmethod
    def trimmed(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator('tz')
    @classmethod
    def known_zone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError(f'unknown timezone {value!r}') from None
        return value

    @model_validator(mode='after')
    def check_cadence(self) -> Self:
        if self.unit == 'once':
            if self.on is None or self.at is None:
                raise ValueError('a one-time reminder needs a date (on) and a time (at)')
            self.every = 1
            return self
        if self.every > EVERY_MAX[self.unit]:
            raise ValueError(f'every is at most {EVERY_MAX[self.unit]} {self.unit}')
        self.on = None
        if self.unit == 'hours':
            self.at = None
        return self

    def cadence(self, anchor: datetime) -> Cadence:
        at = time.fromisoformat(self.at) if self.at else None
        return Cadence(every=self.every, unit=self.unit, at=at, zone=ZoneInfo(self.tz), anchor=anchor, on=self.on)


class ReminderCompleteIn(BaseModel):
    completed_at: AwareDatetime | None = None   # None: now


class ReminderCompletion(BaseModel):
    id:           int
    reminder_id:  int
    completed_at: datetime
    due_at:       datetime | None   # the occurrence the tick counted for


class Reminder(BaseModel):
    'A reminder with where it stands now. Paused: state "paused" and nothing due.'

    id:                 int
    title:              str
    description:        str
    every:              int
    unit:               Unit
    at:                 str | None
    on:                 date | None       # the day of a one-time reminder (unit 'once')
    tz:                 str
    icon:               str
    colour:             str
    active:             bool
    created_at:         datetime
    state:              State
    next_due_at:        datetime | None   # the occurrence waiting (due, overdue) or the next one coming; None: paused or finished
    overdue_at:         datetime | None   # when next_due_at turns overdue
    all_day:            bool              # no time of day: next_due_at is the start of the local day it is due on
    finished:           bool              # a one-time reminder that has been ticked: nothing more is due
    last_completed_at:  datetime | None
    last_completion_id: int | None        # the tick to delete to undo it


class ReminderTicked(BaseModel):
    reminder:   Reminder
    completion: ReminderCompletion
