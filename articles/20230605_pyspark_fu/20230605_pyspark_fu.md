# 20230605 PySpark Fu

When working with PySpark, I often find myself needing to extra research to find solutions to
slightly-harder-than-usual problems. This is a collection of those solutions, and the journey.

- [20230605 PySpark Fu](#20230605-pyspark-fu)
  - [Instantiate spark](#instantiate-spark)
  - [Convert DataFrame to List of Dicts](#convert-dataframe-to-list-of-dicts)
  - [Pretty-print JSON schema](#pretty-print-json-schema)
  - [Problem 2: Filter nested key/values](#problem-2-filter-nested-keyvalues)
  - [Solution 1](#solution-1)
  - [Solution 2](#solution-2)
    - [Downside](#downside)
  - [Problem 3: Avoid duplicate column names when joining](#problem-3-avoid-duplicate-column-names-when-joining)
  - [Problem 4: Filter nested key/values and preserve type](#problem-4-filter-nested-keyvalues-and-preserve-type)

---

## Instantiate spark

> In particular, for testing small code snippets, I find it's good to use `local[1]` which forces Spark to run using only 1 core.
> This makes the results faster and minimises the impact on other processes.

```python
from pyspark.conf import SparkConf
from pyspark.sql import SparkSession

CONF = {
    "spark.ui.showConsoleProgress": "false",
    "spark.ui.dagGraph.retainedRootRDDs":                "1",
    "spark.ui.retainedJobs":                             "1",
    "spark.ui.retainedStages":                           "1",
    "spark.ui.retainedTasks":                            "1",
    "spark.sql.ui.retainedExecutions":                   "1",
    "spark.worker.ui.retainedExecutors":                 "1",
    "spark.worker.ui.retainedDrivers":                   "1",
    "spark.executor.instances":                          "1",
}

def spark_session() -> SparkSession:
    '''
    - set a bunch of spark config variables that help lighten the load
    - local[1] locks the spark runtime to a single core
    - silence noisy warning logs
    '''
    conf = SparkConf().setAll([(k,v) for k,v in CONF.items()])

    sc = SparkSession.builder.master("local[1]").config(conf=conf).getOrCreate()
    sc.sparkContext.setLogLevel("ERROR")
    return sc
```

## Convert DataFrame to List of Dicts

```python
from pyspark.sql import DataFrame
from typing import List, Dict

def collect_to_dict(df: DataFrame) -> List[Dict]:
    return [r.asDict(recursive=True) for r in df.collect()]
```

## Pretty-print JSON schema

```python
import json

def pretty_print_schema(df: DataFrame) -> None:
    print(json.dumps(json.loads(df.schema.json()), indent=2))
```

## Problem 2: Filter nested key/values

```python
spark = spark_session()

df = spark.createDataFrame([
    {'a': 'b', 'n': {'a': 'b'}},
    {'a': 'c', 'n': {'z': 'x', 'y': 'b'}},
    {'a': 'd', 'n': {'o': None, 't': 'a', '2': 3}}
])

df.show(truncate=False)

# +---+---------------------------+
# |a  |n                          |
# +---+---------------------------+
# |b  |{a -> b}                   |
# |c  |{y -> b, z -> x}           |
# |d  |{2 -> 3, t -> a, o -> null}|
# +---+---------------------------+
```

Given the dataframe above, we need to filter out all key/value pairs with null values, resulting in:

```python
# +---+-----------------+
# |a  |n                |
# +---+-----------------+
# |b  |{a -> b}         |
# |c  |{y -> b, z -> x} |
# |d  |{2 -> 3, t -> a} |
# +---+-----------------+
```

## Solution 1

1. Explode the map into a key/value pair
2. Filter out the key/value pairs with null values
3. Group by the key and aggregate the values into a map
4. Join the aggregated map back to the original dataframe

```python
result = df.select(
    'a',
    F.explode(F.col('n'))
).filter(
    F.col('value').isNotNull()
).select(
    'a',
    F.create_map(F.col('key'), F.col('value')).alias('n')
).groupBy(
    'a'
).agg(
    F.collect_list('n').alias('maps')
).select(
    'a',
     F.expr('aggregate(slice(maps, 2, size(maps)), maps[0], (acc, element) -> map_concat(acc, element))').alias('n')
)

result.show(truncate=False)

# +---+----------------+
# |a  |n               |
# +---+----------------+
# |d  |{2 -> 3, t -> a}|
# |c  |{y -> b, z -> x}|
# |b  |{a -> b}        |
# +---+----------------+
```

## Solution 2

1. Use `map_filter`

```python
 #Filter out the key-value pairs with null values
result = df.withColumn("n", F.map_filter(F.col("n"), lambda k, v: v.isNotNull()))

result.show(truncate=False)

# +---+----------------+
# |a  |n               |
# +---+----------------+
# |b  |{a -> b}        |
# |c  |{y -> b, z -> x}|
# |d  |{2 -> 3, t -> a}|
# +---+----------------+
```

### Downside

There is a major downside to using the `map` schema type - all values become string and the original types are not preserved (see `2 -> 3` in the example above).

We can check this by writing the result to a file and then reading that

```python
In [22]: result.write.mode('overwrite').json('s')

In [23]: cat s/part-00000-4ad54ea5-8b3d-4573-b27c-87195c22b232-c000.json
{"a":"b","n":{"a":"b"}}
{"a":"c","n":{"y":"b","z":"x"}}
{"a":"d","n":{"2":"3","t":"a"}} # <-- Note the type of 3 is now string
```

## Problem 3: Avoid duplicate column names when joining



## Problem 4: Filter nested key/values and preserve type

What if we read this dataframe as a JSON file, rather than specifying a dict, does that change anything?

```python

In [7]: cat articles/20230605_pyspark_fu/f.json
{"a": "b", "n": {"a": "b"}}
{"a": "c", "n": {"z": "x", "y": "b"}}
{"a": "d", "n": {"o": None, "t": "a", "2": 3}}

In [8]: df = spark.read.json('articles/20230605_pyspark_fu/f.json')

In [9]: df.show(truncate=False)
+----------------------------------------------+---+---------------+
|_corrupt_record                               |a  |n              |
+----------------------------------------------+---+---------------+
|null                                          |b  |{b, null, null}|
|null                                          |c  |{null, b, x}   |
|{"a": "d", "n": {"o": None, "t": "a", "2": 3}}|d  |null           |
+----------------------------------------------+---+---------------+

In [17]: pretty_print_schema(df)
{
  "fields": [
    { "metadata": {}, "name": "_corrupt_record", "nullable": true, "type": "string" },
    { "metadata": {}, "name": "a", "nullable": true, "type": "string" },
    {
      "metadata": {}, "name": "n", "nullable": true,
      "type": {
        "fields": [
          { "metadata": {}, "name": "a", "nullable": true, "type": "string" },
          { "metadata": {}, "name": "y", "nullable": true, "type": "string" },
          { "metadata": {}, "name": "z", "nullable": true, "type": "string" }
        ],
        "type": "struct"
      }
    }
  ],
  "type": "struct"
}
```

This schema isn't good! Spark has incorrectly guessed the keys and has corrupted the data.

> _For this problem, we can assume that we will know beforehand all of the nested field names and types_


```python
schema = {
  "fields": [
    { "metadata": {}, "name": "_corrupt_record", "nullable": True, "type": "string" },
    { "metadata": {}, "name": "a", "nullable": True, "type": "string" },
    {
      "metadata": {}, "name": "n", "nullable": True,
      "type": {
        "fields": [
          { "metadata": {}, "name": "a", "nullable": True, "type": "string" },
          { "metadata": {}, "name": "y", "nullable": True, "type": "string" },
          { "metadata": {}, "name": "z", "nullable": True, "type": "string" },
          { "metadata": {}, "name": "o", "nullable": True, "type": "string" },
          { "metadata": {}, "name": "t", "nullable": True, "type": "string" },
          { "metadata": {}, "name": "2", "nullable": True, "type": "long" }
        ],
        "type": "struct"
      }
    }
  ],
  "type": "struct"
}

import pyspark.sql.types as T

In [55]: df = spark.read.json('articles/20230605_pyspark_fu/f.json', schema=T.StructType.fromJson(schema))
    ...: df.show(truncate=False)
# +---------------+---+---------------------------------+
# |_corrupt_record|a  |n                                |
# +---------------+---+---------------------------------+
# |null           |b  |{b, null, null, null, null, null}|
# |null           |c  |{null, b, x, null, null, null}   |
# |null           |d  |{null, null, null, null, a, 3}   |
# +---------------+---+---------------------------------+
```

cols = [ "a", "y", "z", "o", "t", "2", ]