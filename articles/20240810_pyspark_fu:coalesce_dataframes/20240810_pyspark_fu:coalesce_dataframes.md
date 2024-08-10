# 20240810 Pyspark Fu: Coalesce Dataframes

> _I submitted this to Stack Overflow as an answer earlier this year (2024): https://stackoverflow.com/a/78309072/4431563_


I was inspired by the accepted answer and have a variation that includes any unique columns from either dataframe. It uses the .select() method only, instead of .withColumn().

Test setup:

```python
df1 =  spark.createDataFrame([
        (1,  None, 'aa', 'yy'),
        (2 , 'a',  None, 'yy'),
        (3 , 'b',  None, 'yy'),
        (4 , 'h',  None, 'yy'),
    ],
    'id int, var1 string, var2 string, var4 string',
)

df2 =  spark.createDataFrame([
        (1,  'f', 'Ba',  'xx'),
        (2 , 'a', 'bb',  'xx'),
        (3 , 'b',  None, 'xx'),
    ],
    'id int, var1 string, var2 string, var3 string',
)
```

The solution:

```python
def join_coalesce(how, key_columns, df1, df2):
    shared_columns = (set(df1.columns) & set(df2.columns)) - set(key_columns)
    unique_columns = (set(df1.columns) ^ set(df2.columns)) - set(key_columns)
    print(f'{key_columns=}, {shared_columns=}, {unique_columns=}')

    return (
        df1
        .join(df2, on=key_columns, how=how)
        .select(
            *[F.col(c) for c in key_columns],
            *[F.coalesce(df1[i], df2[i]).alias(i) for i in shared_columns],
            *[F.col(c) for c in unique_columns],
        )
    )

result = join_coalesce('outer', ['id'], df1, df2)
result.show()
```

The result:

```text
shared_cols={'var1', 'var2'}, unique_cols={'var3', 'var4'}. set(df2.columns)={'var3', 'var1', 'id', 'var2'}

+---+----+----+----+----+
| id|var1|var2|var3|var4|
+---+----+----+----+----+
|  1|   f|  aa|  xx|  yy|
|  2|   a|  bb|  xx|  yy|
|  3|   b|null|  xx|  yy|
|  4|   h|null|null|  yy|
+---+----+----+----+----+
```