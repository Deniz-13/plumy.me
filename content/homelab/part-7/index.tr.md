---
title: "Homelab Bölüm 7: Snort IDS ve T-Pot Honeypot Telemetry"
date: 2026-05-28T12:00:00+03:00
draft: false
build:
  list: local
description: "pfSense üzerinde Snort IDS kurdum, HONEYPOT VLAN'a T-Pot ekledim, logları Wazuh'a gönderdim ve decoder/query problemlerini çözdüm."
tags: ["homelab", "snort", "ids", "tpot", "honeypot", "wazuh", "suricata", "pfsense"]
ShowToc: true
TocOpen: true
---

[Part 6]({{< ref "/homelab/part-6" >}}) ile Wazuh temelini kurmuştum. Bu bölümde detection ve deception katmanı ekledim: pfSense üzerinde Snort, HONEYPOT VLAN içinde T-Pot.

Amacım sadece tool çalıştırmak değildi. Anlamlı telemetry üretmek, bunun Wazuh'a ulaştığını görmek ve event kaybolursa nerede kaybolduğunu anlayabilmek istedim.

---

## Ne İnşa Ettim?

```text
Snort:        pfSense package, IDS mode
Interfaces:   WAN and LAN
Rules:        Community + focused ET Open categories
Honeypot:     T-Pot in VLAN 50
Telemetry:    T-Pot Suricata eve.json -> Wazuh agent
Test source:  Kali in VLAN 40
```

{{< slideshow >}}
  {{< slide src="../part-3/img/snort-02-installed.png" caption="Snort paketi pfSense üzerinde kuruldu." >}}
  {{< slide src="../part-3/img/tpot-vm-specs.png" caption="T-Pot VM HONEYPOT VLAN için oluşturuldu." >}}
  {{< slide src="../part-3/img/wazuh-suricata-events.png" caption="T-Pot Suricata event'leri Wazuh içinde parse edildi." >}}
{{< /slideshow >}}

---

## Neden Önemli?

Bu noktada lab detection ortamı gibi davranmaya başladı. Kali'den trafik üretip Snort/T-Pot/Wazuh zincirinde ne göründüğünü test edebiliyorum.

```text
packet -> Snort alert -> pfSense system log -> Wazuh syslog listener -> decoder -> searchable event
```

---

## Topoloji Kesiti

```text
Kali 10.10.40.102  ->  HONEYPOT VLAN 50  ->  T-Pot 10.10.50.x
        |
        |-- test traffic

pfSense Snort -> pfSense syslog -> Wazuh 10.10.10.99
T-Pot agent -> Wazuh 10.10.10.99
T-Pot Suricata eve.json -> Wazuh localfile JSON
```

---

## Kurulum Adımları

### Snort

```text
System -> Package Manager -> Available Packages -> snort -> Install
Services -> Snort
```

Blocking'i kapalı bıraktım. Bu kurulumda Snort'u IPS değil IDS mode'da kullandım.

{{< slideshow >}}
  {{< slide src="../part-3/img/snort-01-search.png" caption="pfSense üzerinde Snort package aranıyor." >}}
  {{< slide src="../part-3/img/snort-03-wan-iface.png" caption="WAN interface ve Send Alerts to System Log." >}}
  {{< slide src="../part-3/img/snort-04-lan-iface.png" caption="LAN interface aynı mantıkla yapılandırıldı." >}}
  {{< slide src="../part-3/img/snort-05-iface-overview.png" caption="Snort interface'leri çalışıyor, blocking disabled." >}}
{{< /slideshow >}}

pfSense tarafında RAM kısıtlı olduğu için rule seçimini küçük tuttum:

```text
snort-community.rules
emerging-scan.rules
emerging-exploit.rules
emerging-malware.rules
```

{{< slideshow >}}
  {{< slide src="../part-3/img/snort-06-global-rules.png" caption="Snort global rule kaynakları aktif." >}}
  {{< slide src="../part-3/img/snort-07-update.png" caption="Rule update başarılı şekilde tamamlandı." >}}
  {{< slide src="../part-3/img/snort-10-alerts.png" caption="İlk Snort alert pfSense içinde görünüyor." >}}
{{< /slideshow >}}

### Wazuh Snort Decoder

