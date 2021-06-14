# Parsing Dirty CSVs #1: The current standard

> **This post presents a few of the issues** that can be found when reading and writing the CSV format. For more problems with the data itself, and for strategies on how to code resilient writers/parsers, stay tuned for the **next posts** in this series.

CSV is a _**serde**_ format (SERialisation-DEserialisation) that can store tabular data from a database as a file, and be used to ship data between two processes. As such, writing and parsing the data correctly is critical.

## Specification

In the real world, the term CSV usually describes a tabular data set, where columns and rows are delimited by certain characters.

> The official specification for the CSV format is detailed here:
> <https://tools.ietf.org/html/rfc4180>

You might not have heard of the official format specification for CSVs - it isn't often referenced when discussing CSVs, and it is generally only adhered to _some_ of the time.

Some examples of out-of-date rules include:

* `CRLF` - `\r\n` line endings as standard row separator

This has the effect of causing some parsers to incorrectly recognise and strip the newlines characters, and also adds an extra redundant character to every single line in your CSV.

> This is just one example, overall the CSV specification is much looser than others like JSON, XML.

**Why does this matter?**

The flexibility of the CSV format means that it can be slow to process. The standard results in many different formats which becomes hard to detect or parse quickly, _especially_ if the exact format used is unkown.

If your datasets are very large, and if you have to process them repeatedly, then regular CSVs just aren't a good fit.

## "Garbage in, garbage out"

CSVs can hold many kinds of data, but no matter the nature of the content there are some common needs in order to make working with your datasets as easy and effective as possible.

Essentially, any data that you aquire and work with, no matter what the industry or area of study, must be _**clean**_. This means that every cell matches its expected format and there are no CSV errors. If this is done, then any time the data is parsed by another process or person it's going to be as fast, painless and easy to debug as possible.

---

## The operations

I'm going to go through the two most common CSV operations, reading and writing entire files, and how I've managed to optimise them.

### Parsing

My main problem with CSV parsers is that they're made to work on pristine data sets. If you have any inconsistencies or illegal formatting in your dataset, you're going to run into trouble quickly. Parsing the file will cease entirely and you'll be left to comb through the violations until the whole file matches your expected format.

Let's examine the standard library parsers that we are provided in `Ruby` and `Python`.

> Both of these examples were as trivial as possible: simply open a file and then use the standard library CSV parsers to parse each row and column of the CSV.

_**Ruby:**_

```ruby
require 'csv'

CSV.foreach('test.csv') do |row|
  p row
end
```

_**Python:**_

```python
import csv

with open('test.csv') as istream:
    reader = csv.reader(istream, delimiter='|', quotechar='"')
    for row in reader:
        print(row)
```

## Throwing spanners

Life without spice is no fun, and CSV parsers provide it in spades by tripping over or halting after seeing something unexpected.

### Random, un-matched double quotes

Let the fun begin! Let's insert an errant double quote in the line after the header.

```csv
Full Name|Left or Right handed|Age|Gender|Date of Birth
Dustin Lewis"|l|45|M|02-04-1995
```

What happens when we run the same code again?

_**Ruby:**_

```text
/Users/tmck-code/.rvm/rubies/ruby-2.4.1/lib/ruby/2.4.1/csv.rb:1928:in `block in shift':
Unclosed quoted field on line 2. (CSV::MalformedCSVError)
```

_**Python:**_

```text
Traceback (most recent call last):
File "csv_reader.py", line 8, in <module>
for row in csvstream: _csv.Error: field larger than field limit (131072)
```

In **Ruby**, the parser expects only pairs of quotes on each line. After it's read the whole line, it will throw an error.

In **Python**, the parser accepts newlines inside double quotes - think something like storing a paragraph in a single cell. This means that it reads up until the next double quote before continuing to parse the line. After it's read the next double quote (or in our case, hit the end of the file), it will throw an error.

Continuing on!

### More spanners

It happened once, why wouldn't it happen again? Let's insert another random quote into our document.

```csv
Full Name|Left or Right handed|Age|Gender|Date of Birth
Dustin Lewis"|l|45|M|02-04-1995
Anthony Mason|^|64|"M"|19-12-1974
Darren Little|u|8|Female|11-10-1992
Anthony Ashley|4|79|M|10-11-1974
Sharon Jacobs|I|41|Female|15-12-1999
Leslie Mann|s|65|F|24-08-1975
Katherine Mack|c|73|F|03-01-2013
Kimberly Romero|D|33|M|22-07-1989
Katrina Shepard|p|64|F|09-03-1996
```

Our `Ruby` code in its current form will fail to parse past the second line, so we'll just look at `Python`. I modified the code to print out the number of cells in the row, and the row itself (`print(len(row), row)`)

```text
5 ['Full Name', 'Left or Right handed', 'Age', 'Gender', 'Date of Birth']
5 ['Dustin Lewis"', 'l', '45', 'M', '02-04-1995']
4 ['Anthony Mason', '^', '64', 'M|19-12-1974\nDarren Little|u|8|Female|11-10-1992\nAnthony Ashley|4|79|M|10-11-1974\nSharon Jacobs|I|41|Female|15-12-1999\nLeslie Mann|s|65|F|24-08-1975\nKatherine Mack|c|73|F|03-01-2013\nKimberly Romero|D|33|M|22-07-1989\nKatrina Shepard|p|64|F|09-03-1996\n']
```

The `Python` default configuration is clearly quite lax, as it failed to alert us to the incorrect number of columns within the row. Imagine if you were performing a computation or transformation on the column involved! This usually leads to two things:

1. Frustrating errors and crashes
2. Incorrect data & results

> There's also a 3rd interesting possibility. Python will keep reading the file
> into memory until it finds that next double quote or the end of the file. If
> your data set is truly massive, and it's a long way to the next double quote,
> you run the risk of using up a lot your memory.

___

## Tweaking the options

_**"But the options, the parameters!"**_ Let us delve a little deeper and see the breadth of the situation. Ruby provides a raft of options for parsing:

```ruby
[:col_sep, :row_sep, :quote_char, :field_size_limit, :converters,
:headers, :return_headers, :headers, :converters, :skip_blanks,
:skip_lines, :skip_lines, :liberal_parsing]
```

There are the standard options, and a few interesting entries.

* `field_size_limit` will stop that memory issue mentioned earlier.
* `converters` is useful, you can use built-in functions or your own lambdas to perform basic operations on each cell. This is assuming however that you've managed to parse the whole line though, which is where the real problem lies.
* `skip_lines` might look exciting if you're wanting to skip across bad lines, but it only applies to empty lines.
* `liberal_parsing` (via the docs): "When set to a true value, CSV will attempt to parse input not conformant with RFC 4180, such as double quotes in unquoted fields."

`liberal_parsing: true` looks like our magic option in Ruby in order to be able to at least parse the line in some form, let's give it a go.

```ruby
require 'csv'

