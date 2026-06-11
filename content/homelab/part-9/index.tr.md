---
title: "Homelab Bölüm 9: FLARE-VM ve REMnux Malware Analysis Segmenti"
date: 2026-05-29T12:00:00+03:00
draft: false
build:
  list: local
description: "İzole malware-analysis segmentini kurdum: FLARE-VM, REMnux QCOW2 import, boot-order troubleshooting ve planlanan INetSim doğrulaması."
tags: ["homelab", "malware-analysis", "flare-vm", "remnux", "inetsim", "proxmox", "isolation"]
ShowToc: true
TocOpen: true
---

[Part 8]({{< ref "/homelab/part-8" >}}) ile remote access hazırdı. Bu bölümde malware-analysis segmentini kurdum.

Bu segmentin mantığı lab'in geri kalanından farklı: domain yok, SIEM agent yok, final durumda gerçek internet yok. Controlled detonation, fake internet ve snapshot disiplini var.

---

## Ne İnşa Ettim?

```text
Segment:     isolated malware-analysis
Network:     vmbr99 / VLAN 99 design
FLARE-VM:    10.10.99.20
REMnux:      10.10.99.10
Internet:    final state'te yok
SIEM agent:  yok
Status:      FLARE kuruldu, REMnux import/boot edildi, INetSim validation pending
```

{{< slideshow >}}
  {{< slide src="../part-5/img/flare-vm-installed.png" caption="FLARE-VM kurulumu tamamlandı." >}}
  {{< slide src="../part-5/img/remnux-empty-vm-confirm.png" caption="REMnux import öncesi boş VM oluşturuldu." >}}
  {{< slide src="../part-5/img/remnux-first-boot.png" caption="Imported disk boot order'a alınınca REMnux boot etti." >}}
{{< /slideshow >}}

---

## Neden Önemli?

Malware analysis için izolasyonun yapısal olması gerektiğini düşünüyorum. Sample gerçek internete, domain'e veya SIEM VLAN'a yanlışlıkla erişmemeli.

```text
FLARE-VM -> REMnux: allowed
FLARE-VM -> real internet: blocked
REMnux -> real internet: final state'te blocked
FLARE-VM -> Wazuh/domain/lab VLANs: blocked
```

REMnux, INetSim gibi araçlarla fake internet sağlar. Böylece malware DNS/HTTP isteği atabilir ama bu trafik gerçek dünyaya çıkmaz.

---

## Topoloji Kesiti

```text
FLARE-VM 10.10.99.20
        |
        | DNS / HTTP / fake internet
        v
REMnux 10.10.99.10
        |
   final state'te gerçek default route yok
```

---

## Kurulum Adımları

### FLARE-VM

Önce temiz bir Windows base kurdum. Kurulum sırasında Windows'un disk ve network cihazlarını görebilmesi için VirtIO driver yükledim.

{{< slideshow >}}
  {{< slide src="../part-5/img/flare-vm-desktop.png" caption="FLARE için temiz Windows VM." >}}
  {{< slide src="../part-5/img/flare-vm-virtio-drivers.png" caption="VirtIO ISO mounted." >}}
  {{< slide src="../part-5/img/flare-vm-driver-install.png" caption="Windows içinde VirtIO driver kurulumu." >}}
{{< /slideshow >}}

Installer öncesi update/security özelliklerini geçici olarak kapattım. Bu karar sadece VM izolasyonu ve snapshot disipliniyle birlikte mantıklı.

{{< slideshow >}}
  {{< slide src="../part-5/img/flare-vm-disable-updates.png" caption="Kurulum sırasında Windows Updates kapatıldı." >}}
  {{< slide src="../part-5/img/flare-vm-disable-tamper.png" caption="Installer öncesi Tamper Protection kapatıldı." >}}
{{< /slideshow >}}

Snapshot:

```text
clean-windows-before-flare
```

PowerShell:

```powershell
cd $env:USERPROFILE\Desktop
(New-Object net.webclient).DownloadFile(
  'https://raw.githubusercontent.com/mandiant/flare-vm/main/install.ps1',
  "$([Environment]::GetFolderPath('Desktop'))\install.ps1"
)
Unblock-File .\install.ps1
Set-ExecutionPolicy Unrestricted -Scope CurrentUser -Force
.\install.ps1
```

