# 20220610 awscli / boto3 snippets

## Get all logs from a cloudwatch log stream

> Includes full pagination support, so that you actually fetch all of the logs

```python
#!/usr/bin/env python3

'Consumes all logs from a cloudwatch log stream'

import json
import sys
from datetime import datetime
from itertools import count

import boto3

client = boto3.client('logs')

logGroupName = sys.argv[1]
logStreamName = sys.argv[2]
output = sys.argv[3]

time_start = datetime.now()

total = 0
page_args = {}
with open(output, 'w', encoding='utf-8') as ostream:
    for i in count():
        response = client.get_log_events(
            **{
                'logGroupName': logGroupName,
                'logStreamName': logStreamName,
                'startFromHead': True,
            },
            **page_args
        )
        ostream.write('\n'.join([json.dumps(event) for event in response['events']]))
        total += len(response['events'])

        page_args = {'nextToken': response['nextForwardToken']}
        print(json.dumps(
            {'duration': str(datetime.now()-time_start), 'total': total, 'next_page': page_args}
        ))

        if response['nextForwardToken'] == page_args.get('nextToken', ''):
            break

print('- Finished')
```
