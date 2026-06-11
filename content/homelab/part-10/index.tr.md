---
title: "Homelab Bölüm 10: Active Directory, DNS, DHCP ve Domain Join"
date: 2026-05-31T00:00:00+03:00
draft: false
build:
  list: local
description: "Windows Server 2022 ile domain controller, DNS/DHCP, pfSense DHCP relay ve Windows client domain join kurdum."
tags: ["homelab", "active-directory", "windows-server", "dns", "dhcp", "pfsense", "vlan"]
ShowToc: true
TocOpen: true
---

[Part 9]({{< ref "/homelab/part-9" >}}) ile malware-analysis segmentini kurmuştum. Bu bölümde Windows identity katmanını ekledim: AD DS, DNS, DHCP ve ilk domain-joined client.

Bu bölüm Sysmon, Wazuh Windows agent, Atomic Red Team, Group Policy ve detection engineering için temel hazırladı.

---

## Ne İnşa Ettim?

```text
Server:       Windows Server 2022 Desktop Experience
VM name:      prod-winserver
VLAN:         20 / DEFENCE
IP:           10.10.20.20/24
Gateway:      10.10.20.1
Domain:       ad.plumy.lab
NetBIOS:      AD
Roles:        AD DS, DNS, DHCP
Client VLAN:  60 / CLIENT
Client test:  domain join and ad\plumy login
Telemetry:    Wazuh agent on DC and client
```

{{< slideshow >}}
  {{< slide src="../part-6/img/winserver-vm-confirm.png" caption="Windows Server VM VLAN 20 üzerinde." >}}
  {{< slide src="../part-6/img/client-domain-whoami.png" caption="Domain login doğrulandı: ad\\plumy." >}}
{{< /slideshow >}}

---

## Neden Önemli?

Active Directory lab'e daha gerçekçi Windows davranışı ekledi: domain user, privileged account, DNS discovery, Group Policy, logon event ve endpoint yönetimi.

Benim için amaç sadece AD kurmak değildi. Detection ve investigation tarafında daha gerçekçi bağlam üreten bir Windows ortamı kurmak istedim.

---

## Topoloji Kesiti

```text
DEFENCE VLAN 20
  |-- Windows Server / DC / DNS / DHCP: 10.10.20.20

CLIENT VLAN 60
  |-- Windows client: DHCP lease 10.10.60.100

pfSense
  |-- routes VLANs
  |-- relays DHCP to 10.10.20.20
```

---

## Kurulum Adımları

### Windows Server Desktop Experience

AD öğrenmek için Desktop Experience seçtim. Server Core daha temiz olabilir, ama öğrenme aşamasında Server Manager, DNS Manager, DHCP Manager ve ADUC gibi GUI araçları bana daha iyi feedback verdi.

{{< slideshow >}}
  {{< slide src="../part-6/img/windows-server-desktop-experience.png" caption="Windows Server 2022 Desktop Experience seçildi." >}}
  {{< slide src="../part-6/img/add-roles-installation-type.png" caption="Role-based or feature-based installation." >}}
{{< /slideshow >}}

Server'a static IP verdim:

```text
IP address: 10.10.20.20
Subnet:     255.255.255.0
Gateway:    10.10.20.1
DNS:        10.10.20.20
```

VirtIO storage driver: `amd64\2k22\viostor.inf`.

### AD DS ve DNS

```text
Active Directory Domain Services
DNS Server
Management tools
```

Yeni forest:

```text
Root domain name: ad.plumy.lab
NetBIOS:          AD
```

{{< slideshow >}}
  {{< slide src="../part-6/img/promote-domain-controller.png" caption="Server domain controller'a promote ediliyor." >}}
  {{< slide src="../part-6/img/ad-new-forest.png" caption="ad.plumy.lab forest oluşturuluyor." >}}
  {{< slide src="../part-6/img/ad-dc-options.png" caption="DNS ve Global Catalog enabled." >}}
  {{< slide src="../part-6/img/dns-role-online.png" caption="DNS role online." >}}
{{< /slideshow >}}

DNS delegation warning bu lab için normal. `ad.plumy.lab` için parent public zone olmadığı için bu uyarıyı bekliyordum.

### Kullanıcıları Oluşturma

Domain içinde günlük logon için normal kullanıcı, ayrıcalıklı işler için ayrı admin hesabı oluşturdum.

```text
Normal user:       workstation logon ve testler
Admin account:     join, AD değişiklikleri, privileged actions
Built-in admin:    günlük işlerde kullanılmıyor
```

Bu ayrım sonraki Wazuh/Sysmon event'lerinde kimin hangi işlemi yaptığını okumayı kolaylaştıracak.

### DHCP

DHCP role sonrası AD authorization adımını tamamladım. Böylece DHCP server domain içinde yetkili hale geldi.

{{< slideshow >}}
  {{< slide src="../part-6/img/dhcp-post-deploy-config.png" caption="DHCP Server AD içinde authorize ediliyor." >}}
{{< /slideshow >}}

Scope pattern:

```text
Scope name:     vlanXX
Subnet:         10.10.XX.0/24
Pool:           10.10.XX.100 - 10.10.XX.200
Router option:  10.10.XX.1
DNS server:     10.10.20.20
DNS domain:     ad.plumy.lab
```

