---
title: "LG Display awakening in X11"
date: 2026-10-18
blurb: "Solving an annoying issue where linux didn't detect when my display had woken up after sleeping"
tags: []
unlisted: false
---

# 20261018 LG Display awakening in X11

```shell
sudo cp .scratch/master/monitor-fix/g85sb-edid.bin /etc/X11/g85sb-edid.bin
sudo cp /etc/X11/xorg.conf /etc/X11/xorg.conf.bak
sudo cp .scratch/master/monitor-fix/xorg.conf.new /etc/X11/xorg.conf
```