CSV.foreach('test.csv', col_sep: '|', liberal_parsing: true) do |row|
  p [row.length, row]
end```

Using the same file as before:

```csv
Full Name|Left or Right handed|Age|Gender|Date of Birth
Dustin Lewis"|l|45|M|02-04-1995 Anthony Mason|^|64|"M|19-12-1974
Darren Little|u|8|Female|11-10-1992
```

The result:

```text
[5, ["Full Name", "Left or Right handed", "Age", "Gender", "Date of Birth"]]
[5, ["Dustin Lewis\"", "l", "45", "M", "02-04-1995"]]
/Users/tomm/.rvm/rubies/ruby-2.4.1/lib/ruby/2.4.0/csv.rb:1928:in `block in shift': Unclosed quoted field on line 3. (CSV::MalformedCSVError)
```

> Sigh. Such is the life of a CSV parser.

It takes a little time, but you can eventually work out the _right combination_ of options and error rescues for your situation, with the standard parser in any language. I haven't yet come across a third-party library in ruby or python that offers anything more than the in-house one.

The frustrating thing about tweaking options is that they vary depending by situation and by the programming language that you use, and this can result in some surprising outputs if you're not prepared.

---

### Writing

_**Writing CSVs**_ will be tackled in more detail at the end of this series, as we slowly tie together all of the different pieces that are needed. For now, all you need to know is that the simpler the method used to write the CSV the easier it is to parse.

#### With newlines and delimiters in cells

This is bad juju, and anyone who's spent time unescaping multiply-escaped JSON strings knows that this can be horrifying territory.

_**Python:**_

```python
import csv

header = [
    'Full Name', 'Left or Right handed', 'Age', 'Gender', 'DOB'
]

data = [
  ['Dustin Lewis"', 'l', '45', 'M', '02-04-1995'],
  ['Anthony Mason', '$$', '64', '"M', '19-12-1974'],
  ['Darren, Little', 'u', '8', 'Female', '11-10-1992']
]

with open('output.csv', 'w') as ostream:
    writer = csv.writer(ostream, delimiter=',', quoting=csv.QUOTE_MINIMAL)
    writer.writerow(header)
    for row in data:
        writer.writerow(row)
```

This results are in:

```csv
Full Name,Left or Right handed,Age,Gender,DOB
"Dustin Lewis""",l,45,M,02-04-1995
Anthony Mason,$$,64,"""M",19-12-1974
"Darren Little",u,8,Female,11-10-1992
```

Woohoo! Thanks to python's [QUOTE_MINIMAL](https://docs.python.org/3/library/csv.html#csv.QUOTE_MINIMAL), only the fields that need to be quoted are actually quoted. This is a huge space-saver, and also simplifies any later data parsing.

_However_, reading `"Dustin Lewis"""` is a little off-putting, and it's easy to see how another person attempting to read or parse the data might even slurp up the whole field without noticing.

The line `"Dustin Lewis""",l,45,M,02-04-1995` itself does not contain any commas in the wrong places, but the `Python` configuration used in the example means that the field is quoted with double quotes, and the double quote itself is escaped by a double quote. Eek!

_**Ruby:**_

