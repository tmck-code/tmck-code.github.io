# 20230704 Jupyter Cell Wrappers


```python
import IPython.core.events as events
```


```python
import json
import time

class VarWatcher(object):
    def __init__(self, ip):
        self.shell = ip
        self.timestamp = time.time()

    def pre_run_cell(self, info):
        'This runs before each cell'

        self.timestamp = time.time()
        print('time before run', self.timestamp)

    def _last_cell_id(self):
        last_key = None
        for cell_id, vs in self.shell.user_ns.items():
            if not cell_id.startswith('_i'):
                continue
            last_key = cell_id
        return last_key

    def post_run_cell(self, info):
        'This runs after each cell'

        duration = time.time() - self.timestamp
        print('time after run', time.time())
        info = {
            'execution_count': info.execution_count,
            'result': info.result,
            'duration': duration,
            'CONFIG': self.shell.user_ns.get('CONFIG', None),
            'cell': self._last_cell_id(),
            'cell_vars': self.shell.user_ns.get(self._last_cell_id()),
        }
        print(json.dumps(info, indent=2, default=str))

def load_ipython_extension(ip):
    vw = VarWatcher(ip)
    ip.events.register('pre_run_cell', vw.pre_run_cell)
    ip.events.register('post_run_cell', vw.post_run_cell)
```


```python
# register the event callbacks for the first time

load_ipython_extension(get_ipython())
```

    time after run 1689061674.859367
    {
      "execution_count": 3,
      "result": null,
      "duration": 0.00021696090698242188,
      "CONFIG": null,
      "cell": "_i3",
      "cell_vars": "# register the event callbacks for the first time\n\nload_ipython_extension(get_ipython())"
    }



```python
# a cell with a var

x=1
```

    time before run 1689061675.896075
    time after run 1689061675.896435
    {
      "execution_count": 4,
      "result": null,
      "duration": 0.00035881996154785156,
      "CONFIG": null,
      "cell": "_i4",
      "cell_vars": "# a cell with a var\n\nx=1"
    }



```python
# a cell with a var that's being watched by the callback

CONFIG = {'hello': 'WORLD'}
```

    time before run 1689061676.494325
    time after run 1689061676.49473
    {
      "execution_count": 5,
      "result": null,
      "duration": 0.00040411949157714844,
      "CONFIG": {
        "hello": "WORLD"
      },
      "cell": "_i5",
      "cell_vars": "# a cell with a var that's being watched by the callback\n\nCONFIG = {'hello': 'WORLD'}"
    }



```python

```
