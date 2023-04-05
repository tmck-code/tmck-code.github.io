# 20230406 Installing Github Copilot

I've recently begun using Github Copilot, and have installed it for all my OSs for `vim`, `neovim` and `vscode`

I made a bootstrap script for Debian Bullseye:
- it will install github copilot for these 3 IDE's
- and install an up-to-date node version

If you are running a different OS, then the first 3 commands will still work, and you will have to separately ensure that you have node >= v16 installed.

```shell
#!/bin/bash

set -euo pipefail

if [ ! -d ~/.vim/pack/github/start/copilot.vim ]; then
  echo "- installing for vim"
  git clone https://github.com/github/copilot.vim.git \
    ~/.vim/pack/github/start/copilot.vim
fi

if [ ! -d ~/.config/nvim/pack/github/start/copilot.vim ]; then
  echo "- installing for neovim"
  git clone https://github.com/github/copilot.vim.git \
    ~/.config/nvim/pack/github/start/copilot.vim
fi

echo "- installing for vscode"
code --install-extension GitHub.copilot

echo "- installing nodejs"
# nodejs needs to be version v16+, debian bullseye only ships with v12
curl -fsSL https://deb.nodesource.com/setup_19.x | sudo -E bash - && \
  sudo apt install -y nodejs

echo "! run :Copilot setup & :Copilot enable when in vim/nvim"
```

---

Now, 
- you can open vscode and click the popup button to log into github.
- you can open vim, and run `:Copilot setup`, follow the instructions to login, before finally running `:Copilot enable`.

Done! Happy coding :)