pfSense Snort CSV alert ürettiği için built-in `snort-full` / `snort-fast` decoder'ları eşleşmedi. Bu yüzden local decoder yazdım.

`/var/ossec/etc/decoders/local_decoder.xml`:

```xml
<decoder name="snort-csv">
  <prematch>^\d\d/\d\d/\d\d-\d\d:\d\d:\d\d.\d+ ,</prematch>
</decoder>
<decoder name="snort-csv-fields">
  <parent>snort-csv</parent>
  <regex>"([^"]+)",(\w+),([\d.]+),(\d*),([\d.]+),(\d*),\d+,([^,]+),(\d+)</regex>
  <order>id,protocol,srcip,srcport,dstip,dstport,extra_data,severity</order>
</decoder>
```

Rule:

`/var/ossec/etc/rules/local_rules.xml`:

```xml
<group name="snort,">
  <rule id="100100" level="5">
    <decoded_as>snort-csv</decoded_as>
    <description>Snort alert</description>
  </rule>
</group>
```

Test:

```bash
sudo /var/ossec/bin/wazuh-logtest
curl http://testmynids.org/uid/index.html
```

Doğru query:

```text
rule.id:100100
decoder.name:snort-csv
```

### T-Pot

T-Pot'u HONEYPOT VLAN'a kurdum. Kaynak tüketimini makul tutmak için mini/light profile seçtim.

```bash
env bash -c "$(curl -sL https://github.com/telekom-security/tpotce/raw/master/install.sh)"
```

{{< slideshow >}}
  {{< slide src="../part-3/img/tpot-ip-config.png" caption="T-Pot HONEYPOT VLAN içinde IP alıyor." >}}
  {{< slide src="../part-3/img/wazuh-agents-dashboard.png" caption="Honeypot agent eklendikten sonra Wazuh agent görünümü." >}}
{{< /slideshow >}}

### T-Pot Suricata Logslarını Wazuh'a Forward Etmek

Wazuh agent host aktivitesini görür, ama asıl saldırı verisi T-Pot loglarındadır. Bu yüzden Suricata `eve.json` dosyasını JSON localfile olarak ekledim:

```bash
sudo find /home/honeypot/tpotce/data -name "*.json"
```

```xml
<localfile>
  <log_format>json</log_format>
  <location>/home/honeypot/tpotce/data/suricata/log/eve.json</location>
</localfile>
```

```bash
sudo /var/ossec/bin/wazuh-logtest
curl http://testmynids.org/uid/index.html
```

```bash
sudo systemctl restart wazuh-agent
```

---

## Karşılaştığım Problemler

**Snort alert var ama Wazuh'ta yoktu.** Alert'in önce pfSense system log'a düşmesi, sonra Wazuh tarafından decode edilmesi gerekiyordu.

**`snort` diye aramak yanlıştı.** Event vardı ama içinde `snort` kelimesi yoktu. `rule.id:100100` ve `decoder.name:snort-csv` daha doğru query oldu.

**T-Pot Attack Map boş kaldı.** Internal RFC1918 IP geolocate edilemediği için map boştu. Event'ler aslında Kibana/Wazuh içindeydi.

---

## Ne Öğrendim?

Boş dashboard'ın veri yok anlamına gelmediğini öğrendim. Forwarding, decoder, indexing ve query ayrı ayrı doğrulanmalı.

Görselleştirmeleri de ground truth gibi okumamak gerektiğini gördüm. İç lab trafiğinde dünya haritası yerine `src_ip` ve raw event araması daha güvenilir.

---

## Doğrulama Kanıtı

```bash
curl http://testmynids.org/uid/index.html
sudo /var/ossec/bin/wazuh-logtest
nmap -sV --top-ports 50 10.10.50.50
ssh root@10.10.50.50
```

```text
rule.id:100100
data.src_ip:10.10.40.102
agent.name:honeypot
```

---

## Sırada Ne Var?

Detection ve honeypot telemetry çalışıyor. Sırada lab'e uzaktan güvenli erişim kurmak var; pfSense'i internete açmadan yönetim yolunu çözmem gerekiyor.

---

## Hızlı Referans

```xml
<localfile>
  <log_format>json</log_format>
  <location>/home/honeypot/tpotce/data/suricata/log/eve.json</location>
</localfile>
```
