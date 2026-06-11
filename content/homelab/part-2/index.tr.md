---
title: "Homelab Bölüm 2: Alpine Jumpbox ve pfSense Erişimi"
date: 2026-05-20
draft: false
build:
  list: local
description: "Alpine jumpbox kurdum, ilk DHCP/DNS sorunlarını çözdüm ve SSH forwarding ile pfSense web arayüzüne eriştim."
tags: ["homelab", "alpine", "jumpbox", "pfsense", "ssh", "networking"]
ShowToc: true
TocOpen: true
---

[Part 1]({{< ref "/homelab/part-1" >}}) sonunda pfSense WAN ve LAN tarafıyla boot etmişti. Bu bölümde LAN tarafına ilk Linux VM'imi ekledim: küçük bir Alpine jumpbox.

Bu makine lab'e ilk kontrollü giriş kapım oldu. Her servisi doğrudan laptop'a açmak yerine Alpine'a SSH ile girip, sadece ihtiyaç duyduğum servisi local forwarding ile kendime taşıyorum.

---

## Ne İnşa Ettim?

```text
VM name:     prod-alpine
VM ID:       102
OS:          Alpine Linux
Network:     vmbr1
IP:          10.10.1.50/24
Gateway:     10.10.1.1
Role:        jumpbox / bastion
```

{{< slideshow >}}
  {{< slide src="../part-1/img/alpine-vm-01-general.png" caption="Alpine VM: ID 102, prod-alpine." >}}
  {{< slide src="../part-1/img/alpine-vm-07-network.png" caption="Network vmbr1 üzerinde; yani pfSense LAN tarafında." >}}
  {{< slide src="../part-1/img/alpine-vm-08-confirm.png" caption="Kurulum öncesi Alpine VM özeti." >}}
{{< /slideshow >}}

---

## Neden Önemli?

Jumpbox yönetim yolunu sadeleştirdi. pfSense, Portainer ve Wazuh gibi arayüzlere doğrudan erişim vermek yerine SSH tunnel kullandım. Böylece lab büyürken management path daha kontrollü kaldı.

Bu model ileride özellikle şuralarda işime yarayacak:

- pfSense web arayüzüne kontrollü erişim;
- Portainer ve Wazuh dashboard tunnel'ları;
- içerideki Linux makinelerine tek bastion üzerinden yönetim;
- firewall kuralları değişirken yönetim yolunun öngörülebilir kalması.

---

## Topoloji Kesiti

```text
Laptop
  |
home LAN / upstream router
  |
pfSense WAN
pfSense LAN 10.10.1.1
  |
Alpine jumpbox 10.10.1.50
```

---

## Kurulum Adımları

### Alpine Kurulumu

```sh
setup-alpine
```

VM'i özellikle küçük tuttum:

```text
CPU:      1 core
RAM:      1 GB
Disk:     16 GB
Bridge:   vmbr1
```

### APK ve Disk Kurulumunu Düzeltme

Kurulum sırasında repository/DNS sorunu yaşadım. Wizard ile uğraşmak yerine ağı ve repository'leri elle düzelttim:

```sh
ip link set eth0 up
setup-apkrepos
apk update
setup-disk -m sys /dev/sda
```

Reboot sonrası interface'i tekrar kaldırıp DHCP lease aldım:

```sh
ip link set eth0 up
udhcpc -i eth0
ip a
```

Beklenen:

```text
eth0 -> 10.10.1.50/24
gateway -> 10.10.1.1
```

Bu noktadan sonra installer tarafındaki belirsizliği bırakıp sistemi normal bir Alpine VM gibi yönetmeye başladım.

### Base Paketler

```sh
apk add openssh sudo nano tmux curl
apk upgrade
rc-update add sshd
service sshd start
```

Sonra root dışında kullanacağım admin kullanıcısını oluşturdum:

```sh
adduser admin
addgroup admin wheel
visudo
```

`visudo` içinde:

```text
%wheel ALL=(ALL) ALL
```

{{< slideshow >}}
  {{< slide src="../part-1/img/alpine-visudo.png" caption="wheel grubuna sudo yetkisi veriliyor." >}}
{{< /slideshow >}}

### pfSense LAN DHCP

pfSense console üzerinden LAN tarafını şöyle ayarladım:

```text
LAN IP:              10.10.1.1
Subnet bit count:    24
Upstream gateway:    empty
DHCP server on LAN:  yes
DHCP range start:    10.10.1.100
DHCP range end:      10.10.1.200
Web configurator:    ilk erişim için HTTP
```

Burada küçük ama önemli bir detay var: `10.10.1.1` firewall'un host IP'si. `10.10.1.0/24` ise network adresi; host IP olarak verilmez.

---

## pfSense Web UI Erişimi

