# Parsing Dirty CSVs #2: Speed

When parsing "medium" or "big" data, speed is a primary concern next to stability. There are a few silver bullets, and a few fallacies when it comes to parsing CSVs quickly.

---

I was trying to decide between "Speed **vs** Reliability" or "Speed **_and_** reliability" for the title of this post, and decided that **and** seemed like a better fit.

Any well-designed parser takes both of these into consideration, acknowledging that a balanced compromise that suits your particular situation is always paramount. I've taken a middle-of-the-road approach here, with a parser that is fairly fast, and _as close to_ 100% reliable as is reasonable.

---

## Speed

Without further ado, here are some useful general tips:

1. Know the number of lines.
2. Don't bother chunking (unless you _know_ you need to).
3. Skip past bad data without halting.
4. Convert the file to a usable, clean form if you need to parse the dataset repeatedly.

---

### 1. Know the number of lines

**It is very helpful to know the number of lines (rows) in your dataset** (_before_ you parse it if possible).

If you don't already know this information, the time spent counting the number of lines with something like `wc -l` is probably worth it for the use that you get out of it.

If you know the number of lines in your set, then you can easily:

* set up progress bars
* split the file evenly into parts
* take a random sample of a certain proportion of the file
* use the total in any reporting/logging

_and many more!_

### 2. Don't bother chunking

**"Chunking" or splitting up the file will not help**

_...unless_ you are operating under the very special circumstance, with operations that can be run in parallel over your dataset.

**However**, splitting files takes time, and often any time saved by parallel processing is lost by counting the lines in the file, and splitting it up correctly, as each "chuck" of the file usually has to be written to disk before it can be used.

**Rejoining** the chunks can be complicated (how would you deal with multi-line cells?), and also time-consuming, as the join operation will usually need to write to disk yet again.

**If you are performing some sort of repeated operation in parallel, then splitting is for you!** In practise this is not usually the case, and you should most likely avoid this approach.

### 3. Skip past bad data

**Log out incorrect or badly formatted data into a file or elsewhere, don't let corrupt data slow you down!**

With the sheer volume of big data, a single piece of data is not worth saving and is not worth the time to clean properly, as the time spent on fixing these types of format errors can be considerable. This includes both character encoding errors _and_ CSV format issues.

### 4. Convert to usable, clean intermediate form

**If you are performing exploratory work or similar on the data, convert it to clean, usable CSV first.**

Consider saving several versions of the file as you work with it, e.g. the initial raw form, a UTF-8 compliant form, and a final CSV-compliant form that you can parse quickly and without concern.

---

## Reliability

Keeping all this in mind, we can now think about reliability.

There is a singular major downfall in every standard lib CSV parser in every language that I've tried yet (Ruby, Python, Scala, Go), in that **they will halt completely if an error is encountered**.

> It's not possible to tell CSV parsers "ignore that error and continue".
> Even though CSV is ideally a "newline-delimited/flat" structure, parsers treat the entire file as a single entity.

There is one golden rule to get around all this nonsense:

> **Instead of passing file or stream objects to our parser, you must feed in your file line-by-line.**

This means that if possible, we need to use a `function` or `module` in the language in question, rather than instantiating a single CSV parser object. This might not be possible depending on the language, but there is always a workaround.

Let's try this with our usual examples, Ruby & Python. First, we'll define the file we'll be using, it has several different errors in it.

Forgive me if the examples are not _exactly_ equivalent, the main concepts used are identical.

_For complete transparency, we'll write our file contents in each example. If you were to try and copy-paste this text from your browser, then various systems along the way (the browser, your OS, etc) will use the text as if it is 'UTF-8', so in order to properly reproduce everything, we'll write the file explicitly with a certain encoding in each example._

### Ruby - reliability

* Writing the file contents

```ruby
s = <<-EOF
Full Name|Left or Right handed|Age|Gender|Date of Birth
Dustin Lewis"|l|45|M|02-04-1995
Anthony Mason|^|64|"M"|19-12-1974
ångström|c|73|F|03-01-2013
Kimberly Romero|D|33|M|22-07-1989
EOF

File.open('ruby.csv', 'wb') do |ostream|
  ostream.puts(s.encode('ISO-8859-1'))
end
```

