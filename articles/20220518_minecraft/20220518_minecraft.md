# 20220518 Minecraft

This article contains some handy tips and tricks around running Minecraft clients and servers, particularly in Linux

- [20220518 Minecraft](#20220518-minecraft)
  - [Client](#client)
    - [Locations](#locations)
    - [Mods & Shaders](#mods--shaders)
    - [Recommendations - Mods](#recommendations---mods)
      - [Notes](#notes)
    - [Recommendations - Shaders](#recommendations---shaders)
    - [Installing Java for client](#installing-java-for-client)
      - [Linux](#linux)
  - [Server](#server)
    - [Docker](#docker)
    - [mcrcon](#mcrcon)
  - [Finding the world seed](#finding-the-world-seed)
    - [via the Docker server](#via-the-docker-server)

---

## Client

### Locations

```shell
$HOME/.minecraft/shaderpacks/1.18.2/
$HOME/.minecraft/mods/--
```

### Mods & Shaders

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


#### Notes

- In order for OptiFabric to work, you'll need to move the optifine jar file to `~/.minecraft/mods` after installing it. This isn't usually required for optifine to work, but is required by OptiFabric

### Recommendations - Shaders

- [Sildur's Vibrant shaders](https://www.curseforge.com/minecraft/customization/sildurs-vibrant-shaders/download)
- [Sildur's Enhanced Default](https://www.curseforge.com/minecraft/customization/sildurs-enhanced-default/download)
- [BSL Shaders](https://www.curseforge.com/minecraft/customization/bsl-shaders/download)

### Installing Java for client

#### Linux

1. Download the openjdk jre

    ```shell
    # debian-based
    ☯ ~ sudo apt install default-jre default-jre-headless
    # arch-based
    ☯ ~ sudo pacman -S jre-openjdk jre-openjdk-headless
    # m1 osx
    arch -arm64 brew install openjdk
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

## Server

### Docker

use itzg/minecraft-server

Using this awesome docker image, you can specify the VERSION of your server, and also optionally use FABRIC for installing server-side datapacks/mods

```shell
docker pull itzg/minecraft-server:latest

docker run \
  -d \
  --name mc \
  --restart=unless-stopped \
  -p 25565:25565 \
  -P 25575:25575 \
  -e VERSION=1.19 \
  -e TYPE=FABRIC \
  -e EULA=TRUE \
  -v $HOME/.minecraft-server/:/data \
  itzg/minecraft-server:latest
```

### mcrcon

mcrcon is a cli tool that you can use for admin control over your server

> [https://github.com/Tiiffi/mcrcon](https://github.com/Tiiffi/mcrcon)

Install using:

```shell
git clone https://github.com/Tiiffi/mcrcon.git
cd mcrcon
make
sudo make install
```

You can then connect a mcrcon session using these parameters:

- `0.0.0.0` for the hostname of the docker container
- `25575` as the mcrcon port
- `minecraft` as the default server password

```shell
 ☯ ~ mcrcon -H 0.0.0.0 -P 25575 -p minecraft
Logged in. Type 'quit' or 'exit' to quit.
>worldborder get
The world border is currently 59999968 blocks wide
```

## Finding the world seed

### via the Docker server

You can use `mcrcon`, just add your command that you want to run after you've specified your host/port/password

```shell
 ☯ ~ mcrcon -H 0.0.0.0 -P 25575 -p minecraft seed
Seed: [-2679236495807353480]
```
