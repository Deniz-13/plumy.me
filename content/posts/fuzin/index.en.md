---
title: "Fuzin: An FZF Wrapper for Package Managers"
date: 2026-03-29
draft: false
description: "A small shell tool that lets me search, install, and remove packages with fzf across different package managers."
tags: ["bash", "linux", "package manager", "brew", "pacman", "apt", "fzf"]
ShowToc: true
TocOpen: true
---

## About the project

I am a chronic distro-hopper. Every time I move between systems, I forget small package-management details: whether a package exists, what it is called on that distro, or which command I used last time.

For a while, I solved this with small bash aliases that combined package-manager search commands with `fzf`. The problem was that I kept changing distros, changing configs, and forgetting to bring those aliases with me. Fuzin is my attempt to make that workflow portable.

Fuzin detects the available package manager and opens an interactive `fzf` search. It works with package managers like `pacman`, `apt`, `dnf`, `zypper`, and `brew`. On Arch-based systems, it can also fall back to AUR helpers like `yay` or `paru`.

---

## Demo

<video controls playsinline style="width: 100%; max-width: 800px; display: block; margin: 0 auto;">
  <source src="/posts/fuzin/img/demo.mp4" type="video/mp4">
</video>

## What I Use It For

- **Portable package search:** Fuzin detects the package manager and opens the right search flow.
- **Multi-select installs/removals:** I can select more than one package with `TAB`.
- **Package previews:** I can read package descriptions without leaving the terminal.
- **AUR fallback:** On Arch-based systems, I can search the AUR with `yay` or `paru` when the package is not in the official repositories.
- **Remove mode:** I can search installed packages and remove the ones I select.

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

### 1. Search and install packages

The default mode is install mode.

```bash
fuzin
fuzin -i                # enters install mode.
```

If you are using `pacman` and the package does not exist in the official repositories, press `ESC` and Fuzin will ask whether you want to search the AUR.

### 2. AUR helpers

```bash
fuzin -y or --yay       # use yay for AUR search
fuzin -p or --paru      # use paru for AUR search
```

### 3. Remove packages

You can also search and remove packages that are already installed on your system.

```bash
fuzin -r                # search and remove installed packages
```

---
