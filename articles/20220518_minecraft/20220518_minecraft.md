# 20220518 Minecraft

This article contains some handy tips and tricks around running Minecraft clients and servers, particularly in Linux

## Locations

```shell
$HOME/.minecraft/shaderpacks/1.18.2/
$HOME/.minecraft/mods/--
```

## Mods & Shaders

There isn't a way to fully automate the download of mods & shaders, as
[curseforge.com](curseforge.com) the site that normally hosts the files doesn't
host files at static URLS.

One bit of advice would be - for each major version of the minecraft client that
you use, download all of the jars and store them in a "backup" location that you
can use later if needed.

### Recommendations - Mods

These links will trigger the "latest" download for each tool

- [Fabric Loader](https://maven.fabricmc.net/net/fabricmc/fabric-installer/0.10.2/fabric-installer-0.10.2.jar) (used to load mods)
- [OptiFabric](https://www.curseforge.com/minecraft/mc-mods/optifabric/download) (allows you to run OptiFine & Fabric together)
- [Litematica](https://www.curseforge.com/minecraft/mc-mods/litematifca/download) (creates/loads schematic overlays)
    - [MaLiLib](https://www.curseforge.com/minecraft/mc-mods/malilib/download) (dependency of Litematica)
- [MiniHUD](https://www.curseforge.com/minecraft/mc-mods/minihud/download) (customise the F3 screen)
- [Tweakeroo](https://www.curseforge.com/minecraft/mc-mods/tweakeroo/download) (item placement)
- [Starlight](https://www.curseforge.com/minecraft/mc-mods/starlight/download) (light engine optimisations)

### Recommendations - Shaders

- [Sildur's Vibrant shaders](https://www.curseforge.com/minecraft/customization/sildurs-vibrant-shaders/download)
- [Sildur's Enhanced Default](https://www.curseforge.com/minecraft/customization/sildurs-enhanced-default/download)
- [BSL Shaders](https://www.curseforge.com/minecraft/customization/bsl-shaders/download)

## Java

### Linux

1. Download the openjdk jre

    ```shell
    # debian-based
    ☯ ~ sudo apt install default-jre default-jre-headless
    # arch-based
    ☯ ~ sudo pacman -S jre-openjdk jre-openjdk-headless
    ```

2. Make sure `$JAVA_HOME` is set in your `/etc/environment` file

    ```shell
    ☯ ~ echo "/usr/lib/jvm/java-17-openjdk-amd64/" | sudo tee -a /etc/environment
    ```

    If you installed the openjdk jre, you should be able to find your `$JAVA_HOME`
    with this command

    ```shell
    ☯ ~ find /usr/lib/jvm/ -iname java-1?-openjdk-amd64 | sort | tail -1
    /usr/lib/jvm/java-17-openjdk-amd64
    ```

    You can combine the two commands to make this fully automatic, but it's
    usually good to check things as you go when doing for the first time

    ```shell
    echo $(find /usr/lib/jvm/ -iname java-1?-openjdk-amd64 | sort | tail -1) | sudo tee -a /etc/environment
    ```
