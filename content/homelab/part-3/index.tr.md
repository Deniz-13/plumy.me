---
title: "Homelab Bölüm 3: VLAN Segmentasyonu ve İlk DHCP"
date: 2026-05-21
draft: false
build:
  list: local
description: "pfSense üzerinde VLAN'ları tanımladım, gateway IP'lerini verdim, ilk DHCP düzenini kurdum ve geçici allow rule'larını belgeledim."
tags: ["homelab", "pfsense", "vlan", "dhcp", "networking", "segmentation"]
ShowToc: true
TocOpen: true
---

[Part 2]({{< ref "/homelab/part-2" >}}) sonunda pfSense'e erişebiliyor ve jumpbox'ı kullanabiliyordum. Bu bölümde flat LAN'i segmentli bir lab ağına dönüştürdüm.

Amacım önce VLAN interface'lerini oluşturmak, her segmente gateway IP vermek, kurulum aşamasında işimi kolaylaştıracak DHCP'yi açmak ve final firewall policy'yi ayrı bir bölüme bırakmaktı.

---

## Ne İnşa Ettim?

```text
Parent interface: vtnet1
VLAN 10: SIEM
VLAN 20: DEFENCE
VLAN 30: CONTAINER
VLAN 40: PENTEST
VLAN 50: HONEYPOT
VLAN 60: CLIENT
VLAN 99: ISOLATED
```

| Segment | VLAN | Gateway | Amaç |
|---|---:|---|---|
| LAN | native | `10.10.1.1/24` | jumpbox ve erken yönetim |
| SIEM | 10 | `10.10.10.1/24` | Wazuh ve monitoring |
| DEFENCE | 20 | `10.10.20.1/24` | AD, DNS, DHCP |
| CONTAINER | 30 | `10.10.30.1/24` | Docker ve automation |
| PENTEST | 40 | `10.10.40.1/24` | Kali ve vulnerable target |
| HONEYPOT | 50 | `10.10.50.1/24` | honeypot telemetry |
| CLIENT | 60 | `10.10.60.1/24` | Windows endpoint'ler |
| ISOLATED | 99 | `10.10.99.1/24` | malware-analysis isolation |

---

## Neden Önemli?

Segmentasyon lab'i büyütülebilir hale getirdi. Hangi sistemler konuşacak, hangileri default block olacak, telemetry nereden gelecek ve lateral movement firewall üzerinden geçerken nasıl görünecek gibi soruları artık daha net sorabiliyorum.

Pratikte şu soruları ayrı ayrı görünür hale getirir:

- Hangi sistemlerin konuşmasına izin verilecek?
- Hangi segmentler default block olacak?
- Telemetry hangi segmentten hangi servise akacak?
- Lateral movement firewall sınırından geçerken nasıl görünecek?

Kurulum aşamasında geniş allow rule kullandım. Bunu özellikle geçici tuttum; final policy Part 11'de daraltılacak.

---

## Topoloji Kesiti

```text
pfSense LAN parent: vtnet1
  |-- vtnet1.10  SIEM       10.10.10.1/24
  |-- vtnet1.20  DEFENCE    10.10.20.1/24
  |-- vtnet1.30  CONTAINER  10.10.30.1/24
  |-- vtnet1.40  PENTEST    10.10.40.1/24
  |-- vtnet1.50  HONEYPOT   10.10.50.1/24
  |-- vtnet1.60  CLIENT     10.10.60.1/24
  |-- vtnet1.99  ISOLATED   10.10.99.1/24
```

---

## Kurulum Adımları

### VLAN Tanımlama

```text
Interfaces -> VLANs -> Add
Parent:      vtnet1
Tag:         VLAN ID
Description: segment name
```

{{< slideshow >}}
  {{< slide src="../part-1/img/vlan-01-create-siem.png" caption="vtnet1 üzerinde ilk VLAN oluşturuluyor." >}}
  {{< slide src="../part-1/img/vlan-02-list.png" caption="Lab VLAN listesi." >}}
{{< /slideshow >}}

### Interface Olarak Atama

VLAN objesi tek başına yetmedi. pfSense tarafında firewall rule, gateway ve DHCP ayarlarını yönetebilmek için her VLAN'ı ayrıca interface olarak assign etmem gerekti.

```text
Interfaces -> Assignments
Available network ports -> vtnet1.X
Add
Enable interface
Rename OPTx
Static IPv4 gateway address
```

{{< slideshow >}}
  {{< slide src="../part-1/img/vlan-03-iface-page.png" caption="VLAN interface'leri eklenmeden önce Assignments." >}}
  {{< slide src="../part-1/img/vlan-04-add-iface.png" caption="vtnet1.10 interface olarak ekleniyor." >}}
  {{< slide src="../part-1/img/vlan-05-enable.png" caption="Interface enable ediliyor ve Static IPv4 seçiliyor." >}}
  {{< slide src="../part-1/img/vlan-07-assigned-list.png" caption="Tüm VLAN'lar interface olarak atanmış durumda." >}}
{{< /slideshow >}}

### Gateway IP'leri

Her segmente `.1/24` gateway verdim.