{{< slideshow >}}
  {{< slide src="../part-6/img/dhcp-scope-range.png" caption="DHCP scope range örneği." >}}
  {{< slide src="../part-6/img/dhcp-scope-gateway.png" caption="Router option pfSense gateway'e işaret ediyor." >}}
  {{< slide src="../part-6/img/dhcp-scopes-active.png" caption="Windows DHCP scopes active." >}}
{{< /slideshow >}}

### pfSense DHCP Relay

pfSense DHCP Relay, pfSense DHCP Server açıkken çalışmıyor. Bu yüzden geçiş sırasını kontrollü yaptım:

```text
1. Windows DHCP scopes oluştur.
2. Kritik hostları static/reservation yap.
3. pfSense DHCP Server'ı kapat.
4. DHCP Relay aç.
5. Upstream server: 10.10.20.20.
```

{{< slideshow >}}
  {{< slide src="../part-6/img/pfsense-dhcp-relay.png" caption="pfSense DHCP Relay, Windows Server'a forward ediyor." >}}
{{< /slideshow >}}

### Client Domain Join

Client tarafında beklediğim lease şu şekildeydi:

```text
IP address: 10.10.60.100
Subnet:     255.255.255.0
Gateway:    10.10.60.1
DNS server: 10.10.20.20
Suffix:     ad.plumy.lab
```

```cmd
ipconfig /all
ping 10.10.60.1
ping 10.10.20.20
nslookup ad.plumy.lab
```

Join:

```text
sysdm.cpl -> Computer Name -> Change -> Member of: Domain -> ad.plumy.lab
```

{{< slideshow >}}
  {{< slide src="../part-6/img/client-domain-join.png" caption="Windows client ad.plumy.lab domain'e katılıyor." >}}
  {{< slide src="../part-6/img/client-domain-whoami.png" caption="Reboot sonrası domain identity doğrulandı." >}}
{{< /slideshow >}}

Burada küçük ama önemli bir not var: Windows Home domain join yapamaz. Pro, Enterprise, Education veya Server gerekir. `N` sadece media-feature varyantıdır.

### Wazuh Windows Agent Baseline

Firewall hardening ve Sysmon testlerinden önce Windows Server/DC ve Windows client üzerinde Wazuh agent'ı ayağa kaldırdım. Bu adım Part 11'deki telemetry path doğrulamasının ön koşulu oldu.

```text
Wazuh manager: 10.10.10.99
DC agent:      WIN-LJCFR6SN8UF / 10.10.20.20
Client agent:  client1 / 10.10.60.100
Version:       Wazuh 4.14.5
```

{{< slideshow >}}
  {{< slide src="../part-6/img/wazuh-agent-dc-running.png" caption="DC üzerinde Wazuh agent running durumda; authentication key görselde redact edildi." >}}
  {{< slide src="../part-6/img/wazuh-agent-client-running.png" caption="Windows client üzerinde Wazuh agent running durumda; manager IP 10.10.10.99." >}}
{{< /slideshow >}}

Buradaki amaç detection yazmak değildi. Windows endpoint'lerin SIEM'e konuşabildiğini firewall hardening öncesinde baseline olarak görmek istedim.

---

## Karşılaştığım Problemler

**Core yerine GUI seçtim.** AD öğrenirken GUI araçları bana daha iyi geri bildirim verdi.

**DHCP Relay için pfSense DHCP kapalı olmalı.** Her interface'te DHCP Server açık kalırsa relay enable olmuyor.

**İlk lease gecikti.** VLAN 60 client hemen IP almamış gibi göründü, ama yenileme/bekleme sonrası `10.10.60.100` aldı.

**Windows agent enrollment ayrı doğrulanmalı.** MSI kurulumu bitse bile manager IP, auth key ve firewall path doğru değilse agent Wazuh'ta aktif görünmez.

---

## Ne Öğrendim?

AD'de DNS'in merkezde olduğunu öğrendim. Domain client'ları public DNS veya pfSense DNS değil, DC DNS kullanmalı.

Windows DHCP de AD lab için değerli oldu; DNS suffix ve DNS server bilgisini VLAN'lara düzenli dağıtabiliyor.

---

## Doğrulama Kanıtı

```cmd
ipconfig /release
ipconfig /renew
ipconfig /all
nslookup ad.plumy.lab
nltest /dsgetdc:ad.plumy.lab
whoami
whoami /fqdn
gpresult /r
Get-Service WazuhSvc
```

Beklenen:

```text
Client 10.10.60.100/24 alır
Gateway 10.10.60.1
DNS 10.10.20.20
Domain join başarılı
whoami -> ad\plumy
WazuhSvc -> Running
```

---

## Sırada Ne Var?

Identity, DNS, DHCP ve domain-joined client hazır. Sıradaki büyük bölüm final pfSense firewall rules / segmentation pass.

---

## Hızlı Referans

```powershell
Install-WindowsFeature AD-Domain-Services,DNS,DHCP -IncludeManagementTools
```

```powershell
Add-DhcpServerv4Scope `
  -Name "vlan60" `
  -StartRange 10.10.60.100 `
  -EndRange 10.10.60.200 `
  -SubnetMask 255.255.255.0

Set-DhcpServerv4OptionValue `
  -ScopeId 10.10.60.0 `
  -Router 10.10.60.1 `
  -DnsServer 10.10.20.20 `
  -DnsDomain "ad.plumy.lab"
```

```cmd
ipconfig /renew
nslookup ad.plumy.lab
nltest /dsgetdc:ad.plumy.lab
```
