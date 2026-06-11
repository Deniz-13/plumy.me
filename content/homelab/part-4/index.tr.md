---
title: "Homelab Bölüm 4: Docker Host, Portainer ve Macvlan"
date: 2026-05-24
draft: false
build:
  list: local
description: "VLAN 30 üzerinde Ubuntu Server, Docker, Portainer, macvlan networking ve n8n platformunu kurdum."
tags: ["homelab", "docker", "portainer", "macvlan", "ubuntu", "n8n", "networking"]
ShowToc: true
TocOpen: true
---

[Part 3]({{< ref "/homelab/part-3" >}}) sonunda VLAN yapısı hazırdı. Bu bölümde CONTAINER VLAN içinde Docker platformunu kurdum.

Amacım sadece Docker çalıştırmak değildi. Container trafiğini ileride firewall ve SIEM tarafında tek tek görebilmek istedim. Bu yüzden önemli container'lara gerçek lab IP'leri verdim.

---

## Ne İnşa Ettim?

```text
VM name:       prod-docker
VM ID:         103
OS:            Ubuntu Server 24.04
VLAN:          30 / CONTAINER
Host IP:       10.10.30.100
Docker UI:     Portainer CE
Macvlan net:   10.10.30.0/26
n8n IP:        10.10.30.10
```

{{< slideshow >}}
  {{< slide src="../part-1/img/ubuntu-vm-01-general.png" caption="Docker host VM: ID 103, prod-docker." >}}
  {{< slide src="../part-1/img/ubuntu-vm-07-network.png" caption="NIC vmbr1 üzerinde VLAN tag 30 ile CONTAINER segmentinde." >}}
  {{< slide src="../part-1/img/ubuntu-install-05.png" caption="Ubuntu installer VLAN 30'dan DHCP lease alıyor." >}}
{{< /slideshow >}}

---

## Neden Önemli?

Docker bridge NAT, tüm container'ları host IP'sinin arkasına saklar. Hızlı deneme için sorun değil, ama bu lab için istemediğim bir durumdu. Firewall rule ve SIEM event'lerinde gerçek servis IP'sini görmek istiyorum.

Macvlan ile container kendi MAC/IP'si olan ayrı bir makine gibi görünür.

Bu sayede ileride sorgular ve firewall kararları daha okunur hale gelir:

```text
source: 10.10.30.10  -> n8n
source: 10.10.30.20  -> vulnerable web app
source: 10.10.30.100 -> Docker host
```

---

## Topoloji Kesiti

```text
pfSense CONTAINER gateway: 10.10.30.1
        |
Docker host: 10.10.30.100
        |
macvlan network: 10.10.30.0/26
        |-- n8n / automation
        |-- vulnerable web apps
        |-- future pipeline services
```

IP aralıklarını özellikle çakışmayacak şekilde ayırdım:

```text
10.10.30.0/26      -> macvlan container block
10.10.30.100       -> Docker host
10.10.30.100-200   -> normal DHCP pool
```

---

## Kurulum Adımları

### Ubuntu Server

```text
Bridge:     vmbr1
VLAN tag:   30
Disk:       32 GB
CPU:        2 cores
RAM:        4 GB
SSH:        enabled
```

Ubuntu installer tarafında SSH'i kurulum sırasında açtım ve snap paket seçimini boş bıraktım. Docker'ı snap yerine resmi APT repository üzerinden kurmak istedim.

{{< slideshow >}}
  {{< slide src="../part-1/img/ubuntu-install-11.png" caption="Ubuntu profile: hostname prod-docker ve local user." >}}
  {{< slide src="../part-1/img/ubuntu-install-13.png" caption="OpenSSH kurulumda seçildi; host jumpbox üzerinden yönetilecek." >}}
  {{< slide src="../part-1/img/ubuntu-install-14-no-pkgs.png" caption="Featured snaps seçilmedi; Docker resmi APT repo üzerinden kurulacak." >}}
{{< /slideshow >}}

Host'a jumpbox üzerinden erişmek için SSH config'i bu şekilde tuttum:

```sshconfig
Host jumpbox
    HostName 10.10.1.50
    User admin

Host docker
    HostName 10.10.30.100
    User plumy
    ProxyJump jumpbox
```

### Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker run hello-world
```

Opsiyonel non-root Docker erişimi:

```bash
sudo usermod -aG docker plumy
newgrp docker
docker ps
```

Bu pratik, ama güvenlik bedeli var: `docker` grubu fiilen root yetkisine çok yakındır.

### Portainer

```bash
docker volume create portainer_data

