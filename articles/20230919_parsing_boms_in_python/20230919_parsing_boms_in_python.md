# 20230919 Parsing BOMs in Python

```python
 import csv, codecs

 CODECS = {
     "utf-8-sig": [codecs.BOM_UTF8],
     "utf-16": [
        codecs.BOM_UTF16,
        codecs.BOM_UTF16_BE,
        codecs.BOM_UTF16_LE,
    ]
 }

 def detect_encoding(fpath):
     with open(fpath, 'rb') as istream:
         data = istream.read(3)
         for encoding, boms in CODECS.items():
             if any(data.startswith(bom) for bom in boms):
                 return encoding
     return 'utf-8'

 def read(fpath):
     with open(fpath, 'r', encoding=detect_encoding(fpath)) as istream:
         yield from csv.DictReader(istream)
```

```python
 # run here
 for i, row in enumerate(read('test.csv')):
     print(i, row)
     if i > 10:
         break
```
