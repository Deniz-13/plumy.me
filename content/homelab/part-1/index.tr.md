---
title: "Homelab Bölüm 1: Proxmox ve pfSense Temeli"
date: 2026-05-19
draft: false
build:
  list: local
description: "Proxmox, VLAN-aware internal bridge ve pfSense firewall VM ile lab'in temelini kurdum."
tags: ["homelab", "proxmox", "pfsense", "networking", "virtualization"]
ShowToc: true
TocOpen: true
---

Bu ilk bölümde lab'in temelini kurdum: tek bir Proxmox node, bir internal VLAN-aware bridge ve bütün lab network'lerinin önünde duracak pfSense firewall/router.

Burada özellikle servis kurmadım. Önce ağ temelinin doğru olduğundan emin olmak istedim. Windows, Docker, Wazuh, Kali, honeypot ve malware-analysis makineleri daha sonra bu temelin üstüne gelecek.

---

## Ne İnşa Ettim?

```text
Physical host:  homelab
Hypervisor:     Proxmox VE
Firewall VM:    prod-firewall
WAN bridge:     vmbr0 -> home LAN / upstream router
LAN bridge:     vmbr1 -> internal lab bridge, VLAN-aware, no physical uplink
pfSense WAN:    vtnet0 -> 192.168.1.87/24
pfSense LAN:    vtnet1 -> 10.10.1.1/24
```

{{< slideshow >}}
  {{< slide src="img/topology.png" caption="Lab'in hedef topolojisi: pfSense merkezde, her ana fonksiyon kendi VLAN'ına ayrılacak." >}}
  {{< slide src="img/pfsense-console-menu.png" caption="İlk boot sonrası pfSense: WAN vtnet0, LAN vtnet1." >}}
{{< /slideshow >}}

---

## Neden Önemli?

Bu firewall VM, projenin ana kontrol noktası. Bundan sonra kuracağım her şey şu varsayımlara dayanıyor:

- VM'ler doğrudan home router'a çıkmamalı;
- internal trafik pfSense üzerinden geçmeli;
- Proxmox, internal bridge üzerinde IP almamalı;
- ileride ekleyeceğim VLAN'lar `vmbr1` üzerinde temiz taşınmalı.

Bu ayrım önemli. Aksi halde elimde sadece birkaç VM olurdu. Bu yapıyla ise her network'ün görevi belli olan segmentli bir lab kurmaya başlıyorum.

---

## Topoloji Kesiti

```text
Internet / home router
        |
      vmbr0
        |
  pfSense WAN
  pfSense LAN
        |
      vmbr1  (VLAN-aware, no bridge port, no Proxmox IP)
        |
 future lab VLANs
```

Buradaki en önemli karar `vmbr1` tarafında. Bu bridge'in fiziksel portu yok ve Proxmox üzerinde IP almıyor. Böylece Proxmox management tarafını lab segmentlerinin dışında tutuyorum.

---

## Kurulum Adımları

### Proxmox Repo Düzeltmesi

İlk olarak Proxmox repository ayarlarını düzelttim. Lisanssız kurulumda enterprise repo update hatası çıkarabiliyor. Bu yüzden enterprise/Ceph repo'larını kapatıp no-subscription repo'ya geçtim.

```bash
sed -i 's/^/#/' /etc/apt/sources.list.d/pve-enterprise.sources
sed -i 's/^/#/' /etc/apt/sources.list.d/ceph.sources

echo "deb http://download.proxmox.com/debian/pve trixie pve-no-subscription" \
  >> /etc/apt/sources.list

apt update && apt dist-upgrade -y
```

Proxmox 8 için repo dosyaları `.list` olabilir:

```bash
sed -i 's/^deb/#deb/' /etc/apt/sources.list.d/pve-enterprise.list
sed -i 's/^deb/#deb/' /etc/apt/sources.list.d/ceph.list

echo "deb http://download.proxmox.com/debian/pve bookworm pve-no-subscription" \
  >> /etc/apt/sources.list

apt update && apt dist-upgrade -y
```

Opsiyonel subscription popup patch:

```bash
sed -i.bak "s/NotFound/Active/g" /usr/share/perl5/PVE/API2/Subscription.pm
systemctl restart pveproxy
```

### Internal Bridge

Proxmox web arayüzünde internal lab bridge'i bu şekilde oluşturdum:

```text
System -> Network -> Create -> Linux Bridge
Name:          vmbr1
IPv4/CIDR:     empty
Bridge ports:  empty
VLAN aware:    enabled
Comment:       LAB LAN
```

{{< slideshow >}}
  {{< slide src="img/bridge-01-overview.png" caption="Lab bridge oluşturulmadan önce Proxmox network görünümü." >}}
  {{< slide src="img/bridge-03-create.png" caption="IP'siz, portsuz ve VLAN-aware vmbr1 oluşturuluyor." >}}
{{< /slideshow >}}

