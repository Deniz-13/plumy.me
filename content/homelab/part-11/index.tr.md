---
title: "Homelab Bölüm 11: Final pfSense Firewall Kuralları ve Segmentasyon Hardening"
date: 2026-06-02T00:00:00+03:00
draft: false
build:
  list: local
description: "Kurulum aşamasındaki allow-any kurallarını malware isolation, Windows client, container, honeypot, pentest ve management path'leri için açık pfSense firewall policy'ye dönüştürdüm."
tags: ["homelab", "pfsense", "firewall", "segmentation", "wazuh", "sysmon", "tailscale", "vlan"]
ShowToc: true
TocOpen: true
---

[Part 10](../part-10/) ile Windows identity katmanını eklemiştim: Active Directory, DNS, DHCP ve domain-joined client. Bu bölümde lab'i "kurulum sırasında herkes herkesle konuşsun" halinden açık bir firewall policy'ye taşıdım.

Amacım karmaşık kural yazmak değildi. Amacım her izinli yolun açıklanabilir olmasıydı.

---

## Ne İnşa Ettim?

Geçici build-phase allow rule'larını segmentli pfSense policy ile değiştirdim:

```text
Default duruş:    deny by default
Management:       Tailscale + break-glass LAN/WAN erişimi
Jumpbox:          Alpine üzerinden Kali SSH yolu
Client VLAN:      sadece AD, DNS, Wazuh, Windows Update
Container VLAN:   sadece Docker host + n8n explicit egress
Honeypot VLAN:    sadece Wazuh telemetry
Pentest VLAN:     internet egress yok
Isolated VLAN:    ingress yok, egress yok
```

{{< slideshow >}}
  {{< slide src="img/tailscale-management-plane.png" caption="Tailscale explicit management path'lere daraltıldı." >}}
  {{< slide src="img/client-ad-wazuh-rules.png" caption="CLIENT kuralları sadece AD, DNS, Wazuh ve update path'lerini bırakıyor." >}}
  {{< slide src="img/container-explicit-egress.png" caption="Container egress sadece named workload'lara veriliyor." >}}
{{< /slideshow >}}

---

## Neden Önemli?

Segmentasyon sadece VLAN ve subnet değildir. Bir segment, ancak firewall policy'si rolüyle uyumluysa anlamlı hale gelir.

Kurulum aşamasında geniş allow rule'lar faydalıydı. VM'ler update aldı, installer indirdi, domain'e join oldu, package pull yaptı ve hızlı troubleshoot edildi. Ama bu kuralları final halde bırakmak mimarinin güvenlik değerini büyük ölçüde silerdi.

Bu geçiş lab'i daha gerçekçi hale getirdi:

- endpoint'ler domain servislerine erişiyor ama tüm lab'e erişmiyor;
- Wazuh telemetry alıyor ama bu geniş erişim bahanesi olmuyor;
- vulnerable sistemler contained kalıyor;
- malware-analysis hostları dışarı kaçamıyor;
- management erişimi normal network reachability'den ayrılıyor.

---

## Topoloji Kesiti

```text
Tailscale / MacBook
  |-- pfSense management
  |-- Proxmox management
  |-- Alpine jumpbox
  |-- Wazuh dashboard

DEFENCE / MANAGEMENT
  |-- DC / DNS / DHCP
  |-- Wazuh
  |-- Alpine jumpbox

CLIENT
  |-- Wazuh agent ve Sysmon olan Windows client

CONTAINER
  |-- Docker host
  |-- n8n
  |-- vulnerable container'lar

PENTEST
  |-- Kali
  |-- vulnerable target

HONEYPOT
  |-- T-Pot

ISOLATED
  |-- FLARE-VM
  |-- REMnux
```

---

## Kurulum Adımları

### VLAN 99'u İzole Etmek

Malware-analysis segmenti lab'in en katı policy'si. Bu normal bir user veya server network değil.

```text
ISOLATED -> any: blocked
Diğer VLAN'lar -> ISOLATED: blocked
```

{{< slideshow >}}
  {{< slide src="img/isolated-interface-block.png" caption="ISOLATED interface deny rule." >}}
  {{< slide src="img/isolated-rules-final.png" caption="Final ISOLATED rules: egress yok." >}}
  {{< slide src="img/client-isolated-block-order.png" caption="Her VLAN migrate edilirken block rule broad allow rule'un üstünde olmalı." >}}
{{< /slideshow >}}

Buradaki kritik tasarım noktası şu: malware-analysis isolation hafızaya veya disipline bağlı olmamalı. Ben bir hostun ne yaptığını unutsam bile network path kapalı kalmalı.

### Jumpbox'ı Management Yoluna Taşımak

Alpine VM erken kurulum altyapısı olarak başlamıştı. Lab olgunlaşınca onu management tarafına taşıdım ve stabil adres verdim.

```text
Jumpbox: 10.10.10.50
Role:    controlled SSH pivot
```