{{< slideshow >}}
  {{< slide src="../part-1/img/vlan-ip-01.png" caption="SIEM gateway: 10.10.10.1/24." >}}
  {{< slide src="../part-1/img/vlan-ip-02.png" caption="DEFENCE gateway: 10.10.20.1/24." >}}
  {{< slide src="../part-1/img/vlan-ip-03.png" caption="CONTAINER gateway: 10.10.30.1/24." >}}
  {{< slide src="../part-1/img/vlan-ip-04.png" caption="PENTEST gateway: 10.10.40.1/24." >}}
  {{< slide src="../part-1/img/vlan-ip-05.png" caption="HONEYPOT gateway: 10.10.50.1/24." >}}
  {{< slide src="../part-1/img/vlan-ip-06.png" caption="CLIENT gateway: 10.10.60.1/24." >}}
  {{< slide src="../part-1/img/vlan-ip-07.png" caption="ISOLATED gateway: 10.10.99.1/24; bu segment daha sonra daha katı izolasyonla ele alınacak." >}}
{{< /slideshow >}}

### Geçici Allow Rule

pfSense yeni interface'leri varsayılan olarak bloklar. Kurulum aşamasında VM'lerin update alabilmesi ve paket indirebilmesi için her VLAN'a geçici bir broad allow rule koydum.

```text
Action:       Pass
Interface:    target VLAN
Source:       target VLAN net
Destination:  any
```

{{< slideshow >}}
  {{< slide src="../part-1/img/vlan-iface-09-allow-rule.png" caption="Kurulum aşaması allow rule." >}}
  {{< slide src="../part-1/img/copy-rule-all.png" caption="Rule diğer interface'lere kopyalanıyor." >}}
{{< /slideshow >}}

Bu final firewall policy değil. Sadece build aşaması için kullandığım bir kolaylık.

### İlk DHCP

```text
LAN:        10.10.1.100-10.10.1.200
DEFENCE:    10.10.20.100-10.10.20.200
CONTAINER:  10.10.30.100-10.10.30.200
CLIENT:     10.10.60.100-10.10.60.200
```

{{< slideshow >}}
  {{< slide src="../part-1/img/dhcp-01-dns.png" caption="DNS Resolver lab interface'leri üzerinde dinleyecek şekilde ayarlandı." >}}
  {{< slide src="../part-1/img/dhcp-03-backend.png" caption="Lease ve reservation oluşmadan Kea DHCP'ye geçiş." >}}
  {{< slide src="../part-1/img/dhcp-04-pool.png" caption="LAN DHCP pool örneği." >}}
  {{< slide src="../part-1/img/dhcp-06-container.png" caption="CONTAINER VLAN DHCP pool." >}}
  {{< slide src="../part-1/img/dhcp-07-client.png" caption="CLIENT VLAN DHCP pool." >}}
{{< /slideshow >}}

AD geldikten sonra DHCP'yi Windows Server'a taşıyacağım. O noktada pfSense DHCP server değil, relay rolüne geçecek.

---

## Karşılaştığım Problemler

**VLAN otomatik interface olmuyor.** VLAN tanımlama ve interface assign iki ayrı adım. Bunu ayırmadan firewall ve DHCP tarafı anlamlı hale gelmiyor.

**Geçici allow rule kalıcı olmamalı.** Kurulum için faydalı, ama final policy olarak bırakılırsa segmentasyonun anlamı ciddi şekilde azalır.

**DHCP range planı önemli.** VLAN 30'da macvlan için düşük IP aralığını, DHCP için de `.100+` aralığını ayırdım.

**ISOLATED segmenti sıradan VLAN gibi düşünülmemeli.** Gateway/IP tarafını burada oluşturdum, ama malware-analysis için son karar daha katı izolasyon ve explicit block policy olmalı.

---

## Ne Öğrendim?

Segmentasyonun sadece subnet olmadığını öğrendim. VLAN tag, assigned firewall interface, gateway IP, DHCP/static kararı ve firewall policy birlikte çalışıyor.

Bu sırayı net kurmak sonraki troubleshooting'i kolaylaştırdı. Bir VM IP almıyorsa veya route edemiyorsa artık eksik katmanı tek tek kontrol edebiliyorum.

---

## Doğrulama Kanıtı

```text
Interfaces -> Assignments
Interfaces -> <VLAN name>
Firewall -> Rules -> <VLAN name>
Services -> DHCP Server
Status -> DHCP Leases
```

Her VLAN için beklenen minimum durum:

```text
Interface pfSense içinde görünür.
Gateway IP .1/24 olarak atanmıştır.
Kurulum aşaması allow rule vardır.
DHCP sadece ihtiyaç olan VLAN'larda açıktır.
```

---

## Sırada Ne Var?

Segmentler hazır. Sırada Docker host, Kali/target, Wazuh, honeypot ve Windows servislerini doğru VLAN'lara yerleştirmek var.

---

## Hızlı Referans

```text
VLAN parent: vtnet1
Gateway pattern: 10.10.<VLAN>.1/24
Install DHCP pool: 10.10.<VLAN>.100-200
Temporary rule: source <VLAN net> -> any
Final firewall rules: later hardening phase
```