* Reading the file

```ruby
require 'csv'

def process_line(line)
  CSV.parse(line) do |row|
    p ['✓', row]
  end
rescue CSV::MalformedCSVError => e
  p ['!! skipping bad CSV line', line, e]
end

File.open('ruby.csv', 'rb') do |istream|
  istream.each do |line|
    begin
      process_line(line.encode('UTF-8'))
    rescue Encoding::UndefinedConversionError => e
      p ['!! skipping bad UTF-8 line', line, e]
    end
  end
end
```

```text
["✓", ["Full Name|Left or Right handed|Age|Gender|Date of Birth"]]
["!! skipping bad CSV line", "Dustin Lewis\"|l|45|M|02-04-1995\n", #<CSV::MalformedCSVError: Illegal quoting in line 1.>]
["!! skipping bad CSV line", "Anthony Mason|^|64|\"M\"|19-12-1974\n", #<CSV::MalformedCSVError: Illegal quoting in line 1.>]
["!! skipping bad UTF-8 line", "\xE5ngstr\xF6m|c|73|F|03-01-2013\n", #<Encoding::UndefinedConversionError: "\xE5" from ASCII-8BIT to UTF-8>]
["✓", ["Kimberly Romero|D|33|M|22-07-1989"]]
 => #<File:ruby.csv (closed)>
```

### Python - reliability

* Writing the file contents

```python
s = '''Full Name|Left or Right handed|Age|Gender|Date of Birth
Dustin Lewis"|l|45|M|02-04-1995
Anthony Mason|^|64|"M"|19-12-1974
ångström|c|73|F|03-01-2013
Kimberly Romero|D|33|M|22-07-1989
'''

with open('python.csv', 'wb') as ostream:
    ostream.write(s.encode('ISO-8859-1'))
```

* Reading the file

```python
import csv

def process_line(line):
    try:
        for row in csv.reader([data], delimiter='|', strict=True):
            print(row)
    except ValueError:
        print(f'!! skipping bad CSV line {line} {e}')

with open('python.csv', 'rb') as istream:
    for line in istream:
        try:
            data = line.decode('UTF-8')
        except ValueError:
            print(f'skipping bad line {line}')
        else:
            process_line(data)
```

```text
['Full Name', 'Left or Right handed', 'Age', 'Gender', 'Date of Birth']
['Dustin Lewis"', 'l', '45', 'M', '02-04-1995']
['Anthony Mason', '^', '64', 'M', '19-12-1974']
skipping bad line b'\xe5ngstr\xf6m|c|73|F|03-01-2013\n'
['Kimberly Romero', 'D', '33', 'M', '22-07-1989']
```

_If you are wondering why Ruby rejected lines with quotes and Python didn't, see part 1 of this series._

## Conclusion

As seen in the Python example above, sometimes there is no function or module available in the standard lib, and so I get around this by instantiating a new CSV reader object _per line_. This achieves the key concern of reliability, while sacrificing speed (it's around 2x as slow as using only one reader).

This is a prime example of the compromise that needs to be reached when designing data parsers

* Rewriting a CSV reader from scratch is a big task, it's possible to add only the features that you need, but you will forever be tasked with updating this code.
* Using the standard lib is _always_ the best choice, but this means that we have to ensure that we're using it in the way that best suits our needs.

### A caveat

All of these examples have been addressing the situation where the data being parsed is _unknown_, and _cannot be trusted to be parsed correctly_.

If you are in the position of dealing only with your own internal data, then this is not an issue! The next post in this series discusses how to _write_ CSVs in the most reliable and speedy manner, and ensures these techniques are not needed, allowing you to parse data with ease.

This also allows us all to _improve_ the state of CSV data in the world. CSVs are unfortunately born into a ill-defined set of possible accepted formats. The more strictly a format is defined, the less thinking the parser has to do! Look forward to the next installment.

Happy parsing!

