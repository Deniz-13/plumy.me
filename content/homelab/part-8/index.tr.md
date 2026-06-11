---
title: "Homelab Bölüm 8: CGNAT Arkasında Tailscale Remote Access"
date: 2026-05-29T00:00:00+03:00
draft: false
build:
  list: local
description: "CGNAT arkasında Tailscale ile remote access kurdum, pfSense'i subnet router yaptım, route approval ve Proxmox out-of-band erişimini ekledim."
tags: ["homelab", "tailscale", "vpn", "cgnat", "pfsense", "proxmox", "remote-access"]
ShowToc: true
TocOpen: true
---

[Part 7]({{< ref "/homelab/part-7" >}}) sonrası pratik bir ihtiyaç çıktı: lab evde dururken ben uzaktan çalışacaktım. pfSense'i internete açmak istemediğim için Tailscale kullandım.

Buradaki güvenlik kuralım basit: pfSense web UI, SSH veya Wazuh dashboard public internete açılmayacak.

---

## Ne İnşa Ettim?

```text
pfSense:       Tailscale subnet router
Advertised:    10.10.0.0/16
Clients:       Mac and phone
Recovery:      Proxmox üzerinde ayrı Tailscale node
Inbound ports: public internet'e açık yok
```

{{< slideshow >}}
  {{< slide src="../part-4/img/tailscale-machines-subnet.png" caption="pfSense Tailscale subnet router olarak görünüyor." >}}
  {{< slide src="../part-4/img/tailscale-pfsense-rule.png" caption="Tailscale interface lab network'lerine kontrollü geçiş veriyor." >}}
  {{< slide src="../part-4/img/tailscale-wazuh-mobile-test.png" caption="Wazuh mobile data üzerinden Tailscale ile erişilebilir." >}}
{{< /slideshow >}}

---

## Neden Önemli?

CGNAT, inbound WireGuard veya port forwarding işini zorlaştırıyor. Tailscale ile public inbound port açmadan lab'e kendi cihazlarımdan erişebiliyorum.

Proxmox'a ayrıca Tailscale kurmamın sebebi de bu: pfSense bir VM. pfSense veya subnet router bozulursa hypervisor'a ayrı bir out-of-band erişim yolum olmalı.

---

## Topoloji Kesiti

```text
Remote Mac / phone
       |
   Tailscale
       |
pfSense tailscale0
       |
10.10.0.0/16 lab VLANs
```

Proxmox ayrıca kendi Tailscale node'u olarak duruyor; bu, pfSense VM kapansa bile hypervisor recovery yolunu koruyor.

---

## Kurulum Adımları

### CGNAT Doğrulama

Public IP checker tek başına yeterli değil. Asıl kontrol router'ın WAN adresidir.

```text
Public IP checker: normal public IP gibi
Router WAN:        100.71.x.x
Result:            CGNAT
```

{{< slideshow >}}
  {{< slide src="../part-4/img/tailscale-public-ip-check.png" caption="Public IP checker." >}}
  {{< slide src="../part-4/img/tailscale-router-wan-cgnat.png" caption="Router WAN CGNAT range içinde." >}}
{{< /slideshow >}}

### pfSense Tailscale

```text
System -> Package Manager -> Available Packages -> Tailscale -> Install
Advertised route: 10.10.0.0/16
```

pfSense headless olduğu için browser login flow yerine auth key kullandım.

{{< slideshow >}}
  {{< slide src="../part-4/img/tailscale-package-search.png" caption="pfSense Tailscale paketi." >}}
  {{< slide src="../part-4/img/tailscale-auth-key.png" caption="Auth key oluşturuldu." >}}
  {{< slide src="../part-4/img/tailscale-pfsense-auth.png" caption="pfSense tailnet'e eklendi." >}}
{{< /slideshow >}}

### Route Approval

Route advertise etmek tek başına yetmedi. Tailscale admin console içinde route'u approve etmem, client tarafında da route kabulünü açmam gerekti.

```bash
sudo tailscale set --accept-routes
netstat -rn | grep 10.10
```

Beklenen:

```text
10.10/16 -> utun...
```

{{< slideshow >}}
  {{< slide src="../part-4/img/tailscale-approve-route.png" caption="Lab subnet route approve edildi." >}}
  {{< slide src="../part-4/img/tailscale-route-table.png" caption="macOS route table artık Tailscale utun interface'e gidiyor." >}}
{{< /slideshow >}}

### Eski Route Temizliği

Part 5'te kullandığım eski local route, ev dışında olduğumda yanlış gateway'e gitmeye çalışabiliyordu. Bu yüzden onu temizledim.

```bash
sudo route -n delete -net 10.10.1.0/24
sudo tailscale set --accept-routes
sudo tailscale down && sudo tailscale up
```

### pfSense Firewall Rule

Route çalıştığı halde iç hostlar açılmıyorsa sorun genellikle forwarding rule'dadır. pfSense'in kendisine ulaşmak başka, `tailscale0` üzerinden lab VLAN'larına forward etmek başka katman.

```text
Interface:    Tailscale
Action:       Pass
Protocol:     Any
Source:       100.64.0.0/10
Destination:  10.10.0.0/16
```

{{< slideshow >}}
  {{< slide src="../part-4/img/tailscale-pfsense-rule.png" caption="Tailscale interface üzerinden lab network'lerine izin." >}}
{{< /slideshow >}}

### Proxmox Out-of-Band

pfSense bir VM olduğu için tek recovery yolum pfSense olmamalı. Bu yüzden Proxmox host'a da doğrudan Tailscale kurdum.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
```

```text
https://100.x.y.z:8006
ssh root@100.x.y.z
```

---

## Karşılaştığım Problemler

**Public IP yetmedi.** Public IP checker normal görünse de router WAN CGNAT içindeydi.

**Route advertise edildi ama kullanılmadı.** Admin console approve ve client `accept-routes` gerekiyordu.

**pfSense açılıyor, iç host açılmıyordu.** Routing çalışıyordu ama Tailscale interface firewall rule eksikti.

**pfSense subnet router tek recovery yolu olamaz.** pfSense bir VM olduğu için Proxmox'a ayrı Tailscale node kurmak gerekiyor.

---

## Ne Öğrendim?

Remote access'in firewall'a açılan geçici bir delik olmaması gerektiğini öğrendim. Tailscale private erişim sağlıyor; pfSense ise lab'e forward kararını vermeye devam ediyor.

Route problemi ile firewall forwarding problemini ayırmayı da öğrendim. pfSense açılıp Wazuh açılmıyorsa route vardır; büyük ihtimalle `tailscale0` interface rule'u eksiktir.

---

## Doğrulama Kanıtı

```bash
netstat -rn | grep 10.10
tailscale ping 10.10.1.1
ping -c 3 10.10.10.99
nc -vz 10.10.10.99 443
```

Servis kontrolleri:

```text
https://10.10.1.1       -> pfSense
https://10.10.10.99     -> Wazuh
ssh admin@10.10.1.50    -> jumpbox
```

---

## Sırada Ne Var?

Remote access çözüldü. Artık lab'in yanında olmak zorunda kalmadan daha ağır segmentleri kurabilirim. Sırada malware-analysis segmenti var.

---

## Hızlı Referans

```bash
sudo tailscale set --accept-routes
netstat -rn | grep 10.10
sudo route -n delete -net 10.10.1.0/24
```

```text
pfSense Tailscale rule:
Source 100.64.0.0/10 -> Destination 10.10.0.0/16 -> Pass
```
