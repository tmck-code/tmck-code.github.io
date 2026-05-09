#!/usr/bin/env python3
'''Fetch AUD-denominated daily OHLC for every symbol referenced in
investments.csv and bake to prices_data.js.

Idempotent and incremental: persists `last_fetch_date` per symbol inside
the output file itself. First run pulls 5y; subsequent runs pull only the
gap. Writes atomically via a temp file in the same directory.
'''

from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import curl_cffi
from laser_prynter import pp, pbar

YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}'

REPO = Path(__file__).resolve().parent
CSV_PATH = REPO / 'investments.csv'
OUT_PATH = REPO / 'prices_data.js'
TMP_PATH = REPO / 'prices_data.js.tmp'

FETCHABLE_TYPES = {'metal', 'equity', 'crypto'}
HISTORY_YEARS = 5


@dataclass(frozen=True)
class SymbolMapping:
    source_ticker: str
    multiplier: float
    denominator: float
    unit: str


SYMBOL_MAP: dict[str, SymbolMapping] = {
    'XAUAUD': SymbolMapping('PMGOLD.AX', 100.0, 31.1035, 'gram'),
    'XAGAUD': SymbolMapping('ETPMAG.AX', 1.0, 1.0, 'ounce'),
}


def resolve_mapping(symbol: str, asset_type: str, unit: str) -> SymbolMapping:
    if symbol in SYMBOL_MAP:
        return SYMBOL_MAP[symbol]
    if asset_type == 'equity':
        return SymbolMapping(f'{symbol}.AX', 1.0, 1.0, unit)
    if asset_type == 'crypto':
        return SymbolMapping(symbol, 1.0, 1.0, unit)
    raise ValueError(f'no mapping for symbol {symbol!r} (asset_type={asset_type})')


def read_investments_csv(path: Path) -> list[tuple[str, str, str]]:
    'Return distinct (asset_type, symbol, unit) tuples from CSV. Skip when asset_type is not fetchable.'

    seen: dict[tuple[str, str], tuple[str, str, str]] = {}
    with path.open() as fh:
        header = fh.readline().strip().split('|')
        idx = {name: i for i, name in enumerate(header)}
        for raw in fh:
            row = raw.rstrip('\n').split('|')
            if len(row) != len(header):
                continue
            asset_type = row[idx['asset_type']].strip()
            if asset_type not in FETCHABLE_TYPES:
                continue
            symbol = row[idx['symbol']].strip()
            unit = row[idx['unit']].strip()
            seen.setdefault((asset_type, symbol), (asset_type, symbol, unit))
    return list(seen.values())


def load_existing_dataset(path: Path) -> dict:
    if not path.exists():
        return {}
    text = path.read_text()
    m = re.search(r'PRICES_DATA\s*=\s*(\{.*\})\s*;\s*$', text, flags=re.DOTALL)
    if not m:
        return {}
    return json.loads(m.group(1))


def fetch_range(ticker: str, start: dt.date, end: dt.date) -> list[dict]:
    'Fetch OHLC for [start, end] inclusive. Returns list of {d,o,h,l,c}.'

    if start > end:
        return []
    period1 = int(dt.datetime.combine(start, dt.time.min, dt.timezone.utc).timestamp())
    period2 = int(
        dt.datetime.combine(end + dt.timedelta(days=1), dt.time.min, dt.timezone.utc).timestamp()
    )
    params = {
        'period1': period1,
        'period2': period2,
        'interval': '1d',
        'events': 'div,splits',
        'includeAdjustedClose': 'true',
    }
    resp = curl_cffi.get(
        YAHOO_CHART_URL.format(ticker=ticker), params=params, impersonate='chrome'
    )
    pp.ppd({'msg': 'fetched data from yahoo', 'ticker': ticker, 'period_start': dt.datetime.fromtimestamp(period1).astimezone().isoformat(), 'period_end': dt.datetime.fromtimestamp(period2).astimezone().isoformat(), 'status_code': resp.status_code})
    resp.raise_for_status()
    payload = resp.json()
    chart = payload.get('chart') or {}
    if chart.get('error'):
        raise RuntimeError(f'yahoo error for {ticker}: {chart['error']}')
    results = chart.get('result') or []
    if not results:
        return []
    res = results[0]
    timestamps = res.get('timestamp') or []
    quote = (res.get('indicators', {}).get('quote') or [{}])[0]
    opens = quote.get('open') or []
    highs = quote.get('high') or []
    lows = quote.get('low') or []
    closes = quote.get('close') or []
    gmtoffset = int(res.get('meta', {}).get('gmtoffset') or 0)
    out: list[dict] = []

    if len(timestamps) == 0:
        pp.ppd({'msg': 'yahoo returned no timestamps', 'ticker': ticker, 'payload': payload}, style='fruity')
        return []

    with pbar.PBar(total=len(timestamps)) as bar:
        for i, ts in enumerate(timestamps):
            o, h, l, c = (
                opens[i] if i < len(opens) else None,
                highs[i] if i < len(highs) else None,
                lows[i] if i < len(lows) else None,
                closes[i] if i < len(closes) else None,
            )
            if None in (o, h, l, c):
                continue
            date_str = dt.datetime.fromtimestamp(ts + gmtoffset, tz=dt.timezone.utc).date().isoformat()
            out.append(
                {
                    'd': date_str,
                    'o': round(float(o), 4),
                    'h': round(float(h), 4),
                    'l': round(float(l), 4),
                    'c': round(float(c), 4),
                }
            )
            bar.update(1)
    return out


