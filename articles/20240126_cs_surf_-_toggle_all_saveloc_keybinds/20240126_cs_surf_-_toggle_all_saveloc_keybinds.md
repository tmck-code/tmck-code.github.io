# 20240126 CS Surf - Toggle all saveloc keybinds

- [20240126 CS Surf - Toggle all saveloc keybinds](#20240126-cs-surf---toggle-all-saveloc-keybinds)
  - [What is saveloc?](#what-is-saveloc)
  - [How do I use saveloc?](#how-do-i-use-saveloc)
  - [What do I need?](#what-do-i-need)
  - [The CFGs](#the-cfgs)
  - [The Magic](#the-magic)

## What is saveloc?

When surfing in CS Source/GO/2, the `saveloc` keybinds are essential!

This is the name given to the checkpoint system used to
- add a checkpoint as you progress through the map
- teleport to that checkpoint at any time to practice the map

If you've ever played Trackmania (or any other racing game), you'll be familiar with such a system - if you drive off the track or wipe out, then you can teleport to a previous checkpoint and then try the same section again.

In surf this system is the same, except that you have to manually add the checkpoint yourself while surfing! (_TODO: do an article in future to implement something automatic?_)

There is a quick YouTube video that you can check outt for an overview of this plugin if you are new to it: 

[![Pro Surfers do THIS to Learn 1000+ Maps](https://img.youtube.com/vi/0LbAwLliMvk/0.jpg)](https://www.youtube.com/watch?v=0LbAwLliMvk)

---

## How do I use saveloc?

I use saveloc the way that most people do, and only use a handful of keybinds

1. save checkpoint
2. teleport to checkpoint
3. switch to previous checkpoint
4. switch to next checkpoint

In addition, I'm also including 2 other teleport commands in this article which are

5. teleport to beginning of map
6. teleport to beginning of stage

## What do I need?

I find that I need to be very careful whenever I use `saveloc`, as accidentally hitting the "teleport to checkpoint" keybind means that you enter "practice" mode and your map time can no longer be counted as a leaderboard entry.

- This means that accidentally hitting the `sm_tele` keybind is catastrophic.
- Putting this keybind on a hard-to-reach key means that it would be much harder to actually practice as each teleport is harder to press

So, my aim is

> *Toggle all teleport & saveloc keybinds on and off with a single key*   
> i.e.
> - saveloc is enabled by default   
> - press '.' to **disable** all teleport/saveloc keybinds ("leaderboard mode")   
> - press '.' to **re-enable** all teleport/saveloc keybinds ("practice mode")

---

## The CFGs

My solution relies on "one weird trick™", but first it's easier to build up the required cfg files for the enable/disable actions.

- `surf_savelog.cfg`
    ```javascript
    // This file contains all SurfTimer saveloc keybinds

    // set teleport location
    bind q "sm_saveloc";
    // teleport to location
    bind e "sm_tele";
    bind mwheeldown "sm_tele";

    // change to previous/next teleport location
    bind 1 "sm_teleprev";
    bind p "sm_teleprev";
    bind 2 "sm_telenext";

    say "saveloc enabled";
    ```

- `surf_nosaveloc.cfg`
    ```javascript
    // This file _disables_ all SurfTimer saveloc keybinds

    // set teleport location
    unbind q;
    // teleport to location
    unbind e;
    unbind mwheeldown;

    // change to previous/next teleport location
    unbind 1;
    unbind p;
    unbind 2;

    say "saveloc disabled";
    ```

## The Magic

The `alias` command points one cfg command -> another one.

Using this, we can create 2+ state commands, and then one main command that is "aliased" to one of the state commands by default, e.g.

- one command to "bind all saveloc keybinds"
- one command to "unbind all the saveloc keybinds"
- and a third that "toggles" the binds, that initially defaults to "bind"

*The bind/unbind commands need to include a 2nd command that assigns a new alias!* This allows the bind/unbind commands to be called, and then set the shared alias to point to the other command.

This can be used for a simple toggle like I've done here, but can also be used to increment/cycle through 2+ states (e.g. I've used this to iterate through `host_timescale` on my home server in 5 stages).

After creating the two CFG files above^, I have the following section in my `surf_online.cfg` config file

```javascript
// saveloc (bind by default)
exec surf_saveloc.cfg;
alias savelocon "exec surf_saveloc.cfg; alias saveloc savelocoff";
alias savelocoff "exec surf_nosaveloc.cfg; alias saveloc savelocon";
alias saveloc "savelocoff";
// toggle saveloc
bind . "saveloc";
```

This means that I can press the `.` button toggle between practice/attempt modes easily! Hope you enjoy :)