{{< slideshow >}}
  {{< slide src="img/jumpbox-vlan10-ip.png" caption="Alpine jumpbox management/defence tarafına stabil IP ile taşındı." >}}
  {{< slide src="img/jumpbox-rules.png" caption="Jumpbox rules: pfSense management ve Kali'ye SSH." >}}
{{< /slideshow >}}

Jumpbox, Tailscale'in yerine geçmiyor. Tailscale remote access plane; jumpbox ise içerideki administrative pivot.

### Management ve Domain Servislerini Sıkılaştırmak

Management tarafında DC, Wazuh ve jumpbox var. Bu yüzden bu segment kullanışlı kalmalı ama wide open olmamalı.

```text
DC -> Internet:     update/NTP only
DC -> Wazuh:        reserved telemetry path
Jumpbox -> pfSense: SSH/HTTPS
Jumpbox -> Kali:    SSH
Management -> ISOLATED: blocked
```

{{< slideshow >}}
  {{< slide src="img/management-dc-rules.png" caption="Broad access yerine explicit path'lerle management ve DC rules." >}}
{{< /slideshow >}}

Part 10'da Windows DC ve client için Wazuh agent baseline'ını hazırladım. Buradaki firewall kararı: telemetry path'leri any-any erişimin arkasına saklanmıyor, açıkça tanımlanıyor.

### Client VLAN'i Sıkılaştırmak

Windows client'ın domain controller ve Wazuh'a ihtiyacı var, tüm lab'e değil.

```text
CLIENT -> DC:     DNS, NTP, Kerberos, LDAP, SMB, RPC
CLIENT -> Wazuh:  Wazuh agent traffic
CLIENT -> Internet: Windows Update HTTP/HTTPS
CLIENT -> ISOLATED: blocked
CLIENT -> everything else: blocked
```

{{< slideshow >}}
  {{< slide src="img/client-ad-wazuh-rules.png" caption="CLIENT domain ve telemetry servislerine erişebiliyor." >}}
  {{< slide src="img/client-final-block.png" caption="Final CLIENT rule kullanılmayan trafiği kapatıyor." >}}
{{< /slideshow >}}

Bu sayede Windows endpoint AD ve Sysmon çalışmaları için gerçekçi kalıyor ama lab'in geri kalanına ücretsiz pivot olmuyor.

### Honeypot Egress'i Kısıtlamak

Honeypot segmenti gözlemlenmeli, güvenilmemeli.

```text
HONEYPOT -> Wazuh: TCP 1514
HONEYPOT -> ISOLATED: blocked
HONEYPOT -> everything else: blocked
```

{{< slideshow >}}
  {{< slide src="img/honeypot-wazuh-only.png" caption="HONEYPOT sadece Wazuh'a telemetry gönderebiliyor." >}}
{{< /slideshow >}}

Bu T-Pot'u sensor island yapıyor. Gördüğünü raporlayabiliyor ama lab'e veya internete genel erişim almıyor.

### Container Egress'i Kısıtlamak

Docker host update ve image pull için çıkışa ihtiyaç duyuyor. n8n outbound web access istiyor. Vulnerable container'ların internete ihtiyacı yok.

```text
Docker host -> Wazuh: TCP 1514
Docker host -> DC:    DNS
Docker host -> Web:   HTTP/HTTPS
n8n -> DC:            DNS
n8n -> Web:           HTTP/HTTPS
Other containers:     blocked by default
```

{{< slideshow >}}
  {{< slide src="img/container-explicit-egress.png" caption="Sadece Docker host ve n8n explicit outbound erişim alıyor." >}}
{{< /slideshow >}}

Buradaki faydalı kural basit: container egress VLAN'a topluca verilmiyor. Named workload bazında veriliyor.

### Pentest VLAN'i Kapatmak

Kali'nin bu aşamada direkt internet erişimine ihtiyacı yok. Araştırma ve indirmeleri MacBook'ta yapıyorum, Kali'ye jumpbox üzerinden ulaşıyorum.

```text
Jumpbox -> Kali: SSH allowed
Kali -> Internet: blocked
PENTEST -> ISOLATED: blocked
PENTEST -> everything else: blocked
```

{{< slideshow >}}
  {{< slide src="img/pentest-default-deny.png" caption="PENTEST broad outbound access almıyor." >}}
{{< /slideshow >}}

Bu Kali'yi lab içindeki attack VM olarak tutuyor, general-purpose workstation'a çevirmiyor.

### Management ve Break-Glass Erişimi Tanımlamak

Tailscale'i primary management plane olarak tuttum. LAN ve WAN erişimi ise sadece MacBook'tan fallback yolu.

```text
MacBook over Tailscale -> pfSense SSH/HTTPS
MacBook over Tailscale -> Proxmox SSH/8006
MacBook over Tailscale -> Wazuh HTTPS
MacBook over Tailscale -> Jumpbox SSH
Tailscale -> ISOLATED: blocked
Tailscale -> everything else: blocked
```

