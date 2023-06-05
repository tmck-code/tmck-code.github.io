# 20230605 PySpark Fu

```python
from test.helper import spark_session
spark = spark_session()

df = spark.createDataFrame([{'a': 'b', 'n': {'a': 'b'}}, {'a': 'c', 'n': {'z': 'x'}}, {'a': 'd', 'n': {'o': None, 't': 'a'}}])
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