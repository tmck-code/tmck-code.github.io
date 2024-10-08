# 20240829 Using JQ with style

> Note: this article is intended for people that already love JQ!

*Did you know* that you can configure the colours of jq's output? This is a great way to make your output more readable in a way that you find visually appealing.

_This is detailed in the official docs [here](https://jqlang.github.io/jq/manual/#colors)_

There are only 2 things to know!

## 1. The ENV var

The `JQ_COLORS` ENV var is used to configure the colours. The default jq style is expressed as:

```shell
JQ_COLORS="0;90:0;37:0;37:0;37:0;32:1;37:1;37:1;34".
```

Using an ENV var means that configuring this in your shell rc files is easy, and doesn't slow anything down.

The ENV var contains a colon-separated list of ANSI colour codes, in the following order:

- color for null
- color for false
- color for true
- color for numbers
- color for strings
- color for arrays
- color for objects
- color for object keys

## 2. The colours

<table>
  <tr>
    <th>Part 1 - Style</th>
    <th>Part 2 - Colour</th>
  </tr>
  <tr>
    <td style='vertical-align: top'>
      <table>
        <tr><th>value</th><th>style</th></tr>
        <tr><td>1</td><td>bright</td></tr>
        <tr><td>2</td><td>dim</td></tr>
        <tr><td>4</td><td>underscore</td></tr>
        <tr><td>5</td><td>blink</td></tr>
        <tr><td>7</td><td>reverse</td></tr>
        <tr><td>8</td><td>hidden</td></tr>
      </table>
    </td>
    <td style='vertical-align: top'>
      <table>
        <tr><th>value</th><th>color</th></tr>
        <tr><td>30</td><td>black</td></tr>
        <tr><td>31</td><td>red</td></tr>
        <tr><td>32</td><td>green</td></tr>
        <tr><td>33</td><td>yellow</td></tr>
        <tr><td>34</td><td>blue</td></tr>
        <tr><td>35</td><td>magenta</td></tr>
        <tr><td>36</td><td>cyan</td></tr>
        <tr><td>37</td><td>white</td></tr>
      </table>
    </td>
  </tr>
</table>

## Examples

Now that we have the required pieces, we can create some different themes!

In order to make this process easier, I like to organise all of the options into named variables so that it's easier to experiment.

(For my shell, this lives in my `.bash_aliases`)

```python
_JQ_REGULAR=0
_JQ_BRIGHT=1
_JQ_DIM=2
_JQ_UNDERSCORE=4
_JQ_BLINK=5
_JQ_REVERSE=7
_JQ_HIDDEN=8

_JQ_BLACK=30
_JQ_RED=31
_JQ_GREEN=32
_JQ_YELLOW=33
_JQ_BLUE=34
_JQ_MAGENTA=35
_JQ_CYAN=36
_JQ_WHITE=37

JQ_NULL="$_JQ_DIM;$_JQ_YELLOW"
JQ_TRUE="$_JQ_DIM;$_JQ_YELLOW"
JQ_FALSE="$_JQ_DIM;$_JQ_YELLOW"
JQ_NUMBERS="$_JQ_REGULAR;$_JQ_CYAN"
JQ_STRINGS="$_JQ_REGULAR;$_JQ_WHITE"
JQ_ARRAYS="$_JQ_REGULAR;$_JQ_MAGENTA"
JQ_OBJECTS="$_JQ_BRIGHT;$_JQ_RED"
JQ_OBJECT_KEYS="$_JQ_BRIGHT;$_JQ_YELLOW"

export JQ_COLORS="${JQ_NULL}:${JQ_FALSE}:${JQ_TRUE}:${JQ_NUMBERS}:${JQ_STRINGS}:${JQ_ARRAYS}:${JQ_OBJECTS}:${JQ_OBJECT_KEYS}"
```

<table>
<tr>
  <td>
   <img src="/articles/20240829_using_jq_with_style/image.png" alt="theme-default">
  </td>
  <td>
  default
  </td>
</tr>
<tr>
  <td>
    <img src="/articles/20240829_using_jq_with_style/image-1.png" alt="theme-1">
  </td>
  <td>
    <i>This theme is generally balanced, with a focus on everything that is not a string value</i>
    <pre lang="python">
JQ_NULL="$_JQ_UNDERSCORE;$_JQ_WHITE"
JQ_TRUE="$_JQ_BRIGHT;$_JQ_GREEN"
JQ_FALSE="$_JQ_BRIGHT;$_JQ_RED"
JQ_NUMBERS="$_JQ_REGULAR;$_JQ_CYAN"
JQ_STRINGS="$_JQ_REGULAR;$_JQ_WHITE"
JQ_ARRAYS="$_JQ_REGULAR;$_JQ_BLUE"
JQ_OBJECTS="$_JQ_BRIGHT;$_JQ_RED"
JQ_OBJECT_KEYS="$_JQ_BRIGHT;$_JQ_YELLOW"
  </pre>
  </td>
</tr>
<tr>
  <td>
    <img src="/articles/20240829_using_jq_with_style/image-2.png" alt="theme-2">
  </td>
  <td>
    <i>Another balanced theme, this time highlighting string values a little more, and keys a little less</i>
    <pre lang="python">
JQ_NULL="$_JQ_UNDERSCORE;$_JQ_WHITE"
JQ_TRUE="$_JQ_BRIGHT;$_JQ_YELLOW"
JQ_FALSE="$_JQ_BRIGHT;$_JQ_RED"
JQ_NUMBERS="$_JQ_REGULAR;$_JQ_CYAN"
JQ_STRINGS="$_JQ_REGULAR;$_JQ_YELLOW"
JQ_ARRAYS="$_JQ_REGULAR;$_JQ_BLUE"
JQ_OBJECTS="$_JQ_BRIGHT;$_JQ_MAGENTA"
JQ_OBJECT_KEYS="$_JQ_REGULAR;$_JQ_GREEN"
    </pre>
  </td>
</tr>
<tr>
  <td>
    <img src="/articles/20240829_using_jq_with_style/image-3.png" alt="theme-3">
  </td>
  <td>
    <i>This theme has a strong focus on clearly displaying "string keys", and the open/close braces of objects</i>
    <pre language="python"><code>
JQ_NULL="$_JQ_BRIGHT;$_JQ_MAGENTA"
JQ_TRUE="$_JQ_REGULAR;$_JQ_GREEN"
JQ_FALSE="$_JQ_REGULAR;$_JQ_RED"
JQ_NUMBERS="$_JQ_REGULAR;$_JQ_CYAN"
JQ_STRINGS="$_JQ_REGULAR;$_JQ_WHITE"
JQ_ARRAYS="$_JQ_REGULAR;$_JQ_BLUE"
JQ_OBJECTS="$_JQ_BRIGHT;$_JQ_WHITE"
JQ_OBJECT_KEYS="$_JQ_BRIGHT;$_JQ_YELLOW"
    </code></pre>
  </td>
</tr>
<tr>
  <td>
    <img src="/articles/20240829_using_jq_with_style/image-4.png" alt="theme-4">
  </td>
  <td>
    <i>This theme is designed to be helpful when when searching for keys and null values</i>
    <pre lang="python">
JQ_NULL="$_JQ_REVERSE;$_JQ_RED"
JQ_TRUE="$_JQ_DIM;$_JQ_GREEN"
JQ_FALSE="$_JQ_DIM;$_JQ_RED"
JQ_NUMBERS="$_JQ_UNDERSCORE;$_JQ_CYAN"
JQ_STRINGS="$_JQ_DIM;$_JQ_WHITE"
JQ_ARRAYS="$_JQ_REGULAR;$_JQ_BLUE"
JQ_OBJECTS="$_JQ_BRIGHT;$_JQ_WHITE"
JQ_OBJECT_KEYS="$_JQ_REVERSE;$_JQ_GREEN"
    </pre>
  </td>
</tr>
</table>