def update_symbol(existing: dict, asset_type: str, symbol: str, unit: str, today: dt.date) -> dict:
    mapping = resolve_mapping(symbol, asset_type, unit)
    prior = existing.get(symbol)

    if prior and prior.get('ohlc'):
        last = dt.date.fromisoformat(prior['last_fetch_date'])
        start = last + dt.timedelta(days=1)
        new_candles = fetch_range(mapping.source_ticker, start, today)
        seen_dates = {c['d'] for c in prior['ohlc']}
        merged = list(prior['ohlc'])
        for c in new_candles:
            if c['d'] not in seen_dates:
                merged.append(c)
                seen_dates.add(c['d'])
        merged.sort(key=lambda c: c['d'])
        new_last = merged[-1]['d'] if merged else prior['last_fetch_date']
        return {
            'asset_type': asset_type,
            'source_ticker': mapping.source_ticker,
            'conversion': {
                'multiplier': mapping.multiplier,
                'denominator': mapping.denominator,
            },
            'unit': mapping.unit,
            'last_fetch_date': new_last,
            'ohlc': merged,
        }

    # First-time fetch: 5y back-fill.
    start = today - dt.timedelta(days=HISTORY_YEARS * 365 + 2)
    candles = fetch_range(mapping.source_ticker, start, today)
    if not candles:
        raise RuntimeError(
            f'upstream returned no data for {symbol} ({mapping.source_ticker}); '
            f'refusing to add empty series'
        )
    return {
        'asset_type': asset_type,
        'source_ticker': mapping.source_ticker,
        'conversion': {
            'multiplier': mapping.multiplier,
            'denominator': mapping.denominator,
        },
        'unit': mapping.unit,
        'last_fetch_date': candles[-1]['d'],
        'ohlc': candles,
    }


def write_atomic(dataset: dict) -> None:
    csv_text = CSV_PATH.read_text()
    payload = (
        'window.PRICES_DATA = ' + json.dumps(dataset, separators=(',', ':')) + ';\n'
        'window.INVESTMENTS_CSV = ' + json.dumps(csv_text) + ';\n'
    )
    TMP_PATH.write_text(payload)
    os.replace(TMP_PATH, OUT_PATH)


def main() -> int:
    today = dt.date.today()
    existing = load_existing_dataset(OUT_PATH)
    existing_symbols: dict = existing.get('symbols', {}) if existing else {}

    requested = read_investments_csv(CSV_PATH)
    if not requested:
        # print('no fetchable symbols in investments.csv', file=sys.stderr)
        pp.ppd({'msg': 'no fetchable symbols in investments.csv'}, style='fruity')
        raise Exception('no fetchable symbols in investments.csv')

    updated_symbols = dict(existing_symbols)
    for asset_type, symbol, unit in requested:
        try:
            updated_symbols[symbol] = update_symbol(existing_symbols, asset_type, symbol, unit, today)
        except Exception as e:
            pp.ppd({'msg': 'error updating symbol', 'symbol': symbol, 'error': {'class': e.__class__.__name__, 'msg': str(e)}}, style='fruity')
            raise e

    dataset = {
        'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'currency': 'AUD',
        'symbols': updated_symbols,
    }
    write_atomic(dataset)
    total_candles = sum(len(s['ohlc']) for s in updated_symbols.values())
    pp.ppd({'msg': 'finished writing', 'ofpath': OUT_PATH, 'num_symbols': len(updated_symbols), 'total_candles': total_candles})


if __name__ == '__main__':
    main()
