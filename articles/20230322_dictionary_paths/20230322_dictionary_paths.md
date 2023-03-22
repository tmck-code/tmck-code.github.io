# 20230322 Dictionary Paths

Traversing through a nested/multi-layer data structure is commonplace when writing code that handles data, and is also a fun coding problem!

---

1. The first attempt

I find that its nice to start with a very simple solution that works, before thinking of other more difficult solutions

```python
def fetch(data: dict, path: tuple):
	current = data
	for k in path:
		current = current[k]
	return current
```

Let's create a dictionary, and then try to get a nested value

```python
In [2]: d = {'a': {'b': {'c': 'd', 'x': 'y'}}}

In [3]: fetch(d, ('a', 'b', 'x'))
Out[3]: 'y'
```

2. reduce!

```python
from functools import reduce

def fetch(data: dict, path: tuple):
    return reduce(lambda d, key: d.get(key), path, data)
```

However, this method doesn't perform so nicely when the provided path isn't 100% correct

```python
def fetch(data: dict, path: tuple):
    return reduce(lambda d, key: d.get(key) if isinstance(d, dict) else None, path, data)
```

Now our line is too long! We could extract out the value grabbing  to improve this

```python
def fetch(data: dict, path: tuple):
	def safe_fetch(obj, key):
		if isinstance(obj, dict):
			return obj.get(key)

	return reduce(lambda d, key: safe_fetch(d, key), path, data)
```

This method returns `None` if the path is incorrect, or if any element along the path was _not_ a dictionary 
```python
In [6]: fetch(d, ('z', 'b'))

In [7]: fetch(d, ('a', 'z'))

# Let's add some array brackets around the innermost dict
In [8]: d = {'a': {'b': [{'c': 'd', 'x': 'y'}]}}

In [9]: fetch(d, ('a', 'b', 'c'))
```

3. jq!

JQ is a great tool for manipulating or extracting JSON data on the command line, and it works in python too!

This allows us to make a path for any value, including support for lists/arrays, e.g.

> `.a.b[0].x

```python
In [1]: import jq

In [2]: d = {'a': {'b': [{'c': 'd', 'x': 'y'}]}}

In [3]: jq.compile('.a.b[0].x').input(d).first()
Out[3]: 'y'
```

4. Recursive

No article on nested dictionary traveral would be complete without a recursive implementation!

```python
def fetch(data, i, path):
    print(f'{path=}, {i=}, {data=}')

    if i == len(path):
	    return data
	elif isinstance(data, list)
		if not isinstance(path[i], int):
			raise KeyError(
				f'Key for nested list must be an int! '
				f'key: "{path[i]}, nested element: "{data}"'
			)
	elif isinstance(data, (dict, list)):
		return fetch(data[path[i]], i+1, path)
	else:
		raise ValueError(f'unable to recurse past "{path[i]}"')
```

Let's add some more robust error handling

- if a nested dictionary key doesn't exist
- if the supplied path is too long
- if a nested list index doesn't exist
- if a nested list key is not an integer

```python
def fetch(data, path, i=0, debug=False):
    if i == len(path):
        return data

    key = path[i]
    if debug:
        print(f'{path=}, {i=}, {key=}, {data=}')

    elif isinstance(data, list):
        if not isinstance(key, int):
            raise KeyError(
                f'Key for nested list must be an int! '
                f'key: "{key}, nested element: "{data}"'
            )
        elif key >= len(data):
            raise IndexError(f'list index out of range: {key=}, {path=}, {data=}')
        return fetch(data[key], path, i+1, debug)

    elif isinstance(data, dict):
        if key not in data:
            raise KeyError(f'nested key not found: {key=}, {path=}, {data=}')
        return fetch(data[key], path, i+1, debug)
    else:
        raise ValueError(f'unable to recurse past "{key}"')
```
