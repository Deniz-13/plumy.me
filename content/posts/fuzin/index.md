---
title: "Fuzin: FZF wrapper for package managers."
date: 2026-03-29
draft: false
description: "Tired of searching google if a package exist or what it's name is in the distro I'm using."
tags: ["bash", "linux", "package manager", "brew", "pacman", "apt", "fzf"]
toc: true
---

## About the project

I am a chronic distro-hopper. Every time I try to install a package in a distro I have to search either if it exist or what its name is. I've been using bash aliases for using fzf withthe package manager at the time. But as I've said earlier, I'm a distro-hopper. I always change my configs and always forget to bring the alias with me. So I wrote Fuzin to automate my fzf aliases. Even if I'm using Arch, Debian or Mac doesn't matter I'm automatically inside fzf searching for packages.

Fuzin reduced my package installation process quite a bit. I can search packages and even see the package description without leaving my terminal(which I hate doing). If I'm using Arch for example and the package I'm looking for doesn't exist, I can search the AUR. Fuzin can also uninstall packages from my distro. I can seach and remove any package I want. Enough of the talking. You can see Fuzin in action below.

---

## Demo

<video controls playsinline style="width: 100%; max-width: 800px; display: block; margin: 0 auto;">
  <source src="img/demo.mp4" type="video/mp4">
</video>

## Features I like about Fuzin

- **Portable:** Automatically detects the package manager whether it be pacman, apt, dnf, zypper or even brew.
- **Multi Selection:** Select multiple packages to install or remove by pressing `TAB`.
- **Preview Package Descriptions:** Show brief descriptions of packages provided by the package manager without leaving the terminal.
- **AUR Integration:** When using pacman, search for AUR(using `yay` or `paru`) if a package doesn't exist. Added `-y or --yay` for yay and `-p or --paru` for paru AUR helpers.

---

## Installation

```bash
git clone https://github.com/Deniz-13/fuzin.git
cd fuzin
chmod +x fuzin
sudo mv fuzin /usr/local/bin/fuzin
```

---

## Usage

### 1. Searching and installing packages.

The default mode of the program is install mode.

```bash
fuzin
fuzin -i                # enters install mode.
```

**IF** you're using Pacman and the package you are looking for doesn't exist, press `ESC` and Fuzin will prompt you to search in AUR.

### 2. AUR helpers

```bash
fuzin -y or --yay       # Select yay to search packages.
fuzin -p or --paru      # Select paru to search packages.
```

### 3. Removing packages

You can search and remove packages that are installed on your system.

```bash
fuzin -r                # Search and remove installed packages.
```

---