{{< slideshow >}}
  {{< slide src="img/tailscale-management-plane.png" caption="Tailscale management destination'larla sınırlı." >}}
  {{< slide src="img/wan-break-glass.png" caption="WAN break-glass access sadece MacBook alias'ı ile sınırlı." >}}
  {{< slide src="img/lan-break-glass.png" caption="LAN, genel lab erişimi değil local fallback path olarak kaldı." >}}
{{< /slideshow >}}

Tasarım kararım bilinçliydi: management erişimi sadece home network'te fiziksel olarak bulunmaya değil, authenticated access'e ve bilinen admin hostlara bağlı olmalı.

---

## Karşılaştığım Problemler

**Interface yönü önemli.** pfSense rule'u trafiğin girdiği interface'te değerlendirir. CLIENT-to-DC rule'u DC'nin interface'inde değil, CLIENT tabında olmalı.

**`This Firewall` interface address'ten daha geniş.** Dar management rule'larında `LAN address` veya `WAN address`, `This Firewall`'dan daha hassas olabilir.

**Tailscale source object değil, interface.** Tailscale tabında source hâlâ MacBook'un Tailscale IP'si gibi bir IP veya alias.

**DHCP reservation, unusual client identifier ile sinir bozabiliyor.** Docker host için DHCP server'ın oluşturduğu stabil reservation'ı kabul ettim ve alias'ı o adrese göre yazdım.

**Pass rule'lar default allow dururken sadece dokümantasyon gibi kalabilir.** Allow list'in anlamlı olması için final deny rule şart.

---

## Ne Öğrendim?

Firewall hardening'in çoğunlukla yön ve sahiplik meselesi olduğunu öğrendim. Her VLAN için üç soruya cevap vermem gerekti:

```text
Bu segment ne tüketebilir?
Bu segment ne yayınlayabilir?
Buradan ne asla erişilebilir olmamalı?
```

Telemetry'nin de birinci sınıf network path olarak ele alınması gerektiğini öğrendim. Wazuh erişimi geniş rule'lardan yanlışlıkla miras kalmamalı; her ilgili segmentten açıkça izinli olmalı.

En büyük zihinsel değişim convenience ile architecture'ı ayırmak oldu. Build-phase access faydalıdır, ama son kullanma tarihi olmalı.

---

## Doğrulama Kanıtı

Kuralları pratik reachability testleriyle doğruladım:

```text
Kali sadece jumpbox üzerinden SSH ile erişilebilir
Kali direct internet erişimi kapalı
CLIENT domain discovery çalışıyor
CLIENT Wazuh/Sysmon telemetry Wazuh'a ulaşıyor
HONEYPOT Wazuh'a raporlayabiliyor
Docker host ve n8n sadece gerekli egress'i koruyor
ISOLATED routed lab segmentlerinden erişilemez
Tailscale management path'leri çalışıyor
```

{{< slideshow >}}
  {{< slide src="img/client-domain-controller-test.png" caption="Firewall pass sonrası CLIENT domain controller'ı bulabiliyor." >}}
{{< /slideshow >}}

### Sysmon Telemetry Smoke Test

Attack simulation'a geçmeden önce, hardening sonrası endpoint telemetry'nin hâlâ Wazuh'a ulaştığını doğruladım.

Windows client'a Sysmon kurdum, Wazuh agent configuration içine Sysmon Operational channel'ını ekledim, agent'ı restart ettim ve küçük bir PowerShell process event ürettim.

Wazuh Discover içinde şu query `client1` event'lerini döndürdü:

```text
data.win.system.providerName:"Microsoft-Windows-Sysmon"
```

Event'lerde `powershell.exe`, parent process metadata ve client agent identity görünüyordu. Bu henüz detection engineering değil. Sadece firewall değişikliğinin telemetry path'i bozmadığını kanıtlıyor.

---

## Sırada Ne Var?

Lab'de artık identity, endpoint telemetry, network telemetry ve firewall segmentation hazır. Part 12'de controlled attack simulation ve raporlama aşamasına geçeceğim: küçük bir Atomic Red Team test seti çalıştırmak, Wazuh/Sysmon event'lerini toplamak ve detection'ların gerçekten ne gösterdiğini açıklamak.

---

## Hızlı Referans

```text
Default rule model:
  gerekli service path'leri allow
  ISOLATED'i explicit block
  geri kalan her şeyi block
```

```text
Core telemetry:
  CLIENT   -> WAZUH TCP 1514
  DC       -> WAZUH TCP 1514
  DOCKER   -> WAZUH TCP 1514
  HONEYPOT -> WAZUH TCP 1514
```

```text
Core identity:
  CLIENT -> DC DNS/Kerberos/LDAP/SMB/RPC
```

```text
Management:
  MacBook Tailscale IP -> pfSense / Proxmox / Wazuh / Jumpbox
  MacBook LAN/WAN IP   -> pfSense break-glass only
```
