#!/usr/bin/env python3

import sys
from dataclasses import dataclass
from datetime import datetime
from fractions import Fraction
from glob import glob
from pathlib import Path
from typing import Iterator, Literal, NamedTuple

import bs4
import curl_cffi
import duckdb
import gzip
from asv.asv import ASVWriter
from laser_prynter import pp

url = 'https://www.perthmint.com/invest/information-for-investors/metal-prices/'
DB_PATH = 'perthmint_prices.duckdb'

Units = Literal['gram', 'ounce']

class PriceRow(NamedTuple):
    unit: Units
    quantity: float
    sell_price_aud: float
    buy_price_aud: float

@dataclass
class PriceTable:
    '''
    {
      "title": "Gold minted bars - The Perth Mint (99.99%)",
      "table": [
        {"Australian Dollar": "1 gram", "Perth Mint Sells": "$244.57", "Perth Mint Buys": "$198.05"},
        {"Australian Dollar": "5 gram", "Perth Mint Sells": "$1,099.24", "Perth Mint Buys": "$996.46"}
      ]
    }
    '''
    title: str
    table: list[PriceRow]

    @classmethod
    def from_list(cls, title: str, rows: dict[str, str]) -> 'PriceTable':
        price_rows = []
        for row in rows:
            try:
                quantity, unit = row['Australian Dollar'].split()
                quantity = float(Fraction(quantity))
                sell_price_aud = float(row['Perth Mint Sells'].replace('$', '').replace(',', '').replace('From ', ''))
                buy_price_aud = float(row['Perth Mint Buys'].replace('$', '').replace(',', ''))
                price_rows.append(PriceRow(unit=unit, quantity=quantity, sell_price_aud=sell_price_aud, buy_price_aud=buy_price_aud))
            except Exception as e:
                # pp.ppd({'error': str(e), 'row': row}, indent=2, file=sys.stderr)
                continue

        return cls(title=title, table=price_rows)


def collect_tables(soup: bs4.BeautifulSoup) -> Iterator[PriceTable]:
    for t in soup.find_all('div', {'class': ['table__tbody', 'table__tbody--with-header']}):
        titleA = t.find_previous('a', {'class': 'accordion-title'})
        title = titleA.getText(strip=True).replace('\u2013', '-') if titleA else ''
        if title == 'Invest' or 'other mints' in title or 'jewellery' in title:
            continue

        headerSpans = t.find('div', {'class': ['table__row', 'table__row--header']})
        header = []
        for cell in headerSpans.find_all('span'):
            header.append(cell.getText(strip=True))

        rows = []
        for rowDiv in t.find_all('div', {'role': 'row'}):
            row = []
            for cell in rowDiv.find_all('span', {'role': 'cell'}):
                row.append(cell.getText(strip=True))
            if row:
                rows.append(dict(zip(header, row)))
        # pp.ppd({'title': title, 'table': rows}, indent=2)
        yield PriceTable.from_list(title, rows)

def _iter_rows(tables: list[PriceTable]) -> Iterator[tuple[str, str, float, float, float]]:
    for table in tables:
        for row in table.table:
            yield (table.title, row.unit, row.quantity, row.sell_price_aud, row.buy_price_aud)

ASV_HEADER = ['ts', 'title', 'unit', 'quantity', 'sell_price', 'buy_price', 'currency']

def write_to_asv_gz(fetched_at: datetime, tables: list[PriceTable]) -> None:
    fpath = f'perthmint_prices_{fetched_at.strftime("%Y%m%dT%H%M%S")}.asv.gz'
    with gzip.open(fpath, 'wt') as stream:
        writer = ASVWriter(stream)
        writer.write_row(ASV_HEADER)
        for title, unit, quantity, sell_price, buy_price in _iter_rows(tables):
            writer.write_row([fetched_at.isoformat(), title, unit, str(quantity), str(sell_price), str(buy_price), 'AUD'])


def write_to_db(fetched_at: datetime, tables: list[PriceTable]) -> None:
    with duckdb.connect(DB_PATH) as con:
        con.execute('''
            CREATE TABLE IF NOT EXISTS perthmint_prices (
                ts         TIMESTAMPTZ,
                title      VARCHAR,
                unit       VARCHAR,
                quantity   DOUBLE,
                sell_price DOUBLE,
                buy_price  DOUBLE,
                currency   VARCHAR GENERATED ALWAYS AS ('AUD') VIRTUAL,
                PRIMARY KEY (ts, title, unit, quantity)
            )
        ''')
        con.executemany(
            'INSERT INTO perthmint_prices VALUES (?, ?, ?, ?, ?, ?)',
            ((fetched_at, *row) for row in _iter_rows(tables))
        )


def fetch_prices():
    fpaths = glob('perthmint_prices_*.html')
    if fpaths:
        fpath = max(fpaths)
        stem = Path(fpath).stem  # perthmint_prices_20260505T225044
        fetched_at = datetime.strptime(stem[17:], '%Y%m%dT%H%M%S').astimezone()
        with open(fpath, 'r') as f:
            soup = bs4.BeautifulSoup(f.read(), 'html.parser')
    else:
        fetched_at = datetime.now().astimezone()
        response = curl_cffi.get(url, impersonate='chrome')
        # pp.ppd({'url': url, 'status_code': response.status_code})
        response.raise_for_status()

        soup = bs4.BeautifulSoup(response.text, 'html.parser')
        with open(f'perthmint_prices_{fetched_at.strftime("%Y%m%dT%H%M%S")}.html', 'w') as f:
            f.write(soup.prettify())

    tables = list(collect_tables(soup))
    for table in tables:
        for row in table.table:
            pp.ppd({'title': table.title} | row._asdict())

    write_to_asv_gz(fetched_at, tables)
    write_to_db(fetched_at, tables)

if __name__ == '__main__':
    fetch_prices()
