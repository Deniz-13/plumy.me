---
title: "Homelab Part 2: Alpine Jumpbox and pfSense Access"
date: 2026-05-20
draft: false
build:
  list: local
description: "I add a small Alpine jumpbox, fix early DHCP and DNS issues, and reach the pfSense web UI through SSH forwarding."
tags: ["homelab", "alpine", "jumpbox", "pfsense", "ssh", "networking"]
ShowToc: true
TocOpen: true
---

In [Part 1]({{< ref "/homelab/part-1" >}}), pfSense booted with a WAN side and a LAN side. In this part, I add the first internal Linux VM: a small Alpine jumpbox on the pfSense LAN.

This jumpbox becomes my first stable door into the lab. I use it for SSH, local forwarding, package installs, and later access to internal services without exposing those services directly.

---

## What I Built

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
  {{< slide src="../part-1/img/alpine-vm-01-general.png" caption="Alpine VM creation in Proxmox: VM ID 102, name prod-alpine." >}}
  {{< slide src="../part-1/img/alpine-vm-07-network.png" caption="Network device on vmbr1. The jumpbox sits behind pfSense, not on the upstream LAN." >}}
  {{< slide src="../part-1/img/alpine-vm-08-confirm.png" caption="Final Alpine VM confirmation before installation." >}}
{{< /slideshow >}}

---

## Why This Matters

The jumpbox gives the lab a controlled management path. Instead of opening every internal service to my laptop, I connect to one small Linux machine and forward only the service I need.

That pattern becomes useful later for:

- pfSense web access;
- Portainer and Wazuh dashboards;
- internal Linux administration;
- keeping management access predictable while firewall rules evolve.

---

## Topology Slice

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

## Build Steps

### Install Alpine

The installer starts from the live ISO:

```sh
setup-alpine
```

I kept the VM small:

```text
CPU:      1 core
RAM:      1 GB
Disk:     16 GB
Bridge:   vmbr1
```

### Fix APK and Disk Setup

The installer hit DNS and repository problems during mirror selection and disk setup. Instead of fighting the wizard, I fixed the repositories directly.

```sh
ip link set eth0 up
setup-apkrepos
apk update
setup-disk -m sys /dev/sda
```

After reboot, I brought the interface up and requested a new DHCP lease:

```sh
ip link set eth0 up
udhcpc -i eth0
ip a
```

Expected result:

```text
eth0 -> 10.10.1.50/24
gateway -> 10.10.1.1
```

### Install Base Tools

```sh
apk add openssh sudo nano tmux curl
apk upgrade
rc-update add sshd
service sshd start
```

Create a non-root admin user:

```sh
adduser admin
addgroup admin wheel
visudo
```

In `visudo`, enable:

```text
%wheel ALL=(ALL) ALL
```

{{< slideshow >}}
  {{< slide src="../part-1/img/alpine-visudo.png" caption="Granting sudo to the wheel group on Alpine." >}}
{{< /slideshow >}}

Validate:

```sh
ssh admin@10.10.1.50
sudo whoami
```

### Enable pfSense LAN DHCP

From the pfSense console, I configured the LAN side:

```text
LAN IP:              10.10.1.1
Subnet bit count:    24
Upstream gateway:    empty
DHCP server on LAN:  yes
DHCP range start:    10.10.1.100
DHCP range end:      10.10.1.200
Web configurator:    HTTP for first access
```

The key detail is simple but important: `10.10.1.1` is the firewall's host IP. `10.10.1.0/24` is the network address, so it must not be assigned to pfSense.

---

## Getting Into pfSense Web UI

This was my first real troubleshooting chain in the lab. My laptop was on `192.168.1.0/24`, but the pfSense LAN was `10.10.1.0/24`. Nothing worked until I fixed all four layers.

### 1. Add a Route from macOS

```sh
sudo route -n add -net 10.10.1.0/24 192.168.1.87
```

`192.168.1.87` was the pfSense WAN address in my lab.

### 2. Disable WAN Private/Bogon Blocking

pfSense assumes WAN is the internet. In my lab, WAN is also private RFC1918 space, so the default private and bogon block settings broke access.

From pfSense shell:

```sh
sed -i '' 's|<blockpriv>1</blockpriv>|<blockpriv>0</blockpriv>|' /conf/config.xml
sed -i '' 's|<blockbogons>1</blockbogons>|<blockbogons>0</blockbogons>|' /conf/config.xml
/etc/rc.filter_configure
```

### 3. Add a Temporary WAN Pass Rule

```sh
echo "pass in quick on vtnet0 from any to any" | pfctl -f -
```

This rule is temporary. It disappears on firewall reload, so I used it only as a short bridge to reach the GUI.

### 4. Allow SSH Forwarding on Alpine

If SSH forwarding fails with `administratively prohibited`, enable forwarding:

```text
AllowTcpForwarding yes
GatewayPorts yes
```

Then:

```sh
service sshd restart
```

### Working Tunnel

```sh
ssh -L 8080:10.10.1.1:80 admin@10.10.1.50
```

Browser:

```text
http://localhost:8080
```

{{< slideshow >}}
  {{< slide src="../part-1/img/wizard-01-general.png" caption="pfSense setup wizard: hostname, domain, and DNS settings." >}}
  {{< slide src="../part-1/img/wizard-02-block-private.png" caption="Private/bogon blocking disabled on WAN because WAN is behind the home router in this lab." >}}
  {{< slide src="../part-1/img/wizard-03-lan.png" caption="LAN remains 10.10.1.1/24." >}}
  {{< slide src="../part-1/img/wizard-04-password.png" caption="Admin password changed during the wizard." >}}
{{< /slideshow >}}

After I reached the GUI, I replaced the temporary `pfctl` rule with a permanent WAN SSH allow rule for my laptop IP.

{{< slideshow >}}
  {{< slide src="../part-1/img/fw-wan-ssh-rule.png" caption="Permanent WAN rule: allow my MacBook to reach pfSense SSH." >}}
{{< /slideshow >}}

---

## Problems I Hit

**Alpine DNS failed during setup.** The installer changed resolver and repository files. I skipped the broken mirror step and fixed repositories after boot.

**`setup-disk` could not find `syslinux`.** The APK repository was not properly configured. `setup-apkrepos` plus `apk update` fixed it.

**pfSense GUI timed out.** The route, WAN private block, firewall rule, and SSH forwarding policy all had to be correct. The timeout did not tell me which layer was wrong.

**SSH forwarding policy can block the tunnel.** If SSH returns `administratively prohibited`, the issue is usually Alpine `sshd_config`, not pfSense. `AllowTcpForwarding yes` fixed it.

---

## What I Learned

The jumpbox is not only a convenience. It is a repeatable access pattern: expose one narrow SSH path, then tunnel to internal systems only when needed.

I also learned to troubleshoot reachability in layers. When the symptom is only "timeout," I check routing, firewall flags, firewall rules, and SSH forwarding separately instead of guessing.

---

## Validation Evidence

```sh
ssh admin@10.10.1.50
sudo whoami
ip a
ping -c 2 10.10.1.1
```

Tunnel validation:

```sh
ssh -L 8080:10.10.1.1:80 admin@10.10.1.50
```

Expected browser result:

```text
http://localhost:8080 -> pfSense GUI
```

---

## What This Enables Next

Now that pfSense is reachable from the GUI and Alpine is a stable internal access point, I can define the lab VLANs and start placing machines into purpose-built segments.

---

## Quick Reference

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
