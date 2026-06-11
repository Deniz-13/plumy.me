---
title: "Homelab Bölüm 6: Wazuh SIEM Temeli"
date: 2026-05-28
draft: false
build:
  list: local
description: "SIEM VLAN içinde Wazuh kurdum, Docker host agent ekledim, Docker telemetry açtım ve pfSense loglarını syslog ile yönlendirdim."
tags: ["homelab", "wazuh", "siem", "pfsense", "syslog", "docker", "monitoring"]
ShowToc: true
TocOpen: true
---

[Part 5]({{< ref "/homelab/part-5" >}}) sonunda Kali ve Metasploitable hazırdı. Bu bölümde ilk visibility katmanını ekledim: Wazuh SIEM.

Amacım her şeyi aynı anda izlemek değildi. Önce Wazuh server, Docker host agent, Docker event collection ve pfSense syslog forwarding düzgün çalışsın istedim.

---

## Ne İnşa Ettim?

```text
Wazuh VM:       10.10.10.99
Segment:        SIEM / VLAN 10
RAM:            8 GB
CPU:            4 vCPU
Disk:           128 GB
Agent target:   Docker host 10.10.30.100
Syslog source:  pfSense
```

{{< slideshow >}}
  {{< slide src="../part-3/img/wazuh-vm-specs.png" caption="Wazuh VM: 8 GB RAM, 4 vCPU, 128 GB disk." >}}
  {{< slide src="../part-3/img/wazuh-first-login.png" caption="İlk Wazuh dashboard login." >}}
{{< /slideshow >}}

---

## Neden Önemli?

Lab sadece saldırı çalıştırmamalı; saldırıların ve sistem değişikliklerinin loglarda nasıl göründüğünü de göstermeli.

Bu bölüm işin plumbing kısmı. Sonraki bölümlerde detection tuning bunun üstüne gelecek.

Wazuh ileride şu soruların merkezi olacak:

```text
Sysmon bu tekniği yakaladı mı?
Snort alert gönderdi mi?
Docker servis restart oldu mu?
pfSense flow'u logladı mı?
```

---

## Topoloji Kesiti

```text
Docker host 10.10.30.100 -- Wazuh agent --> Wazuh 10.10.10.99
pfSense ------------------ syslog UDP 514 --> Wazuh 10.10.10.99
```

Kali ve Metasploitable'a özellikle agent kurmadım. Attacker/target noise'unu SIEM'e agent ile değil, network ve hedef logları üzerinden gözlemlemek istiyorum.

---

## Kurulum Adımları

### Wazuh All-in-One

Jumpbox üzerinden erişim:

```bash
ssh -J admin@10.10.1.50 plumy@10.10.10.99
sudo apt update && sudo apt upgrade -y
curl -sO https://packages.wazuh.com/4.14/wazuh-install.sh
sudo bash ./wazuh-install.sh -a
```

Installer sonunda dashboard URL'sini ve üretilen admin parolasını yazdırıyor.

{{< slideshow >}}
  {{< slide src="../part-3/img/wazuh-ubuntu-install-03.png" caption="Wazuh VM SIEM VLAN IP'sini alıyor." >}}
  {{< slide src="../part-3/img/wazuh-ubuntu-install-07.png" caption="SSH açık; jumpbox üzerinden yönetilecek." >}}
{{< /slideshow >}}

### Docker Host Agent

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

Docker listener:

```xml
<wodle name="docker-listener">
  <disabled>no</disabled>
  <attempts>5</attempts>
  <run_on_start>yes</run_on_start>
  <interval>10m</interval>
</wodle>
```

```bash
sudo usermod -aG docker wazuh
sudo systemctl restart wazuh-agent
```

{{< slideshow >}}
  {{< slide src="../part-3/img/wazuh-agents-dashboard.png" caption="Agent'lar Wazuh dashboard'da görünüyor." >}}
{{< /slideshow >}}

### Docker Event Fix

Docker listener çalışıyor gibi görünüyordu ama structured event'ler boştu. Eksik bağımlılığın agent host üzerindeki Python Docker modülü olduğunu gördüm.

```bash
python3 -c "import docker; print(docker.__version__)"
# ModuleNotFoundError görürsen dependency eksik
sudo apt update
sudo apt install -y python3-docker
sudo systemctl restart wazuh-agent
```

{{< slideshow >}}
  {{< slide src="../part-3/img/wazuh-docker-events-dockerhost.png" caption="python3-docker sonrası Docker lifecycle event'leri Wazuh içinde." >}}
{{< /slideshow >}}

### pfSense Syslog

pfSense üzerinde Wazuh agent çalıştırmadım. Bunun yerine logları syslog ile Wazuh'a gönderdim. Wazuh manager tarafında `ossec.conf` içine şu remote listener'ı ekledim:

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
sudo systemctl restart wazuh-manager
```

Sonra pfSense remote logging ayarını yaptım ve `syslogd` servisini yeniden başlattım.

{{< slideshow >}}
  {{< slide src="../part-3/img/pfsense-remote-logging.png" caption="pfSense remote logging Wazuh'a yönlendiriliyor." >}}
  {{< slide src="../part-3/img/wazuh-archives-tail.png" caption="pfSense logları Wazuh archives.log içinde görülüyor." >}}
{{< /slideshow >}}

---

## Karşılaştığım Problemler

**4 GB RAM yetmedi.** All-in-one Wazuh için 4 GB rahat değildi. 8 GB ile dashboard aramaları daha kullanılabilir oldu.

**Docker listener boş event üretti.** `python3-docker` kurulunca structured event'ler gelmeye başladı.

**pfSense syslog sırası önemli.** Wazuh manager restart sonrası pfSense `syslogd` tekrar başlatılmalı.

---

## Ne Öğrendim?

Collection'ın visibility demek olmadığını öğrendim. Bir log source tanımlı olabilir, servis çalışıyor görünebilir ve dashboard yine de anlamlı sonuç göstermeyebilir. Collection, decode, indexing ve search aşamalarını ayrı ayrı doğrulamak gerekiyor.

Bu bölümde segmentasyonun değeri de görünmeye başladı. Wazuh SIEM'de, Docker CONTAINER'da, pfSense ikisinin arasında route ediyor. Telemetry path'i tesadüfi değil, açıkça tanımlı.

---

## Doğrulama Kanıtı

```bash
sudo systemctl status wazuh-manager
sudo systemctl status wazuh-agent
sudo tail -f /var/ossec/logs/archives/archives.log
```

Docker event testi:

```bash
docker restart portainer
```

Wazuh query:

```text
agent.name:prod-docker
data.docker.Action:*
```

---

## Sırada Ne Var?

SIEM temeli çalışıyor. Sırada Snort IDS ve T-Pot honeypot telemetry var. Böylece lab sadece log üreten sistemlerden değil, attack activity'yi gözlemleyebildiğim bir ortamdan oluşmaya başlayacak.

---

## Hızlı Referans

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