### pfSense VM

Sonra `prod-firewall` isimli pfSense VM'ini oluşturdum.

```text
VM ID:     101
Name:      prod-firewall
CPU:       2 cores
RAM:       2 GB
Disk:      32 GB, local-zfs
NIC 1:     vmbr0, VirtIO -> WAN
NIC 2:     vmbr1, VirtIO -> LAN
```

{{< slideshow >}}
  {{< slide src="img/pfsense-vm-01-general.png" caption="pfSense VM: ID 101, prod-firewall." >}}
  {{< slide src="img/pfsense-vm-07-network.png" caption="İlk NIC vmbr0 üzerinde, WAN olacak." >}}
  {{< slide src="img/bridge-02-add-nic.png" caption="İkinci NIC vmbr1 üzerinde, LAN olacak." >}}
{{< /slideshow >}}

### pfSense Kurulumu

pfSense installer tarafında çoğu seçeneği varsayılan bıraktım:

```text
Install mode:      Install
Filesystem:        ZFS
Pool type:         Stripe
Partition scheme:  GPT
WAN:               vtnet0
LAN:               vtnet1
```

{{< slideshow >}}
  {{< slide src="img/pfsense-install-02.png" caption="pfSense installer başlangıcı." >}}
  {{< slide src="img/pfsense-install-04.png" caption="Auto ZFS seçimi." >}}
  {{< slide src="img/pfsense-install-08-iface.png" caption="WAN vtnet0, LAN vtnet1 olarak atanıyor." >}}
  {{< slide src="img/pfsense-install-16.png" caption="Kurulum tamamlandı, reboot." >}}
{{< /slideshow >}}

İlk boot sonrası pfSense console üzerinden LAN tarafını ayarladım:

```text
LAN IPv4 address: 10.10.1.1
Subnet:           24
Gateway on LAN:   empty
DHCP on LAN:      later
```

---

## Karşılaştığım Problemler

**Proxmox update hatası.** Enterprise repo açık olduğu için update başarısız oluyordu. Enterprise/Ceph repo'larını kapatıp no-subscription repo ekleyerek çözdüm.

**Internal bridge'e IP vermemek gerekiyor.** `vmbr1` IP alırsa Proxmox host lab içinden erişilebilir hale geliyor. Bu da kurmak istediğim izolasyonu zayıflatıyor.

**NIC sırası önemli.** İlk eklediğim NIC `vtnet0`, ikinci eklediğim NIC `vtnet1` oldu. Devam etmeden önce bunu pfSense console üzerinden doğruladım.

---

## Ne Öğrendim?

Virtual firewall kurarken meselenin sadece "iki NIC eklemek" olmadığını gördüm. Asıl mesele hangi yolun kime ait olduğunu netleştirmek. `vmbr0` dış yol, `vmbr1` iç yol, pfSense de bu iki yol arasındaki tek router.

Proxmox bridge'leri dikkatsiz kullanılırsa güvenlik sınırlarını bulanıklaştırabiliyor. Bu yüzden `vmbr1` üzerinde IP bırakmadım. Böyle yapınca topoloji hem daha okunur hem de ileride genişletmesi daha güvenli oldu.

---

## Doğrulama Kanıtı

Bu temel sağlıklıysa şunlar doğru olmalı:

```text
Proxmox no-subscription repo ile update alıyor.
vmbr1 var, VLAN-aware ve IP'siz.
pfSense WAN=vtnet0, LAN=vtnet1 ile boot ediyor.
pfSense LAN 10.10.1.1/24.
```

```bash
pveversion
ip addr show vmbr1
qm config 101
```

pfSense console:

```text
Option 1 - Assign Interfaces
Option 2 - Set interface(s) IP address
```

---

## Sırada Ne Var?

Sıradaki adımda LAN tarafına küçük bir Alpine jumpbox koyacağım. Onu pfSense'e ve daha sonra lab içindeki diğer sistemlere kontrollü giriş noktası olarak kullanacağım.

---

## Hızlı Referans

```text
vmbr0 -> upstream/home network
vmbr1 -> internal lab bridge, VLAN-aware, no physical uplink, no Proxmox IP
pfSense vtnet0 -> WAN
pfSense vtnet1 -> LAN
pfSense LAN IP -> 10.10.1.1/24
```

```bash
sed -i 's/^/#/' /etc/apt/sources.list.d/pve-enterprise.sources
sed -i 's/^/#/' /etc/apt/sources.list.d/ceph.sources
echo "deb http://download.proxmox.com/debian/pve trixie pve-no-subscription" >> /etc/apt/sources.list
apt update && apt dist-upgrade -y
```
