# Parsing Dirty CSVs #0: Introduction

> Part of my job involves parsing and cleaning CSV data, a challenge which I
> find quite satisfying. I've come to realise a few things about the state of
> CSVs and data sets in general, and have learnt a few interesting lessons.

The feature of CSV that I like the most is that it uses the minimal amount of space to store tabular data - the file contents are represented with the
absolute bare-minimum syntax and grammar.

If you were to compare an identical data set stored in JSON (or similar form), to a data set stored as a CSV, then you will always find that the CSV file is _much_ smaller.

This is awesome! However, the down-side is that the format of CSVs is not stricly defined, and this causes many interesting problems to arrive.

I work with big CSV sets (think 60GB+), which and so most of the thoughts and
lessons in this post are based around working with CSVs when optimisation and
strict data quality are key.

The commands in this series will be featured from both ruby and python. I could do more, but the problems/techniques demonstrated will be language-agnostic.

___

## The Series

As I have been writing this post I have slowly realised that it is a monster, and too large and dry for anyone to want to read in a sitting.

Instead, I'm going to release this in parts as I finish writing them, which will also hopefully make the whole piece more easily consumable.

1. [CSV: The current standard](https://tmck-code.ghost.io/parsing-dirty-csvs-1-the-current-standard/)
2. [CSV: Character encoding](https://tmck-code.ghost.io/parsing-dirty-csvs-2-character-encoding/)
3. CSV: Speed and Resilience
4. CSV: Writing
5. CSV: Putting the pieces together

Throughout the series I'm going to attempt to use more than one language, I happen to have chosen `Python` and `Ruby`.

It is important to note that the problems of dealing with CSVs are common to _all_ languages, not just a few. The examples and methodologies used with my two chosen languages will be applicable in most other languages. When testing the same situations with `Scala` and `Go`, I've encountered the same problems.

This series starts here with a couple of tenets of data processing.

___

## As fast and stable as possible

These are two golden hints that I have found to be invaluable when dealing with big data, making my life much easier and the data much cleaner.

1. **Your parser must be stable.** Your parser must be fault-tolerant, and skip past any junk lines in a CSV **without halting**.
    CSV is not JSON, in that we aren't required to parse the entire document all at once in order to read information from it.
    Read line-by-line, while anticipating errors and bad data, and your parser will be able to read everything in accepted format out of a file and do something with it.

2. **Throw offending data away.** When you work with a large amount of data, it is too time consuming to comb through every violation of some sort of formatting rule (e.g. investigating all non-UTF8 lines to interpret how they should be transformed).
   Skipping past any data that violates a formatting rule ASAP ensures that the dataset is easily parseable by any program ASAP, and if you process large datasets through a pipeline it should be your foremost concern.

* **Always keep backups of any raw files**, I mean 'throw away' here as 'skip when ingesting'.

> Your situation may be different - perhaps your datasets are smaller, or there
> is a rule that no data should be thrown away. In that case, feel free to
> substitute a "file write/log/whatever operation", wherever I mention skipping.
