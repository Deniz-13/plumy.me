---
title: "Fuzin: Paket Yöneticileri için FZF Wrapper"
date: 2026-03-29
draft: false
description: "Farklı paket yöneticilerinde paket arama, kurma ve kaldırma işlerini fzf ile hızlandıran küçük bir shell aracı."
tags: ["bash", "linux", "package manager", "brew", "pacman", "apt", "fzf"]
ShowToc: true
TocOpen: true
---

## Proje Hakkında

Ben biraz kronik distro-hopper'ım. Sistem değiştirince aynı küçük sorun tekrar karşıma çıkıyor: paket bu dağıtımda var mı, adı ne, hangi package manager komutunu kullanmam gerekiyor?

Bir süre bunu küçük bash alias'larıyla çözdüm. Paket yöneticisinin search komutunu `fzf` ile birleştiriyordum. Ama dağıtım değiştirdikçe config'ler de değişiyordu ve bu alias'ları taşımayı unutuyordum. Fuzin'i bu yüzden yazdım: kullandığım o küçük `fzf` workflow'unu taşınabilir hale getirmek için.

Fuzin sistemdeki package manager'ı algılıyor ve beni doğrudan interaktif `fzf` aramasına alıyor. `pacman`, `apt`, `dnf`, `zypper` ve `brew` gibi araçlarla çalışabiliyor. Arch tabanlı sistemlerde paket official repo'da yoksa `yay` veya `paru` ile AUR tarafına da bakabiliyor.

---

## Demo

<video controls playsinline style="width: 100%; max-width: 800px; display: block; margin: 0 auto;">
  <source src="/posts/fuzin/img/demo.mp4" type="video/mp4">
</video>

## Ne için Kullanıyorum?

- **Taşınabilir paket arama:** Fuzin package manager'ı algılayıp doğru search akışını açıyor.
- **Çoklu seçim:** `TAB` ile birden fazla paketi seçip kurabiliyor veya kaldırabiliyorum.
- **Paket açıklaması önizleme:** Terminalden çıkmadan paket açıklamalarını görebiliyorum.
- **AUR desteği:** Arch tabanlı sistemlerde official repo'da olmayan paketler için `yay` veya `paru` kullanabiliyorum.
- **Kaldırma modu:** Sistemde kurulu paketleri arayıp seçtiklerimi kaldırabiliyorum.

---

## Kurulum

```bash
git clone https://github.com/Deniz-13/fuzin.git
cd fuzin
chmod +x fuzin
sudo mv fuzin /usr/local/bin/fuzin
```

---

## Kullanım

### 1. Paket Arama ve Kurma

Varsayılan mod install modudur.

```bash
fuzin
fuzin -i                # install moduna girer
```

`pacman` kullanıyorsan ve aradığın paket official repo'da yoksa `ESC` tuşuna basınca Fuzin AUR içinde arama yapmak isteyip istemediğini sorar.

### 2. AUR Helper Seçimi

```bash
fuzin -y or --yay       # AUR araması için yay kullanır
fuzin -p or --paru      # AUR araması için paru kullanır
```

### 3. Paket Kaldırma

Sistemde kurulu paketleri arayıp seçtiklerini kaldırabilirsin.

```bash
fuzin -r                # kurulu paketleri arar ve kaldırır
```

---
