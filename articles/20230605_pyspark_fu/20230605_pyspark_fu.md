# Pyspark Fu

- [Pyspark Fu](#pyspark-fu)
  - [1. Initialising the Spark Session](#1-initialising-the-spark-session)
  - [Avoid duplicate column names when joining](#avoid-duplicate-column-names-when-joining)

## 1. Initialising the Spark Session


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

    Setting default log level to "WARN".
    To adjust logging level use sc.setLogLevel(newLevel). For SparkR, use setLogLevel(newLevel).
    23/07/04 08:36:38 WARN NativeCodeLoader: Unable to load native-hadoop library for your platform... using builtin-java classes where applicable



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
    


## Avoid duplicate column names when joining


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

    +---+---------+---+-------+
    | id|     name| id|trainer|
    +---+---------+---+-------+
    |007|charizard|007|    ash|
    |123|  pikachu|123|    ash|
    |999|     evee|999|  chloe|
    +---+---------+---+-------+
    


This _seems_ fine initially, but spark blows up as soon as you try and use the 'id' column in an expression

This example will produce the error:

`[AMBIGUOUS_REFERENCE] Reference `id` is ambiguous, could be: [`id`, `id`].`


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


There are two techniques to mitigate this that I've found:

- using a different parameter for the `on` columns
- dataframe aliasing


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

    +---+---------+-------+
    | id|     name|trainer|
    +---+---------+-------+
    |007|charizard|    ash|
    |123|  pikachu|    ash|
    |999|     evee|  chloe|
    +---+---------+-------+
    
    +---+---------+-------+
    | id|     name|trainer|
    +---+---------+-------+
    |007|charizard|    ash|
    |123|  pikachu|    ash|
    |999|     evee|  chloe|
    +---+---------+-------+
    



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
    



```python

```
