---
title: "Segmentli Siber Güvenlik Homelab'i"
date: 2026-05-19
tags: ["homelab", "proxmox", "pfsense", "networking", "linux"]
showOnHome: true
---

Bu seride tek bir Proxmox node üzerinde kurduğum siber güvenlik homelab'ini anlatıyorum. Bu ortamı network öğrenmek, Windows identity çalışmak, SIEM telemetry toplamak, detection denemeleri yapmak, attack simulation çalıştırmak, honeypot incelemek, malware-analysis izolasyonu kurmak ve automation projeleri geliştirmek için kullanıyorum.

Amacım rastgele VM'lerden oluşan kalabalık bir ortam kurmak değildi. Küçük ama gerçekçi bir lab kurmak istedim: her network'ün görevi belli olsun, iki network arasında izin verilen her yolu açıklayabileyim.

<!--more-->

{{< slideshow >}}
  {{< slide src="topology.png" caption="Mantıksal topoloji — Proxmox + pfSense önünde Tailscale uzaktan erişim, her fonksiyon kendi VLAN'ında (SIEM, DEFENCE, CONTAINER, PENTEST, HONEYPOT, CLIENT, ISOLATED). Büyütmek için tıkla." >}}
{{< /slideshow >}}

## Seri Haritası

| Bölüm | Konu |
|---:|---|
| 1 | Proxmox, pfSense ve ilk internal bridge |
| 2 | Alpine jumpbox ve pfSense'e güvenli erişim |
| 3 | VLAN'lar, gateway'ler ve ilk DHCP düzeni |
| 4 | Docker, Portainer, n8n ve macvlan |
| 5 | Pentest segmentinde Kali ve Metasploitable |
| 6 | Wazuh SIEM temeli ve ilk log kaynakları |
| 7 | Snort IDS, T-Pot ve honeypot telemetry |
| 8 | CGNAT arkasında Tailscale remote access |
| 9 | İzole malware-analysis segmenti |
| 10 | Active Directory, DNS, DHCP ve domain join |
| 11 | Final pfSense firewall kuralları ve segmentasyon hardening |

## VLAN'lar

| VLAN | Subnet | Amaç |
|---:|---|---|
| LAN | `10.10.1.0/24` | ilk erişim, jumpbox ve acil yönetim yolu |
| 10 | `10.10.10.0/24` | SIEM ve monitoring sistemleri |
| 20 | `10.10.20.0/24` | Active Directory, DNS ve DHCP servisleri |
| 30 | `10.10.30.0/24` | Docker host, Portainer, automation ve container'lar |
| 40 | `10.10.40.0/24` | Kali ve bilerek zafiyetli bırakılmış hedefler |
| 50 | `10.10.50.0/24` | honeypot sistemleri ve attack telemetry |
| 60 | `10.10.60.0/24` | Windows client'lar ve endpoint telemetry |
| 99 | `10.10.99.0/24` | izole malware-analysis makineleri |
