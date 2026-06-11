---
title: "Homelab Part 6: Wazuh SIEM Foundation"
date: 2026-05-28
draft: false
build:
  list: local
description: "I stand up Wazuh in the SIEM VLAN, add the Docker host agent, enable Docker telemetry, and forward pfSense logs over syslog."
tags: ["homelab", "wazuh", "siem", "pfsense", "syslog", "docker", "monitoring"]
ShowToc: true
TocOpen: true
---

In [Part 5]({{< ref "/homelab/part-5" >}}), I added Kali and Metasploitable. In this part, I add the first visibility layer: Wazuh as the lab SIEM.

The goal is to centralize security telemetry without trying to monitor everything at once. I start with the Wazuh server, a Docker host agent, Docker event collection, and pfSense syslog forwarding.

---

## What I Built

```text
Wazuh VM:       10.10.10.99
Segment:        SIEM / VLAN 10
RAM:            8 GB
CPU:            4 vCPU
Disk:           128 GB
Agent target:   Docker host at 10.10.30.100
Syslog source:  pfSense
```

{{< slideshow >}}
  {{< slide src="../part-3/img/wazuh-vm-specs.png" caption="Wazuh VM sized with 8 GB RAM, 4 vCPU, and 128 GB disk." >}}
  {{< slide src="../part-3/img/wazuh-first-login.png" caption="First successful Wazuh dashboard login." >}}
{{< /slideshow >}}

---

## Why This Matters

The lab should not only run attacks. It should also show what those attacks and system changes look like in logs.

Wazuh becomes the place where I can later test questions like:

```text
Did Sysmon catch this technique?
Did Snort send the alert?
Did a Docker service restart?
Did pfSense record the flow?
```

This post is the plumbing. Later posts can tune detections on top of it.

---

## Topology Slice

```text
Docker host 10.10.30.100 -- Wazuh agent --> Wazuh 10.10.10.99
pfSense ------------------ syslog UDP 514 --> Wazuh 10.10.10.99
```

Kali and Metasploitable deliberately do not get agents. I want attacker and target noise to be observed from network and target logs, not by installing a defensive agent on the attacker box.

---

## Build Steps

### Install Wazuh All-in-One

Access through the jumpbox:

```bash
ssh -J admin@10.10.1.50 plumy@10.10.10.99
sudo apt update && sudo apt upgrade -y
curl -sO https://packages.wazuh.com/4.14/wazuh-install.sh
sudo bash ./wazuh-install.sh -a
```

The installer prints the dashboard URL and the generated admin password at the end.

{{< slideshow >}}
  {{< slide src="../part-3/img/wazuh-ubuntu-install-03.png" caption="Wazuh VM receives its SIEM VLAN address during Ubuntu installation." >}}
  {{< slide src="../part-3/img/wazuh-ubuntu-install-07.png" caption="SSH enabled so Wazuh can be managed through the jumpbox." >}}
{{< /slideshow >}}

### Install the Wazuh Agent on Docker Host

On the Docker host:

```bash
sudo su
apt-get install -y gnupg apt-transport-https
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --no-default-keyring \
  --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import
chmod 644 /usr/share/keyrings/wazuh.gpg

echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" \
  | tee -a /etc/apt/sources.list.d/wazuh.list
apt-get update
WAZUH_MANAGER="10.10.10.99" apt-get install -y wazuh-agent
systemctl daemon-reload
systemctl enable --now wazuh-agent
```

Enable Docker event collection in `/var/ossec/etc/ossec.conf`:

```xml
<wodle name="docker-listener">
  <disabled>no</disabled>
  <attempts>5</attempts>
  <run_on_start>yes</run_on_start>
  <interval>10m</interval>
</wodle>
```

Allow the agent user to read Docker events:

```bash
sudo usermod -aG docker wazuh
sudo systemctl restart wazuh-agent
```

{{< slideshow >}}
  {{< slide src="../part-3/img/wazuh-agents-dashboard.png" caption="Wazuh dashboard showing enrolled agents." >}}
{{< /slideshow >}}

### Fix Empty Docker Events

The Docker listener appeared to start, but structured Docker events were empty. The missing dependency was the Python Docker module on the agent host.

```bash
python3 -c "import docker; print(docker.__version__)"
# ModuleNotFoundError means the dependency is missing
sudo apt update
sudo apt install -y python3-docker
sudo systemctl restart wazuh-agent
```

{{< slideshow >}}
  {{< slide src="../part-3/img/wazuh-docker-events-dockerhost.png" caption="Docker lifecycle events appear in Wazuh after python3-docker is installed." >}}
{{< /slideshow >}}

### Forward pfSense Logs by Syslog

pfSense does not run a Wazuh agent in this lab. I forward its logs over syslog.

On Wazuh manager, add a remote syslog listener in `/var/ossec/etc/ossec.conf`:

```xml
<remote>
  <connection>syslog</connection>
  <port>514</port>
  <protocol>udp</protocol>
  <allowed-ips>10.10.0.0/16</allowed-ips>
  <local_ip>10.10.10.99</local_ip>
</remote>
```

Restart the manager:

```bash
sudo systemctl restart wazuh-manager
```

Then configure pfSense remote logging and restart `syslogd` from pfSense services.

{{< slideshow >}}
  {{< slide src="../part-3/img/pfsense-remote-logging.png" caption="pfSense remote logging pointed at the Wazuh manager." >}}
  {{< slide src="../part-3/img/wazuh-archives-tail.png" caption="Raw pfSense logs arriving in Wazuh archives.log." >}}
{{< /slideshow >}}

---

## Problems I Hit

**Wazuh needed more RAM than I first wanted.** 4 GB was not comfortable for the all-in-one stack. 8 GB made dashboard searches usable.

**Docker listener said it started but produced no structured events.** Installing `python3-docker` on the agent host fixed it.

**pfSense syslog ordering mattered.** If Wazuh restarts, I restart pfSense `syslogd` after the listener is back up.

---

## What I Learned

Collection is not the same as visibility. A log source can be configured, a service can say it is running, and the dashboard can still show nothing useful. I need to validate each stage: collection, decoding, indexing, and search.

This is also where the value of segmentation started to show up. Wazuh lives in SIEM, Docker lives in CONTAINER, and pfSense routes between them. The telemetry path is explicit instead of accidental.

---

## Validation Evidence

```bash
sudo systemctl status wazuh-manager
sudo systemctl status wazuh-agent
sudo tail -f /var/ossec/logs/archives/archives.log
```

Docker event test:

```bash
docker restart portainer
```

Wazuh queries:

```text
agent.name:prod-docker
data.docker.Action:*
```

---

## What This Enables Next

With the SIEM foundation working, I can add higher-value sensors: Snort on pfSense and T-Pot honeypot telemetry. That turns the lab from "systems with logs" into a place where attack activity can be observed and understood.

---

## Quick Reference

```bash
curl -sO https://packages.wazuh.com/4.14/wazuh-install.sh
sudo bash ./wazuh-install.sh -a
```

```xml
<remote>
  <connection>syslog</connection>
  <port>514</port>
  <protocol>udp</protocol>
  <allowed-ips>10.10.0.0/16</allowed-ips>
  <local_ip>10.10.10.99</local_ip>
</remote>
```

```bash
sudo apt install -y python3-docker
sudo systemctl restart wazuh-agent
```
