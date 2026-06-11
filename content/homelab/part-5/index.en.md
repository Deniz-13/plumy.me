---
title: "Homelab Part 5: Kali and Metasploitable Target Access"
date: 2026-05-25
draft: false
build:
  list: local
description: "I add the first attacker and target machines, import Metasploitable into Proxmox, install Kali, and validate access inside VLAN 40."
tags: ["homelab", "kali", "metasploitable", "proxmox", "pentest", "vlan", "zfs"]
ShowToc: true
TocOpen: true
---

In [Part 4]({{< ref "/homelab/part-4" >}}), I created the Docker platform. In this part, I add the first classic offensive-security pair: Kali as the attacker and Metasploitable as the intentionally vulnerable target.

Both machines live in the PENTEST VLAN. This keeps practice traffic away from the rest of the lab until I deliberately allow a path through pfSense.

---

## What I Built

```text
Segment:          PENTEST
VLAN:             40
Gateway:          10.10.40.1
Kali IP:          10.10.40.102
Metasploitable:   10.10.40.100
```

{{< slideshow >}}
  {{< slide src="../part-2/img/kali-vm-config.png" caption="Kali VM network configuration: vmbr1 with VLAN tag 40." >}}
  {{< slide src="../part-2/img/metas-08-check-config.png" caption="Metasploitable VM hardware: disk on local-zfs and network on VLAN 40." >}}
{{< /slideshow >}}

---

## Why This Matters

A cybersecurity lab needs targets, but target placement matters. Metasploitable should not sit on a management LAN or a production-like domain segment. It belongs in a controlled attack segment where I decide which paths exist.

This lets later firewall work become meaningful:

```text
PENTEST -> HONEYPOT     allowed for testing
PENTEST -> CLIENT       controlled attack simulations only
PENTEST -> SIEM         usually blocked except explicit management paths
```

---

## Topology Slice

```text
PENTEST VLAN 40 / 10.10.40.0/24
        |
        |-- Kali Linux          10.10.40.102
        |-- Metasploitable 2    10.10.40.100
        |
pfSense gateway: 10.10.40.1
```

---

## Build Steps

### Import Metasploitable

Metasploitable ships as a ready disk image, not as a normal ISO installer. The Proxmox flow is:

```text
Create empty VM -> download image -> import disk -> attach disk -> set boot order
```

On Proxmox:

```bash
cd /var/lib/vz/images/104
wget https://downloads.metasploit.com/data/metasploitable/metasploitable-linux-2.0.0.zip
unzip metasploitable-linux-2.0.0.zip
qm importdisk 104 Metasploitable.vmdk local-zfs
```

{{< slideshow >}}
  {{< slide src="../part-2/img/metas-vm-hardware.png" caption="Metasploitable VM created without a normal installer disk." >}}
  {{< slide src="../part-2/img/metas-01-wget.png" caption="Downloading the Metasploitable archive on the Proxmox host." >}}
  {{< slide src="../part-2/img/metas-04.png" caption="Importing the VMDK into Proxmox storage with qm importdisk." >}}
  {{< slide src="../part-2/img/metas-07.png" caption="Imported disk attached to the VM and placed in the boot order." >}}
{{< /slideshow >}}

### Fix the ZFS Volume Reference

The first boot failed with:

```text
TASK ERROR: unable to parse zfs volume name '104/Metasploitable.qcow2'
```

The disk existed, but the VM config referenced it incorrectly. ZFS expects the `vm-<id>-disk-<n>` naming format.

```bash
zfs list | grep 104
vi /etc/pve/qemu-server/104.conf
```

Correct disk line:

```text
virtio0: local-zfs:vm-104-disk-1,iothread=1,size=32G
```

{{< slideshow >}}
  {{< slide src="../part-2/img/metas-zfs-fix-01.png" caption="The ZFS parse error shown during VM start." >}}
  {{< slide src="../part-2/img/metas-zfs-fix-02.png" caption="Correcting the VM disk reference inside 104.conf." >}}
  {{< slide src="../part-2/img/metas-zfs-fix-03.png" caption="zfs list confirms the real volume name." >}}
{{< /slideshow >}}

### Install Kali

Kali used the normal graphical installer. The important Proxmox setting is the same: `vmbr1` with VLAN tag `40`.

{{< slideshow >}}
  {{< slide src="../part-2/img/kali-install-01.png" caption="Kali graphical installer start." >}}
  {{< slide src="../part-2/img/kali-install-06.png" caption="Guided disk partitioning for the Kali VM." >}}
  {{< slide src="../part-2/img/kali-install-10.png" caption="Kali software selection." >}}
  {{< slide src="../part-2/img/kali-install-13.png" caption="Kali installation complete in the PENTEST VLAN." >}}
{{< /slideshow >}}

### Make the Lab Route Persistent on macOS

Early in the lab, I used a local route from my Mac to reach `10.10.0.0/16` through the home-side path. Routes added with `route add` disappear after reboot, so I made the route persistent with a LaunchDaemon.

```bash
sudo route -n add -net 10.10.0.0/16 192.168.1.87
netstat -rn | grep 10.10
```

The persistent file lives at:

```text
/Library/LaunchDaemons/com.homelab.route.plist
```

And runs:

```text
/sbin/route -n add -net 10.10.0.0/16 192.168.1.87
```

This route is later replaced by Tailscale for remote access. Still, documenting it matters because it explained why access broke after a Mac reboot.

---

## Problems I Hit

**Ready-made VM images are not ISO installs.** I had to create an empty VM first, import the disk, attach it, and set the boot order.

**The ZFS disk reference was wrong.** Proxmox had the disk, but the VM config referenced the filename instead of the ZFS volume name.

**macOS routes are not persistent.** `route add` solved access only until reboot. For repeatable local access, it needed a LaunchDaemon.

---

## What I Learned

The PENTEST VLAN gives me a safe place for noisy tools and vulnerable systems. Kali and Metasploitable can talk directly to each other, while pfSense controls whether that traffic can leave the segment.

I also got a practical Proxmox lesson: storage backends matter. Importing a disk onto ZFS is not just copying a file; the VM config must point to the correct ZFS volume name.

---

## Validation Evidence

From Kali:

```bash
ip addr
ping -c 3 10.10.40.1
ping -c 3 10.10.40.100
nmap -sV 10.10.40.100
```

Metasploitable web access through the jumpbox:

```bash
ssh -L 8081:10.10.40.100:80 admin@10.10.1.50
# browser: http://localhost:8081
```

---

## What This Enables Next

With an attacker and a vulnerable target in place, I can now add SIEM visibility and start checking whether logs, IDS alerts, and later detection rules actually observe the activity.

---

## Quick Reference

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