docker run -d \
  -p 9443:9443 \
  --name portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

Portainer'a doğrudan açmak yerine tunnel ile eriştim:

```sh
ssh -L 9443:10.10.30.100:9443 admin@10.10.1.50
# browser: https://localhost:9443
```

{{< slideshow >}}
  {{< slide src="../part-1/img/portainer-01.png" caption="Portainer ilk admin kullanıcısı." >}}
  {{< slide src="../part-1/img/portainer-03-user.png" caption="Quick setup local Docker environment'a bağlanıyor." >}}
  {{< slide src="../part-1/img/portainer-04-live-connect.png" caption="Portainer local Docker environment'ı görüyor." >}}
{{< /slideshow >}}

### Macvlan

Docker host üzerindeki parent interface `ens18`. Macvlan network'ü Portainer üzerinden bu interface'e bağladım.

```text
Driver:           macvlan
Parent:           ens18
Subnet:           10.10.30.0/26
Gateway:          10.10.30.1
Manual attach:    enabled
```

{{< slideshow >}}
  {{< slide src="../part-2/img/macvlan-01-ipa.png" caption="Docker host interface: ens18." >}}
  {{< slide src="../part-2/img/macvlan-02.png" caption="Portainer macvlan config." >}}
  {{< slide src="../part-2/img/macvlan-03.png" caption="Macvlan network manual container attach ile oluşturuluyor." >}}
{{< /slideshow >}}

Compose örneği:

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    networks:
      vlan30-dockerhosts:
        ipv4_address: 10.10.30.10

networks:
  vlan30-dockerhosts:
    external: true
```

{{< slideshow >}}
  {{< slide src="../part-2/img/containers-02.png" caption="Portainer içinde container'a fixed macvlan IP atanıyor." >}}
  {{< slide src="../part-2/img/containers-04.png" caption="Container listesi: servisler artık ayrı IP'lerle görünüyor." >}}
  {{< slide src="../part-2/img/n8n-01.png" caption="n8n container 10.10.30.10 IP'si ile oluşturuldu." >}}
  {{< slide src="../part-2/img/n8n-02.png" caption="n8n web UI jumpbox tunnel üzerinden erişilebilir." >}}
{{< /slideshow >}}

---

## Karşılaştığım Problemler

**Host kendi macvlan container'ına erişemiyor.** Docker host'tan container IP'sine `curl` bazen takılı kalabilir. Jumpbox'tan çalışıyorsa bu bozuk container değil, normal macvlan host isolation davranışıdır.

**Gateway `.1`.** Broadcast adresleri gateway değildir. VLAN 30 gateway'i pfSense üzerindeki `10.10.30.1`.

**Range çakışması olmamalı.** Macvlan için `/26`, DHCP için `.100-200` aralığını ayırdım.

---

## Ne Öğrendim?

Docker networking tercihinin aynı zamanda güvenlik ve observability tercihi olduğunu öğrendim. Default bridge kolaydır ama kimliği saklar. Macvlan daha katı çalışır, fakat container kimliğini pfSense ve Wazuh tarafında görünür kılar.

Macvlan testini Docker host'tan değil, başka bir host'tan yapmak gerektiğini de öğrendim. Jumpbox veya Kali bu iş için daha doğru doğrulama noktaları.

---

## Doğrulama Kanıtı

```bash
docker ps
docker network ls
docker inspect n8n | grep 10.10.30.10
```

Jumpbox üzerinden:

```sh
curl -I http://10.10.30.10:5678
```

SSH tunnel:

```sh
ssh -L 5678:10.10.30.10:5678 admin@10.10.1.50
# browser: http://localhost:5678
```

---

## Sırada Ne Var?

Container platformu hazır. Artık vulnerable web app'ler, automation servisleri ve ileride phishing triage gibi servisler için ayrı IP'li bir alanım var. Sırada PENTEST VLAN'a Kali ve Metasploitable eklemek var.

---

## Hızlı Referans

```text
Docker host:       10.10.30.100
Macvlan network:   10.10.30.0/26
Gateway:           10.10.30.1
n8n:               10.10.30.10
```

```bash
docker volume create portainer_data
docker run -d -p 9443:9443 --name portainer --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data portainer/portainer-ce:latest
```
