# 20240411 Join and Coalesce in Pyspark

- [20240411 Join and Coalesce in Pyspark](#20240411-join-and-coalesce-in-pyspark)
  - [Scenario](#scenario)
  - [Example Dataframes](#example-dataframes)
  - [The Solution](#the-solution)
  - [The Results](#the-results)

## Scenario

I had the need to join two dataframes in pyspark and coalesce in order to capture all possible values for each ID key.

> I noticed an answer on stack overflow https://stackoverflow.com/a/68534723/4431563, and was inspired to see if I could improve it slightly.

- both of the dataframes have the same key column
- records may exist in either dataframe, or both
- the dataframes have some shared columns, and some unique columns
- the shared columns may have null values in either dataframe

## Example Dataframes

***df1:***

| id|var1.2|var2|var4|
|---|----|----|----|
|  1|null|  aa|  yy|
|  2|   a|null|  yy|
|  3|   b|  11|  yy|
|  4|   h|  22|  yy|

***df2:***

| id|var1.2|var2|var3|
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
  - and shared columns `var1.2` and `var2`

```python
df1 =  spark.createDataFrame([
        (1,  None, 'aa', 'yy'),
        (2 , 'a',  None, 'yy'),
        (3 , 'b',  None, 'yy'),
        (4 , 'h',  None, 'yy'),
    ],
    'id int, `var1.2` string, var2 string, var4 string',
)

df2 =  spark.createDataFrame([
        (1,  'f', 'Ba',  'xx'),
        (2 , 'a', 'bb',  'xx'),
        (3 , 'b',  None, 'xx'),
    ],
    'id int, `var1.2` string, var2 string, var3 string',
)
```

The solution itself is fairly straightforward

- do a full outer join, so that all records are included
- just select the columns that are unique to each dataframe
- for the shared columns, use `F.coalesce` to select the non-null value

> *Note: when coalescing, the order of the dataframes matters. Values from df1 will be used if they has a non-null value, which will ignore any valid values in df2*   
> ***Ensure that your "preferred" dataframe is df1!***

```python
def join_coalesce(how, key_columns, df1, df2):
    shared_columns = (set(df1.columns) & set(df2.columns)) - set(key_columns)
    unique_columns = (set(df1.columns) ^ set(df2.columns)) - set(key_columns)
    print(f'{key_columns=}', f'{shared_columns=}', f'{unique_columns=}', sep='\n')

    return (
        df1
        .join(df2, on=key_columns, how=how)
        .select(
            *[F.col(f'`{c}`') for c in sorted(key_columns)],
            *[F.coalesce(df1[f'`{i}`'], df2[f'`{i}`']).alias(i) for i in sorted(shared_columns)],
            *[F.col(f'`{c}`') for c in sorted(unique_columns)],
        )
    )

result = join_coalesce('outer', ['id'], df1, df2)
result.show()
```

## The Results

Behold!

```python
key_columns=['id']
shared_columns={'var2', 'var1.2'}
unique_columns={'var3', 'var4'}
```

| id|var1.2|var2|var3|var4|
|---|----|----|----|----|
|  1|   f|  aa|  xx|  yy|
|  2|   a|  bb|  xx|  yy|
|  3|   b|null|  xx|  yy|
|  4|   h|null|null|  yy|
