---
title: "Homelab Part 8: Tailscale Remote Access Behind CGNAT"
date: 2026-05-29T00:00:00+03:00
draft: false
build:
  list: local
description: "I use Tailscale for remote access behind CGNAT, advertise the lab prefix from pfSense, fix stale routes, and add Proxmox out-of-band access."
tags: ["homelab", "tailscale", "vpn", "cgnat", "pfsense", "proxmox", "remote-access"]
ShowToc: true
TocOpen: true
---

In [Part 7]({{< ref "/homelab/part-7" >}}), I added Snort and T-Pot telemetry. Then a practical problem changed the order of the project: I needed to work remotely while the lab stayed at home.

I did not want to expose pfSense management to the public internet. Tailscale became the clean remote access layer.

---

## What I Built

```text
pfSense:       Tailscale subnet router
Advertised:    10.10.0.0/16
Clients:       Mac and phone
Recovery:      Tailscale also installed directly on Proxmox
Inbound ports: none exposed to the internet
```

{{< slideshow >}}
  {{< slide src="../part-4/img/tailscale-machines-subnet.png" caption="pfSense appears in Tailscale as a subnet router." >}}
  {{< slide src="../part-4/img/tailscale-pfsense-rule.png" caption="The Tailscale interface rule controls forwarding into lab networks." >}}
  {{< slide src="../part-4/img/tailscale-wazuh-mobile-test.png" caption="Wazuh reachable over Tailscale from outside the home network." >}}
{{< /slideshow >}}

---

## Why This Matters

CGNAT makes inbound WireGuard or port forwarding painful or impossible. Tailscale keeps the lab private while still making it reachable from my own devices.

The security rule is simple: no pfSense web UI, SSH, or Wazuh dashboard should be exposed to the public internet.

---

## Topology Slice

```text
Remote Mac / phone
       |
   Tailscale
       |
pfSense tailscale0
       |
10.10.0.0/16 lab VLANs
```

Proxmox also gets its own Tailscale node so I can recover the hypervisor even if the pfSense VM or subnet router breaks.

---

## Build Steps

### Confirm CGNAT

A public IP checker is not enough. The router WAN address is the source of truth.

```text
Public IP checker: normal-looking public IP
Router WAN:        100.71.x.x
Result:            CGNAT
```

{{< slideshow >}}
  {{< slide src="../part-4/img/tailscale-public-ip-check.png" caption="Public IP checker output." >}}
  {{< slide src="../part-4/img/tailscale-router-wan-cgnat.png" caption="Router WAN address in the carrier-grade NAT range." >}}
{{< /slideshow >}}

### Install Tailscale on pfSense

```text
System -> Package Manager -> Available Packages -> Tailscale -> Install
```

Because pfSense is headless, I used an auth key instead of the browser login flow.

{{< slideshow >}}
  {{< slide src="../part-4/img/tailscale-package-search.png" caption="Installing the Tailscale package on pfSense." >}}
  {{< slide src="../part-4/img/tailscale-auth-key.png" caption="Generating a Tailscale auth key." >}}
  {{< slide src="../part-4/img/tailscale-pfsense-auth.png" caption="Authenticating pfSense to the tailnet." >}}
{{< /slideshow >}}

Advertised route:

```text
10.10.0.0/16
```

### Approve and Accept Routes

Advertising a route is not enough. I also need to approve it in the Tailscale admin console, and clients must accept it.

```bash
sudo tailscale set --accept-routes
netstat -rn | grep 10.10
```

Expected route:

```text
10.10/16 -> utun...
```

{{< slideshow >}}
  {{< slide src="../part-4/img/tailscale-approve-route.png" caption="Approving the advertised lab subnet route." >}}
  {{< slide src="../part-4/img/tailscale-route-table.png" caption="macOS route table now points 10.10/16 to Tailscale." >}}
{{< /slideshow >}}

### Remove Old Local Route

My old home-only static route could conflict when I was away from home.

```bash
sudo route -n delete -net 10.10.1.0/24
sudo tailscale set --accept-routes
sudo tailscale down && sudo tailscale up
```

### Add pfSense Tailscale Firewall Rule

The route worked before forwarding did. pfSense itself was reachable, but internal lab hosts were not reachable until I added a rule on the Tailscale interface.

```text
Interface:    Tailscale
Action:       Pass
Protocol:     Any
Source:       100.64.0.0/10
Destination:  10.10.0.0/16
```

{{< slideshow >}}
  {{< slide src="../part-4/img/tailscale-pfsense-rule.png" caption="pfSense rule allowing tailnet traffic into lab networks." >}}
{{< /slideshow >}}

### Add Proxmox Out-of-Band Access

pfSense is a VM. If I break pfSense, I lose the subnet router. So I also install Tailscale directly on Proxmox.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
```

Access:

```text
https://100.x.y.z:8006
ssh root@100.x.y.z
```

---

## Problems I Hit

**Public IP looked normal, but WAN was CGNAT.** The router WAN address proved inbound port forwarding was not reliable.

**Route advertised but not used.** I had to approve it in the admin console and enable route acceptance on the client.

**pfSense was reachable, internal hosts were not.** That meant routing was working, but pfSense firewall forwarding from `tailscale0` was missing.

**pfSense as subnet router is not enough for recovery.** Proxmox needed its own Tailscale node.

---

## What I Learned

Remote access has to be part of the architecture, not a temporary hole in the firewall. Tailscale gives me management access without public inbound exposure, but pfSense still controls forwarding into the lab.

I also learned to separate route problems from firewall problems: if pfSense opens but Wazuh does not, the subnet route exists and the forwarding rule is likely missing.

---

## Validation Evidence

From mobile data:

```bash
netstat -rn | grep 10.10
tailscale ping 10.10.1.1
ping -c 3 10.10.10.99
nc -vz 10.10.10.99 443
```

Service checks:

```text
https://10.10.1.1       -> pfSense
https://10.10.10.99     -> Wazuh
ssh admin@10.10.1.50    -> jumpbox
```

---

## What This Enables Next

With remote access solved, I can continue building heavier lab segments without being physically next to the machine: malware analysis, Windows domain services, and later firewall hardening.

---

## Quick Reference

```bash
sudo tailscale set --accept-routes
netstat -rn | grep 10.10
sudo route -n delete -net 10.10.1.0/24
```

```text
pfSense Tailscale rule:
Source 100.64.0.0/10 -> Destination 10.10.0.0/16 -> Pass
```
