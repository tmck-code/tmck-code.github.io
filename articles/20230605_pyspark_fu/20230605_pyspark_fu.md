# Pyspark Fu

Greetings fellow traveller! This is a loose collection of some of the useful Pyspark "pro-tips" that 
I've found while working with the framework, hopefully it will help someone else with these common headaches

---

- [Pyspark Fu](#pyspark-fu)
  - [2. Create a simple dataframe for debugging](#2-create-a-simple-dataframe-for-debugging)
  - [3. Joins](#3-joins)
    - [3.1. Avoid duplicate column names](#31-avoid-duplicate-column-names)
    - [3.1.2 Join using list of names](#312-join-using-list-of-names)
    - [3.1.3 Dataframe aliasing is a bit weird](#313-dataframe-aliasing-is-a-bit-weird)
  - [4. Default empty DataFrames](#4-default-empty-dataframes)

---


```python
from pyspark.conf import SparkConf
from pyspark.sql import SparkSession

CONF = {
    'spark.ui.showConsoleProgress':       'false',
    'spark.ui.dagGraph.retainedRootRDDs': '1',
    'spark.ui.retainedJobs':              '1',
    'spark.ui.retainedStages':            '1',
    'spark.ui.retainedTasks':             '1',
    'spark.sql.ui.retainedExecutions':    '1',
    'spark.worker.ui.retainedExecutors':  '1',
    'spark.worker.ui.retainedDrivers':    '1',
    'spark.executor.instances':           '1',
}

def spark_session() -> SparkSession:
    '''
    - set a bunch of spark config variables that help lighten the load
    - local[1] locks the spark runtime to a single core
    - silence noisy warning logs
    '''
    conf = SparkConf().setAll([(k,v) for k,v in CONF.items()])

    sc = SparkSession.builder.master('local[1]').config(conf=conf).getOrCreate()
    sc.sparkContext.setLogLevel('ERROR')
    return sc
```


```python
spark = spark_session()
```

## 2. Create a simple dataframe for debugging


- The pyspark official docs don't often "create" the dataframe that the code examples refer to


```python
df = spark.createDataFrame([
    {'a': 'b', 'n': {'a': 'b'}},
    {'a': 'c', 'n': {'z': 'x', 'y': 'b'}},
    {'a': 'd', 'n': {'o': None, 't': 'a', '2': 3}}
])

df.show(truncate=False)
```

    +---+---------------------------+
    |a  |n                          |
    +---+---------------------------+
    |b  |{a -> b}                   |
    |c  |{y -> b, z -> x}           |
    |d  |{2 -> 3, t -> a, o -> null}|
    +---+---------------------------+
    


## 3. Joins

### 3.1. Avoid duplicate column names


```python
# Let's construct two dataframes that share a column to join on

df1 = spark.createDataFrame([
    {'id': '123', 'name': 'pikachu'},
    {'id': '999', 'name': 'evee'},
    {'id': '007', 'name': 'charizard'},
])
df2 = spark.createDataFrame([
    {'id': '123', 'name': 'ash'},
    {'id': '999', 'name': 'chloe'},
    {'id': '007', 'name': 'ash'},
])

df1.show(), df2.show()
```

    +---+---------+
    | id|     name|
    +---+---------+
    |123|  pikachu|
    |999|     evee|
    |007|charizard|
    +---+---------+
    
    +---+-----+
    | id| name|
    +---+-----+
    |123|  ash|
    |999|chloe|
    |007|  ash|
    +---+-----+
    





    (None, None)




```python
# Now, lets join them together into a combined pokemon-and-trainer table
joined = df1.join(
    df2,
    on=df1['id'] == df2['id'],
    how='inner',
)
joined.show()
```

    +---+---------+---+-----+
    | id|     name| id| name|
    +---+---------+---+-----+
    |007|charizard|007|  ash|
    |123|  pikachu|123|  ash|
    |999|     evee|999|chloe|
    +---+---------+---+-----+
    


This _seems_ fine initially, but spark blows up as soon as you try and use the 'id' column in an expression

This example will produce the error:

`[AMBIGUOUS_REFERENCE] Reference `id` is ambiguous, could be: [`id`, `id`].`

This can be particularly annoying as the error will only appear when you attempt to use the columns, but will go undetected if this doesn't happen


```python
import pyspark.sql.utils
from pyspark.sql import DataFrame
from typing import List

def try_select(df: DataFrame, cols: List[str]):
    try:
        df.select(*cols).show()

    except pyspark.sql.utils.AnalysisException as e:
        print('select failed!', e)
```


```python
try_select(joined, ['id', 'name', 'trainer'])
```

    select failed! [AMBIGUOUS_REFERENCE] Reference `id` is ambiguous, could be: [`id`, `id`].


The solution: use a different parameter for the `on` columns

### 3.1.2 Join using list of names


```python
joined = df1.join(
    df2,
    on=['id'],
    how='inner',
)
joined.show()

# Now let's try that same select again
try_select(joined, ['id', 'name', 'trainer'])
```

    +---+---------+-----+
    | id|     name| name|
    +---+---------+-----+
    |007|charizard|  ash|
    |123|  pikachu|  ash|
    |999|     evee|chloe|
    +---+---------+-----+
    
    select failed! [AMBIGUOUS_REFERENCE] Reference `name` is ambiguous, could be: [`name`, `name`].


### 3.1.3 Dataframe aliasing is a bit weird


```python
df1.alias('pokemon').select('*').show()
```

    +---+---------+
    | id|     name|
    +---+---------+
    |123|  pikachu|
    |999|     evee|
    |007|charizard|
    +---+---------+
    



```python
import pyspark.sql.functions as F

joined = df1.alias('pokemon').join(
    df2.alias('trainers'),
    on=F.col('pokemon.id') == F.col('trainers.id'),
    how='inner',
)
joined.show()
joined.columns
```

    +---+---------+---+-----+
    | id|     name| id| name|
    +---+---------+---+-----+
    |007|charizard|007|  ash|
    |123|  pikachu|123|  ash|
    |999|     evee|999|chloe|
    +---+---------+---+-----+
    





    ['id', 'name', 'id', 'name']



Now, our error message is much better, as it contains the dataframe aliases identifying which table the duplicate column name is from


```python
try_select(joined, ['id'])
```

    select failed! [AMBIGUOUS_REFERENCE] Reference `id` is ambiguous, could be: [`pokemon`.`id`, `trainers`.`id`].


Confusingly, using `Dataframe.columns` does not show the aliases, but they are usable when selecting


```python
print(joined.columns)

try_select(joined, ['pokemon.id'])
```

    ['id', 'name', 'id', 'name']
    +---+
    | id|
    +---+
    |007|
    |123|
    |999|
    +---+
    


## 4. Default empty DataFrames

Sometimes it's handy to be able to instantiate an "empty" dataframe in the case that a file/some source data is missing


```python
# This will result in an AnalysisException complaining that 
# the file did not exist
from pyspark.errors.exceptions.captured import AnalysisException

try:
    spark.read.json('optional_source.json')
except AnalysisException as e:
    print(e)
```

    [PATH_NOT_FOUND] Path does not exist: file:/home/jovyan/work/articles/20230605_pyspark_fu/optional_source.json.


We can mitigate this by catching the exception, and creating a dataframe that matches the schema, but has 0 rows.

This ensures that any queries on the dataframe will still work, as all the columns will exist with the correct type.

_**This requires that we know the schema of the optional file**_


The easiest way to create a schema is usually to create a single-line file containing a valid line that matches the expected schema. Then, read that file into a dataframe and capture the schema for re-use (read: copy/paste)


```python
import json

with open('not_there.json', 'w') as ostream:
    ostream.write(json.dumps({
        'id': 123, 'key': 'yolo', 'attrs': {'a': 'b'}
    }))

spark.read.json('not_there.json').schema.json()
```




    '{"fields":[{"metadata":{},"name":"attrs","nullable":true,"type":{"fields":[{"metadata":{},"name":"a","nullable":true,"type":"string"}],"type":"struct"}},{"metadata":{},"name":"id","nullable":true,"type":"long"},{"metadata":{},"name":"key","nullable":true,"type":"string"}],"type":"struct"}'



I've never found a way (using StringIO or similar) to achieve this without writing a file - if you find a way then let me know!

Let's bundle this up into a method that tidies up after itself:


```python
import json
import os

def guess_schema(row: dict, tmp_fpath: str = 'tmp.json') -> dict:
    with open(tmp_fpath, 'w') as ostream:
        ostream.write(json.dumps({
            'id': 123, 'key': 'yolo', 'attrs': {'a': 'b'}
        }))    
    schema = json.loads(spark.read.json('not_there.json').schema.json())
    os.remove(tmp_fpath)

    return schema
```


```python
schema = guess_schema(
    {'id': 123, 'key': 'yolo', 'attrs': {'a': 'b'}}
)
print(json.dumps(schema, indent=2))
```

    {
      "fields": [
        {
          "metadata": {},
          "name": "attrs",
          "nullable": true,
          "type": {
            "fields": [
              {
                "metadata": {},
                "name": "a",
                "nullable": true,
                "type": "string"
              }
            ],
            "type": "struct"
          }
        },
        {
          "metadata": {},
          "name": "id",
          "nullable": true,
          "type": "long"
        },
        {
          "metadata": {},
          "name": "key",
          "nullable": true,
          "type": "string"
        }
      ],
      "type": "struct"
    }


As you can see from this quick demo, it isn't quick to craft pyspark schemas from hand! In my experience it's prone to much human error and frustrating debugging, especially as schemas can grow large very quickly!

Now, we can tie this into the method to safely load/create a dataframe


```python
from pyspark.errors.exceptions.captured import AnalysisException
import pyspark.sql.types as T

def safe_load(fpath: str, schema: dict):
    try:
        return spark.read.json(fpath)
    except AnalysisException as e:
        print(e)
        return spark.createDataFrame([], schema=T.StructType.fromJson(schema))
```

> Side note: the method to convert a dict to a StructType (schema) is confusingly named `fromJson` despite the fact that the method accepts a dict, not a JSON string


```python
df = safe_load('not_there.json', schema)
```


```python
df.show()
```

    +-----+---+----+
    |attrs| id| key|
    +-----+---+----+
    |  {b}|123|yolo|
    +-----+---+----+



After the initial generation, the schema can be stored in a file and loaded or just defined directly in the code, rather than "guessed" every time


```python

```
