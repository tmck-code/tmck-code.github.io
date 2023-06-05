# 20220511 Bash Practices

- [20220511 Bash Practices](#20220511-bash-practices)
  - [1. Halting execution after an error](#1-halting-execution-after-an-error)
    - [Normal behaviour](#normal-behaviour)
  - [Using set & pipefail](#using-set--pipefail)
    - [2. Checking variables](#2-checking-variables)
    - [3. Without printing](#3-without-printing)

---

## 1. Halting execution after an error

> Note: `echo $?` gives you the exit status of the previous command. 0 == success, 1 == failure.

```bash
set -euxo pipefail
```

### Normal behaviour

```bash
 ☯ cat test.sh
ls 1
echo "finished"
```

```bash
 ☯ bash test.sh ; echo $?
ls: cannot access '1': No such file or directory
finished
0
```

## Using set & pipefail

```bash
 ☯ cat test.sh
set -euxo pipefail
ls 1
echo "finished"
```

```bash
 ☯ ~/d/tmck-code.github.io bash test.sh ; echo $?
+ ls 1
ls: cannot access '1': No such file or directory
```

---

### 2. Checking variables

```bash
 ☯ ~ cat test.sh
set -euxo pipefail
echo "${1}"
echo "finished"
```

```bash
 ☯ ~ bash test.sh ; echo $?
test.sh: line 2: 1: unbound variable
1
```

To get more control over unbound variables, we can give the variable a default empty value, and then do an explicit check to see if the variable is empty

```bash
 ☯ ~ cat test.sh
set -euxo pipefail
[ -z "${1:-}" ] && echo "\$1 must be given!" && exit 1
echo "finished"
```

```bash
 ☯ ~ bash test.sh ; echo $?
+ '[' -z '' ']'
+ echo '$1 must be given!'
$1 must be given!
+ exit 1
1
```

### 3. Without printing

You might want to suppress the debug output, for brevity or to protect secret credentials from being logged.

You can either

1. omit the `x` character
2. or toggle with
   1. `set -x` to enable debug printing
   2. `set +x` to disable debug printing

```bash
 ☯ ~ cat test.sh
set -euxo pipefail
set +x
echo "without debug"
set -x

[ -z "${1:-}" ] && echo "\$1 must be given!" && exit 1
echo "finished"
```

```bash
 ☯ ~ bash test.sh ; echo $?
+ set +x
without debug
+ '[' -z '' ']'
+ echo '$1 must be given!'
$1 must be given!
+ exit 1
1
```
