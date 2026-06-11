---
title: "Homelab Bölüm 5: Kali ve Metasploitable"
date: 2026-05-25
draft: false
build:
  list: local
description: "İlk attacker ve target makinelerini ekledim: Metasploitable import, Kali kurulumu, ZFS disk referans hatası ve VLAN 40 erişim doğrulaması."
tags: ["homelab", "kali", "metasploitable", "proxmox", "pentest", "vlan", "zfs"]
ShowToc: true
TocOpen: true
---

[Part 4]({{< ref "/homelab/part-4" >}}) sonunda Docker platformu hazırdı. Bu bölümde klasik offensive-security ikilisini ekledim: Kali attacker, Metasploitable ise bilerek zafiyetli bırakılmış target.

İkisini de PENTEST VLAN'a koydum. Böylece pratik trafiği lab'in geri kalanından ayrı kaldı ve segment dışına çıkış tamamen pfSense kurallarına bağlı oldu.

---

## Ne İnşa Ettim?

```text
Segment:          PENTEST
VLAN:             40
Gateway:          10.10.40.1
Kali IP:          10.10.40.102
Metasploitable:   10.10.40.100
```

{{< slideshow >}}
  {{< slide src="../part-2/img/kali-vm-config.png" caption="Kali: vmbr1 + VLAN tag 40." >}}
  {{< slide src="../part-2/img/metas-08-check-config.png" caption="Metasploitable: VLAN 40 ve local-zfs disk." >}}
{{< /slideshow >}}

---

## Neden Önemli?

Vulnerable target'ın management veya domain segmentinde durmaması gerektiğini düşünüyorum. PENTEST VLAN, saldırı trafiğini kontrollü bir alanda tutmamı sağlıyor.

Bu sayede ileride firewall kararları daha anlamlı hale gelecek:

```text
PENTEST -> HONEYPOT     test için izinli olabilir
PENTEST -> CLIENT       sadece controlled simulation sırasında
PENTEST -> SIEM         normalde kapalı, sadece açık management path varsa
```

---

## Topoloji Kesiti

```text
PENTEST VLAN 40 / 10.10.40.0/24
        |-- Kali Linux          10.10.40.102
        |-- Metasploitable 2    10.10.40.100
pfSense gateway: 10.10.40.1
```

---

## Kurulum Adımları

### Metasploitable Import

Metasploitable normal ISO installer ile kurulmadığı için akış biraz farklı:

```text
Empty VM -> image download -> disk import -> attach disk -> boot order
```

```bash
cd /var/lib/vz/images/104
wget https://downloads.metasploit.com/data/metasploitable/metasploitable-linux-2.0.0.zip
unzip metasploitable-linux-2.0.0.zip
qm importdisk 104 Metasploitable.vmdk local-zfs
```

{{< slideshow >}}
  {{< slide src="../part-2/img/metas-vm-hardware.png" caption="Metasploitable için boş VM." >}}
  {{< slide src="../part-2/img/metas-01-wget.png" caption="Image Proxmox üzerinde indiriliyor." >}}
  {{< slide src="../part-2/img/metas-04.png" caption="qm importdisk ile disk import." >}}
  {{< slide src="../part-2/img/metas-07.png" caption="Imported disk VM'e attach edilip boot order içine alındı." >}}
{{< /slideshow >}}

### ZFS Volume Reference Fix

İlk boot sırasında şu hatayı aldım:

```text
TASK ERROR: unable to parse zfs volume name '104/Metasploitable.qcow2'
```

Disk vardı, ama VM config dosyası diski yanlış referans ediyordu. Gerçek ZFS volume adını kontrol edip config'i buna göre düzelttim:

```bash
zfs list | grep 104
vi /etc/pve/qemu-server/104.conf
```

Doğru satır:

```text
virtio0: local-zfs:vm-104-disk-1,iothread=1,size=32G
```

{{< slideshow >}}
  {{< slide src="../part-2/img/metas-zfs-fix-01.png" caption="ZFS parse hatası." >}}
  {{< slide src="../part-2/img/metas-zfs-fix-02.png" caption="104.conf içinde disk referansı düzeltildi." >}}
  {{< slide src="../part-2/img/metas-zfs-fix-03.png" caption="Gerçek ZFS volume adı doğrulandı." >}}
{{< /slideshow >}}

### Kali Kurulumu

Kali'yi normal ISO installer ile kurdum. Buradaki kritik ayar yine network tarafıydı: `vmbr1`, VLAN tag `40`.

{{< slideshow >}}
  {{< slide src="../part-2/img/kali-install-01.png" caption="Kali installer başlangıcı." >}}
  {{< slide src="../part-2/img/kali-install-06.png" caption="Kali VM için guided disk partitioning." >}}
  {{< slide src="../part-2/img/kali-install-10.png" caption="Kali software selection." >}}
  {{< slide src="../part-2/img/kali-install-13.png" caption="Kali PENTEST VLAN'da hazır." >}}
{{< /slideshow >}}

### macOS Route'u Kalıcı Hale Getirmek

Lab'in ilk erişim modelinde MacBook'tan `10.10.0.0/16` ağına yerel route eklemiştim. `route add` reboot sonrası kaybolduğu için erişim bir noktada tekrar bozuldu.

```bash
sudo route -n add -net 10.10.0.0/16 192.168.1.87
netstat -rn | grep 10.10
```

Kalıcı dosya:

```text
/Library/LaunchDaemons/com.homelab.route.plist
```

Çalıştırdığı komut:

```text
/sbin/route -n add -net 10.10.0.0/16 192.168.1.87
```

Bu çözüm daha sonra Tailscale remote access ile değişecek, ama local route'un neden reboot sonrası kaybolduğunu belgelemek önemliydi.

---

## Karşılaştığım Problemler

**Ready image ISO gibi kurulmaz.** Önce boş VM oluşturmam, sonra diski import edip attach etmem gerekti.

**ZFS disk adı farklı.** VM config dosyasının filename yerine `vm-104-disk-1` formatındaki gerçek ZFS volume adını referans etmesi gerekti.

**macOS route kalıcı değil.** `route add` reboot sonrası kayboluyor. İlk erişim sorunlarından biri buydu.

---

## Ne Öğrendim?

PENTEST VLAN'ın noisy tool ve vulnerable machine'ler için ayrı bir pratik alanı olduğunu netleştirdim. Kali ve Metasploitable birbirini doğrudan görebiliyor; segment dışına çıkış ise pfSense rule'larıyla kontrollü kaldı.

Bir Proxmox dersi de çıktı: ZFS üzerinde disk import etmek sadece dosya kopyalamak değil. VM config doğru ZFS volume adını referans etmezse disk orada olsa bile VM boot edemiyor.

---

## Doğrulama Kanıtı

Kali'den:

```bash
ip addr
ping -c 3 10.10.40.1
ping -c 3 10.10.40.100
nmap -sV 10.10.40.100
```

Tunnel:

```bash
ssh -L 8081:10.10.40.100:80 admin@10.10.1.50
# browser: http://localhost:8081
```

---

## Sırada Ne Var?

Attacker ve target hazır. Sırada bu trafiği gözlemleyebilmek için Wazuh SIEM temelini kurmak var.

---

## Hızlı Referans

```bash
qm importdisk 104 Metasploitable.vmdk local-zfs
zfs list | grep 104
vi /etc/pve/qemu-server/104.conf
```

```text
virtio0: local-zfs:vm-104-disk-1,iothread=1,size=32G
```

```bash
ssh -L 8081:10.10.40.100:80 admin@10.10.1.50
```