```ruby
require "csv"

header = [
  "Full Name", "Left or Right handed", "Age", "Gender", "DOB"
]

data = [
  ["Dustin Lewis\"", "l", "45", "M", "02-04-1995"],
  ["Anthony Mason", "$$", "64", "\"M", "19-12-1974"],
  ["Darren, Little", "u", "8", "Female", "11-10-1992"]
]

CSV.open("output", "wb") do |csv|
  csv << header
  data.each { |row| csv << row }
end
```

This results in:

```csv
Full Name,Left or Right handed,Age,Gender,DOB
"Dustin Lewis""",l,45,M,02-04-1995
Anthony Mason,$$,64,"""M",19-12-1974
"Darren, Little",u,8,Female,11-10-1992
```

`Python` and `Ruby` here produce an identical result that I think is a fair interpretation of the standard, and I was pleasantly surprised to find them so alike.

---

### Writing better

> **_Reading_ better** is going to be the subject of most of this series. Thankfully file writing is not as hard, and the basics are easy to implement in your own system.

Writing CSVs with special rules carries the very real risk of the data being parsed incorrectly by another party that you wish to share it with, or even later by yourself or a future member of your team.

There are 3 culprits of this mess - CSVs with cells that contain one or more of the following:

* escaped characters
* delimiter characters
* newline character

There are only *two* things needed to solve these problems

1. Ensure that no fields contain newlines
2. Ensure that no fields contain your delimiter

> _If you really need to read and write text data that contains newlines, I would highly advise using JSON or another format to transport this data._
> The strength of the CSV format lies in its compact storage footprint and fast read/write and parse/encode rates, but is limited to storing data that is only a **few bytes** in length.

#### The trouble with commas

CSVs delimiter is an incredibly common character in text _and_ number datasets, and it can cause unexpected headaches if proper quoting isn't used.

This can result in entire files having every cell quoted when only a few fields require it, which means a bigger storage overhead, and a bigger computation overhead when parsing.

```text
   2   bytes
x  2   quotes per field
x 60   fields per row
x 1mil rows
= 240,000,000 bytes
=     240,000 KB
=         240 MB
```

Holy smokes Batman! That's **240 MB** data that is potentially wasted.

#### PSV

The most practical solution to all of this that I've found is by using the `|` (pipe) character, hence "Pipe-Separated Value" files.

There's a caveat here that _you must ensure that your data does not contain a pipe character before writing_. In real-life scenarios I _rarely_ find it present in data, and I'm yet to find a circumstance where it couldn't be replaced or filtered out before writing. In any case, you may use the "quote minimal" style from above in the knowledge that you are protected against this scenario, but also that 99.9% of your CSV data is beautiful and minimal.

_**Python:**_

```python
import csv

header = [
    'Full Name', 'Left or Right handed', 'Age', 'Gender', 'DOB'
]

data = [
  ['Dustin Lewis"', 'l', '45', 'M', '02-04-1995'],
  ['Anthony Mason', '^', '64', '"M', '19-12-1974'],
  ['Darren, Little', 'u', '8', 'Female', '11-10-1992']
]

with open('output.csv', 'w') as ostream:
    writer = csv.writer(ostream, delimiter='|', quoting=csv.QUOTE_NONE, quotechar='')
    writer.writerow(header)
    for row in data:
        writer.writerow(row)
```

I happen to know that those options will produce the magical result:

```csv
Full Name|Left or Right handed|Age|Gender|DOB
Dustin Lewis"|l|45|M|02-04-1995
Anthony Mason|^|64|"M|19-12-1974
Darren, Little|u|8|Female|11-10-1992
```

Bam! Nothing is quoted (and doesn't need to be), and commas have no effect.

_**Ruby:**_

```ruby
require "csv"

header = [
  'Full Name', 'Left or Right handed', 'Age', 'Gender', 'DOB'
]

data = [
  ['Dustin Lewis"', 'l', '45', 'M', '02-04-1995'],
  ['Anthony Mason', '^', '64', '"M', '19-12-1974'],
  ['Darren, Little', 'u', '8', 'Female', '11-10-1992']
]

CSV.open("output.csv", "w", {col_sep: "|"}) do |csv|
  data.each { |row| csv << row }
end
```

In `Ruby` (2.6.2) I couldn't find any way to avoid the writer seeing a double quote and then both escaping it and quoting the field. This is a little bit annoying but not the end of the world.

```csv
"Dustin Lewis"""|l|45|M|02-04-1995
Anthony Mason|^|64|"""M"|19-12-1974
Darren, Little|u|8|Female|11-10-1992
```

---

## You made it!

We've made it to the end of our brief(?) foray into the world of parsing less-than-perfect CSV data, hopefully it has served as an adequate summary.

For those who are curious about or who are starting a carrer in programming or working with data, you need not be alarmed as this is not a cautionary tale. There _is_ a problem where not enough content around this is being made, but that should hopefully improve.

For those who work with data, I salute your efforts and hope that this has been helpful. The next post deals with another common problem, [character encoding](https://tmck-code.ghost.io/parsing-dirty-csvs-2-character-encoding/).

Peace
