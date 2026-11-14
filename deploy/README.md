# Deploy: bitta VPS

Bitta server, uchta konteyner: **postgres**, **api** (NestJS + bot + ertalabki ish), **caddy** (web fayllar, `/api` ni API'ga uzatadi, HTTPS sertifikatini o'zi oladi). Redis kerak emas.

```
Internet ──443──► caddy ──/api/*──► api ──► postgres
                   └── /srv (web, SPA)
```

Bu to'plam 2026-11-14 da lokal kompyuterda `DOMAIN=localhost` bilan yig'ilib, ishga tushirilib tekshirilgan: health, SPA manzillari, HTTPS'ga yo'naltirish, xavfsizlik sarlavhalari, production'da lokal kirish yopiqligi, taklif CLI, qayta ishga tushish, zaxira va undan tiklash.

## 0. Nima kerak

| Narsa | Izoh |
|---|---|
| Server | Ubuntu 24.04, 2 vCPU, 4 GB RAM, 40 GB disk. Pilot uchun yetarli |
| Domen | Masalan `portal.itlive.uz`. DNS'da A yozuvi server IP'siga |
| Telegram bot | Production uchun alohida bot tavsiya qilinadi (pastda 6-band) |

## 1. DNS

Domen panelida: `portal` → A → `<server IP>`. Tekshirish: `dig +short portal.itlive.uz` server IP'sini qaytarishi kerak. Busiz Caddy sertifikat ola olmaydi.

## 2. Serverni tayyorlash

```bash
# Docker (rasmiy o'rnatuvchi)
curl -fsSL https://get.docker.com | sh

# Faqat SSH, HTTP, HTTPS ochiq
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
```

## 3. Kodni olish (repo private)

Serverda faqat o'qish huquqli kalit yarating va uni GitHub'ga qo'shing: repo → Settings → Deploy keys → Add (Allow write access belgilanmasin).

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/liveportal_deploy
cat ~/.ssh/liveportal_deploy.pub   # shuni GitHub Deploy keys ga
GIT_SSH_COMMAND="ssh -i ~/.ssh/liveportal_deploy" git clone git@github.com:mernstack01/liveportal.git /opt/liveportal
git -C /opt/liveportal config core.sshCommand "ssh -i ~/.ssh/liveportal_deploy"
```

## 4. Sozlamalar

```bash
cd /opt/liveportal/deploy
cp .env.example .env
nano .env
```

- `DOMAIN` — 1-banddagi domen.
- `POSTGRES_PASSWORD` — `openssl rand -hex 24` natijasi.
- `JWT_SECRET` — `openssl rand -hex 32` natijasi.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` — @BotFather'dan.

`.env` git'ga tushmaydi. Undagi qiymatlarni chatga yoki hujjatga yozmang.

## 5. Ishga tushirish

```bash
cd /opt/liveportal/deploy
docker compose -f compose.prod.yml up -d --build
docker compose -f compose.prod.yml ps          # uchalasi "healthy"
curl -s https://$(grep ^DOMAIN .env | cut -d= -f2)/api/v1/health/ready
```

Birinchi yig'ish 5 daqiqagacha davom etadi. API har ishga tushganda migration va seed'ni o'zi bajaradi (takrorlansa zarari yo'q).

## 6. Telegram

**Bitta token faqat bir joyda polling qila oladi.** Lokal `pnpm dev` va server bir xil token bilan ishlasa, Telegram 409 qaytaradi va xabarlar tasodifiy joyga tushadi. Shuning uchun:

- production: hozirgi `@liveportal1bot`;
- lokal ishlab chiqish: @BotFather'da yangi bot (masalan `@liveportal_dev_bot`), uning tokeni `apps/api/.env` ga.

@BotFather'da production bot uchun:

1. `/setdomain` → domen (web'dagi "Telegram orqali kirish" tugmasi uchun).
2. Bot Settings → Menu Button → URL `https://<domen>` (bot ichidan portal Mini App sifatida ochiladi).

## 7. Birinchi rahbar

```bash
docker compose -f compose.prod.yml exec api pnpm exec tsx prisma/create-invite.ts owner "Ism Familiya"
```

Chiqqan havolani Telegram'da oching va Start bosing. Bot tanimasa, havolani bot chatiga xabar qilib yuboring. Keyingi odamlar portalning "Jamoa" sahifasidan taklif qilinadi.

## 8. Zaxira nusxa

```bash
chmod +x /opt/liveportal/deploy/backup.sh
crontab -e
# qo'shing:
0 3 * * * cd /opt/liveportal/deploy && ./backup.sh >> backups/backup.log 2>&1
```

Har kuni 03:00 da `deploy/backups/` ga yoziladi: baza (`liveportal-*.sql.gz`) va chat fayllari (`uploads-*.tar.gz`), 14 kundan eskisi o'chadi. Haftada bir marta bitta faylni serverdan tashqariga (kompyuter yoki bulut) ko'chiring. Tiklash buyrug'i `backup.sh` ning boshida yozilgan.

## Kundalik ishlar

| Nima | Buyruq (`/opt/liveportal/deploy` ichida) |
|---|---|
| Yangilash | `git pull && docker compose -f compose.prod.yml up -d --build` |
| Loglar | `docker compose -f compose.prod.yml logs -f api` |
| Holat | `docker compose -f compose.prod.yml ps` |
| Qayta ishga tushirish | `docker compose -f compose.prod.yml restart api` |

## Muammo bo'lsa

| Belgisi | Sabab va yechim |
|---|---|
| Sayt ochilmaydi, caddy logida `challenge failed` | DNS hali server IP'siga qaramayapti yoki 80-port yopiq |
| `api` unhealthy | `logs api` ni qarang. Ko'pincha `.env` dagi qiymat (env tekshiruvi xatoni nomi bilan aytadi) |
| Bot javob bermaydi, logda 409 | Shu token bilan boshqa joyda ham polling ishlayapti (6-band) |
| Ertalabki xabar kelmadi | `logs api | grep Ertalabki` — kuniga bir marta yoziladi; odamning Telegram'i ulanganmi |
