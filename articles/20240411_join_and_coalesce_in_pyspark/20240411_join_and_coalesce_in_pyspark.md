# 20240411 Join and Coalesce in Pyspark

## Scenario

I had the need to join two dataframes in pyspark and coalesce in order to capture all possible values for each ID key.

- both of the dataframes have the same key column
- records may exist in either dataframe, or both
- the dataframes have some shared columns, and some unique columns
- the shared columns may have null values in either dataframe

## Example Dataframes

***df1:***

| id|var1|var2|var4|
|---|----|----|----|
|  1|null|  aa|  yy|
|  2|   a|null|  yy|
|  3|   b|  11|  yy|
|  4|   h|  22|  yy|

***df2:***

| id|var1|var2|var3|
|---|----|----|----|
|  1|   f|  Ba|  xx|
|  2|   a|  bb|  xx|
|  3|   b|null|  xx|

## The Solution

First, let's create some dataframes to work with. See my [pyspark-fu](../20230605_pyspark_fu/20230605_pyspark_fu.md) article for associated tips and tricks for local pyspark development.


- df1 has an extra column `var4`
- df2 has an extra column `var3`
- both dataframes
  - have the same key column `id`
  - and shared columns `var1` and `var2`

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

The solution itself is fairly straightforward

- do a full outer join, so that all records are included
- just select the columns that are unique to each dataframe
- for the shared columns, use `F.coalesce` to select the non-null value

> *Note: when coalescing, the order of the dataframes matters. Values from df1 will be used if they has a non-null value, which will ignore any valid values in df2*   
> ***Ensure that your "preferred" dataframe is df1!***

```python
def join_coalesce(key_columns, df1, df2):
    shared_cols = (set(df1.columns) & set(df2.columns)) - set(key_columns)
    unique_cols = (
        (set(df2.columns)-set(df1.columns)) | (set(df1.columns)-set(df2.columns))
    ) - set(key_columns)
    print(f'{shared_cols=}, {unique_cols=}. {set(df2.columns)=}')

    return (
        df1
        .join(df2, on=key_columns, how='full')
        .select(
            *[F.col(c) for c in key_columns],
            *[F.coalesce(df1[i], df2[i]).alias(i) for i in shared_cols],
            *[F.col(c) for c in unique_cols],
        )
    )

result = join_coalesce(['id'], df1, df2)
result.show()
```

Behold!

```python
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
