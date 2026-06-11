---
title: "Segmented Cybersecurity Homelab"
date: 2026-05-19
tags: ["homelab", "proxmox", "pfsense", "networking", "linux"]
showOnHome: true
---

This series documents my cybersecurity homelab on a single Proxmox node. I use it to learn networking, Windows identity, SIEM telemetry, detection work, attack simulation, honeypots, malware-analysis isolation, and automation.

The goal is not to build many random virtual machines. The goal is to build a small but realistic lab where each network has a clear job, and each path between networks can be explained.

<!--more-->

{{< slideshow >}}
  {{< slide src="topology.png" caption="Logical topology — Tailscale remote access in front of Proxmox + pfSense, each function in its own VLAN (SIEM, DEFENCE, CONTAINER, PENTEST, HONEYPOT, CLIENT, ISOLATED). Click to enlarge." >}}
{{< /slideshow >}}

## Series Map

| Part | Focus |
|---:|---|
| 1 | Proxmox, pfSense, and the first internal bridge |
| 2 | Alpine jumpbox and safe access to pfSense |
| 3 | VLANs, gateways, and early DHCP |
| 4 | Docker, Portainer, n8n, and macvlan |
| 5 | Kali and Metasploitable in the pentest segment |
| 6 | Wazuh SIEM foundation and first log sources |
| 7 | Snort IDS, T-Pot, and honeypot telemetry |
| 8 | Tailscale remote access behind CGNAT |
| 9 | Isolated malware-analysis segment |
| 10 | Active Directory, DNS, DHCP, and domain join |
| 11 | Final pfSense firewall rules and segmentation hardening |

## VLANs

| VLAN | Subnet | Purpose |
|---:|---|---|
| LAN | `10.10.1.0/24` | first access, jumpbox, and emergency management |
| 10 | `10.10.10.0/24` | SIEM and monitoring systems |
| 20 | `10.10.20.0/24` | defence services: Active Directory, DNS, and DHCP |
| 30 | `10.10.30.0/24` | Docker host, Portainer, automation, and containers |
| 40 | `10.10.40.0/24` | Kali and intentionally vulnerable targets |
| 50 | `10.10.50.0/24` | honeypots and attack telemetry |
| 60 | `10.10.60.0/24` | Windows clients and endpoint telemetry |
| 99 | `10.10.99.0/24` | isolated malware-analysis machines |