{{< slideshow >}}
  {{< slide src="../part-5/img/flare-vm-install-script.png" caption="FLARE install script desktop üzerinde hazırlandı." >}}
  {{< slide src="../part-5/img/flare-vm-installer-running.png" caption="FLARE-VM installer çalışıyor." >}}
  {{< slide src="../part-5/img/flare-vm-reboot.png" caption="Kurulum sırasında reboot normal." >}}
{{< /slideshow >}}

Snapshot:

```text
clean-flare-installed
```

Önemli ayrım şu: FLARE araçlarının kurulumu internet ister. Bu yüzden araç kurulumunu izolasyondan önce yaptım; kurulum bitince VM izole ağa taşınmalı veya dış path kesilmeli.

### REMnux QCOW2 Import

REMnux final IP planı:

```text
IP:       10.10.99.10
Gateway:  empty
DNS:      127.0.0.1 or 10.10.99.10
```

```bash
mkdir -p /var/lib/vz/images/remnux
cd /var/lib/vz/images/remnux
curl -L -C - --progress-bar -o remnux.qcow2 "<REMNUX_QCOW2_URL>"
```

Import öncesi aynı ID ile boş VM oluşturmak gerekiyor. Sebep şu: `qm importdisk` mevcut bir VM'e import eder; `/etc/pve/qemu-server/<vmid>.conf` dosyası olmalı.

```bash
qm importdisk 111 /var/lib/vz/images/remnux/remnux.qcow2 local-zfs
qm set 111 --scsihw virtio-scsi-pci
qm set 111 --scsi1 local-zfs:vm-111-disk-1
qm set 111 --boot order=scsi1
```

{{< slideshow >}}
  {{< slide src="../part-5/img/remnux-attach-unused-disk.png" caption="Import sonrası disk unused olarak görünüyor; attach etmek gerekiyor." >}}
  {{< slide src="../part-5/img/remnux-first-boot.png" caption="Boot order düzeltildikten sonra REMnux açıldı." >}}
{{< /slideshow >}}

### Planlanan INetSim

```text
service_bind_address    10.10.99.10
dns_default_ip          10.10.99.10
```

```bash
sudo systemctl restart inetsim
# or
sudo inetsim
```

### Snapshot Disiplini

Bu segmentte snapshot benim için operasyonel güvenlik kuralı:

```text
clean-windows-before-flare
clean-flare-installed
clean-remnux-ready
sample çalıştırmadan önce snapshot
analiz sonrası clean snapshot'a revert
```

Malware analysis ortamında "bir kez çalıştırdım, sonra temizlerim" yaklaşımı güvenilir değil. Temiz state'e dönmek için snapshot temel mekanizma.

---

## Karşılaştığım Problemler

**REMnux ilk seferde boot etmedi.** VM CD-ROM/network boot deniyordu. Imported disk'i attach edip boot order'ı düzelttim.

**`qm importdisk` için VM önce var olmalı.** Boş VM gereksiz değil; VM ID ve config dosyasını oluşturuyor.

**Wazuh agent yok.** Bu segmentte outbound path, agent fingerprint ve SIEM gürültüsü istemiyorum.

---

## Ne Öğrendim?

Malware isolation'ın sadece firewall rule'a emanet edilmemesi gerektiğini öğrendim. Internal bridge/no uplink modeli daha güvenilir bir başlangıç noktası.

Appliance import tarafında da sırayı öğrendim: önce VM objesi, sonra disk import, sonra attach ve boot order.

---

## Doğrulama Kanıtı

FLARE'den:

```powershell
ping 10.10.99.10
nslookup microsoft.com
curl http://example.com
ping 8.8.8.8
```

Beklenen:

```text
REMnux reachable
DNS/HTTP fake response
8.8.8.8 unreachable
Wazuh/domain VLANs unreachable
```

REMnux kontrolleri:

```bash
ip route
ping 10.10.99.20
ping 10.10.10.99
```

---

## Sırada Ne Var?

Sırada INetSim final validation ve gerçek sample analizlerinde snapshot disiplinini uygulamak var.

---

## Hızlı Referans

```bash
qm importdisk 111 /var/lib/vz/images/remnux/remnux.qcow2 local-zfs
qm set 111 --scsihw virtio-scsi-pci
qm set 111 --scsi1 local-zfs:vm-111-disk-1
qm set 111 --boot order=scsi1
```

```powershell
Unblock-File .\install.ps1
Set-ExecutionPolicy Unrestricted -Scope CurrentUser -Force
.\install.ps1
```
