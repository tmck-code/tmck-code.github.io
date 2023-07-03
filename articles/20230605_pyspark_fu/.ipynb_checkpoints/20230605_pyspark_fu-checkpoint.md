# 20230605 PySpark Fu

When working with PySpark, I often find myself needing to extra research to find solutions to
slightly-harder-than-usual problems. This is a collection of those solutions, and the journey.

- [20230605 PySpark Fu](#20230605-pyspark-fu)
  - [Instantiate spark](#instantiate-spark)
  - [Convert DataFrame to List of Dicts](#convert-dataframe-to-list-of-dicts)
  - [Problem 2: Filter nested key/values](#problem-2-filter-nested-keyvalues)

---

## Instantiate spark

> In particular, for testing small code snippets, I find it's good to use `local[1]` which forces Spark to run using only 1 core.
> This makes the results faster and minimises the impact on other processes.

```python
from pyspark.sql import SparkSession

def spark_session() -> SparkSession:
    # local[1] locks the spark runtime to a single core
    return SparkSession.builder.master("local[1]").getOrCreate()
```

## Convert DataFrame to List of Dicts

```python
from pyspark.sql import DataFrame
from typing import List, Dict

def collect_to_dict(df: DataFrame) -> List[Dict]:
    return [r.asDict(recursive=True) for r in df.collect()]
```

## Problem 2: Filter nested key/values

```python
from test.helper import spark_session
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

```python
df2 = df.select(
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
     F.expr('aggregate(slice(maps, 2, size(maps)), maps[0], (acc, element) -> map_concat(acc, cast(element, int)))').alias('n')
)
```

```python
import pyspark.sql.functions as F
df = spark.createDataFrame([{'a': 'b', 'n': {'a': 'b'}}, {'a': 'c', 'n': {'z': 'x'}}, {'a': 'd', 'n': {'o': None, 't': 'a', '4': 3}}])

 #Filter out the key-value pairs with null values
filtered_df = df.withColumn("n", F.map_filter(F.col("n"), lambda k, v: v.isNotNull()))

df.display()
filtered_df.display()
```

```python
In [91]: df.show(truncate=False)
+---+-----------+
|a  |n          |
+---+-----------+
|b  |{a -> b}   |
|c  |{z -> x}   |
|d  |{o -> null, t -> a}|
+---+-----------+


In [92]: df_desired.show(truncate=False)
+---+--------+
|a  |n       |
+---+--------+
|b  |{a -> b}|
|c  |{z -> x}|
|d  |{t -> a}|
+---+--------+

# e.g. write a function with the following interface or similar
#
In [93]: assert my_filter_func(df, primary='a', struct='n') == df_desired
```