Bu bölümde ilk gerçek troubleshooting zincirimi yaşadım. Laptop `192.168.1.0/24` tarafındaydı, pfSense LAN ise `10.10.1.0/24` tarafındaydı. Arayüze erişebilmek için dört katmanı sırayla düzeltmem gerekti.

### 1. macOS Route

```sh
sudo route -n add -net 10.10.1.0/24 192.168.1.87
```

### 2. WAN Private/Bogon Block

pfSense, WAN tarafını normalde internet gibi düşünür. Benim lab'imde WAN da private RFC1918 ağında olduğu için bu varsayılan block ayarı erişimi kesti.

```sh
sed -i '' 's|<blockpriv>1</blockpriv>|<blockpriv>0</blockpriv>|' /conf/config.xml
sed -i '' 's|<blockbogons>1</blockbogons>|<blockbogons>0</blockbogons>|' /conf/config.xml
/etc/rc.filter_configure
```

### 3. Geçici WAN Pass Rule

```sh
echo "pass in quick on vtnet0 from any to any" | pfctl -f -
```

Bu kural sadece GUI'ye ulaşmak için kullandığım geçici bir köprüydü. Firewall reload olduğunda kaybolur; final management modeli olarak düşünülmemeli.

### 4. Alpine SSH Forwarding

```text
AllowTcpForwarding yes
GatewayPorts yes
```

```sh
service sshd restart
```

### Çalışan Tunnel

Çalışan tunnel:

```sh
ssh -L 8080:10.10.1.1:80 admin@10.10.1.50
```

Browser:

```text
http://localhost:8080
```

{{< slideshow >}}
  {{< slide src="../part-1/img/wizard-01-general.png" caption="pfSense wizard genel ayarlar." >}}
  {{< slide src="../part-1/img/wizard-02-block-private.png" caption="WAN private/bogon block kapalı." >}}
  {{< slide src="../part-1/img/wizard-03-lan.png" caption="LAN 10.10.1.1/24." >}}
  {{< slide src="../part-1/img/wizard-04-password.png" caption="Admin password değiştirildi." >}}
{{< /slideshow >}}

GUI'ye ulaştıktan sonra bu geçici `pfctl` yaklaşımını bıraktım. Bunun yerine sadece kendi MacBook IP'mden pfSense SSH erişimine izin veren daha dar ve kalıcı bir WAN rule yazdım.

{{< slideshow >}}
  {{< slide src="../part-1/img/fw-wan-ssh-rule.png" caption="Kalıcı WAN rule: sadece MacBook IP'sinden pfSense SSH erişimi." >}}
{{< /slideshow >}}

---

## Karşılaştığım Problemler

**Alpine DNS/mirror sorunu.** Installer bazı resolver ve repository dosyalarını değiştiriyordu. Mirror adımını zorlamak yerine sonradan elle düzeltmek daha temiz oldu.

**`setup-disk` syslinux bulamadı.** Repository düzgün değildi. `setup-apkrepos` ve `apk update` çözdü.

**pfSense timeout.** Sorun tek yerde değildi. Route, WAN private block, firewall rule ve SSH forwarding ayarlarını sırayla kontrol etmem gerekti.

**SSH forwarding policy açık değilse tunnel çalışmaz.** `administratively prohibited` hatasında sorunun pfSense değil, Alpine üzerindeki `AllowTcpForwarding` ayarı olduğunu gördüm.

---

## Ne Öğrendim?

Jumpbox'ın sadece kolaylık olmadığını öğrendim; bu aslında bir yönetim modeli. Tek ve dar bir SSH yolu açıp ihtiyacım olan servisi tunnel ile kullanmak, lab büyüdükçe kontrolü korumamı sağlıyor.

Bir de timeout troubleshooting'ini katmanlara ayırmayı öğrendim. Aynı semptom routing, WAN private block, firewall rule veya SSH forwarding yüzünden çıkabiliyor. Tek tek ayırmadan doğru sebebi bulmak zor.

---

## Doğrulama Kanıtı

```sh
ssh admin@10.10.1.50
sudo whoami
ip a
ping -c 2 10.10.1.1
ssh -L 8080:10.10.1.1:80 admin@10.10.1.50
```

Beklenen tarayıcı sonucu:

```text
http://localhost:8080 -> pfSense GUI
```

---

## Sırada Ne Var?

Artık pfSense GUI'ye erişebiliyorum ve Alpine içeride stabil bir giriş noktası oldu. Sıradaki adım lab VLAN'larını oluşturup segmentleri gerçek anlamda ayırmak.

---

## Hızlı Referans

```sh
setup-alpine
setup-apkrepos
apk update
apk add openssh sudo nano tmux curl
rc-update add sshd
service sshd start
```

```sh
ssh -L 8080:10.10.1.1:80 admin@10.10.1.50
```

```sh
echo "pass in quick on vtnet0 from any to any" | pfctl -f -
```
