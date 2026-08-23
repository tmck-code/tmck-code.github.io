---
title: "CS CFG tricks #1"
date: 2024-01-29
blurb: "[Counter-Strike] Execute multiple commands with a single keybind"
tags: [counter-strike]
---

# 20240129 CS CFG tricks #1

## Execute multiple commands with a single keybind

This article details (very briefly) how to trigger 1+ commands with a single keybind in Counter Strike (GO/2).

> Simply add a semicolon (`;`) between each of the commands that you'd like the keybind to execute

### Example 1

One of the most common uses I have found for this trick is to add a ***sound*** to a keybind action.

```json
// set teleport location
bind q "sm_saveloc; playvol buttons\blip1 0.5"
```
