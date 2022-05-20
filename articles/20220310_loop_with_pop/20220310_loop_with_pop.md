# 20220310 File Loop Tricks

Sometimes, when looping, we need to do something special with the first iteration.
Usually this would be implemented as an if statement in the loop.

E.g. Using CSV DictReader to read header, and then rows

```python
In [3]: cat test.csv
a|b|c
1|2|3
hello|world|!

In [1]: import csv, json

In [2]: with open("test.csv") as ostream:
   ...:     r = csv.DictReader(ostream, delimiter='|', fieldnames=next(ostream).strip().split('|'))
   ...:     for row in r:
   ...:         print(json.dumps(row, indent=2))
   ...: 
{
  "a": "1",
  "b": "2",
  "c": "3"
}
{
  "a": "hello",
  "b": "world",
  "c": "!"
}
```