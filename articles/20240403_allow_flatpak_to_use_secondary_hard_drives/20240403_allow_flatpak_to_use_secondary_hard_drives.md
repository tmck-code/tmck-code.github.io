# 20240403 Allow flatpak to use secondary hard drives

I run Steam on linux using the Flatpak version, which I find has less driver/configuration issues than the DEB/RPM equivalent.

Every time I install it on a new OS, I need to ensure that it can access my shared SSD with my steam library directory on it.

> One note is that you'll need to ensure that your SSD partition is mounted in the correct place before running your flatpak program.   
I'd recommend configuring this to happen at startup with FSTAB (see my [handy fstab article](./articles/20220703_fstab/20220703_fstab.md))

In this example, the directory is at `/mnt/external/`. My steam library is at `/mnt/external/SteamLibrary`

```shell
flatpak override --user --filesystem=/mnt/external/ com.valvesoftware.Steam
```

Now, I can restart steam and add this library location!
