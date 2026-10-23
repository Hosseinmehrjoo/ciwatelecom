# استقرار CIWA Telecom در محیط سازمانی

## پیش‌نیازها

- Linux x86_64 (توصیه: Debian/Ubuntu)
- Node.js 22+ (بدون Docker) یا Docker Compose
- PostgreSQL 16+ (توصیه برای تولید) یا MySQL 8+
- Asterisk طبق `scripts/install/start-asterisk.sh`

## مسیر سریع با Docker Compose

```bash
cp .env.example .env
# CIWA_DB_PASSWORD و AMI_HOST را تنظیم کنید
docker compose up -d --build
```

- UI: `http://SERVER:8080`
- API: `http://SERVER:8788` (مستقیم) یا از طریق nginx روی `/api`
- ورود اولیه: `admin` / `admin` — **بلافاصله رمز را عوض کنید**

پس از بالا آمدن سرویس‌ها:

1. وارد پنل شوید → **تنظیمات دیتابیس** → **انتقال داده از JSON** (در صورت نیاز)
2. Asterisk روی میزبان: `./scripts/install/start-asterisk.sh`

## استقرار بدون Docker (systemd)

```bash
cd frontend && npm ci && npm run build
cd ../backend/api && npm ci
export CIWA_ENV=production CIWA_SERVE_UI=1 CIWA_TRUST_PROXY=1
node src/server.js
```

فایل نمونه سرویس: `scripts/systemd/ciwa-telecom-api.service`

## HTTPS

- پشت **nginx** یا **Traefik** با TLS termination
- `CIWA_TRUST_PROXY=1` و `CIWA_CORS_ORIGIN=https://pbx.company.local`
- هدر HSTS در production فعال است (`CIWA_ENV=production`)

## پشتیبان و بازیابی

- پنل → **مدیریت سامانه** → ایجاد پشتیبان
- API: `POST /api/system/restore` با `{ "name": "ciwa-telecom-....tar.gz" }`
- خروجی JSON از DB: `POST /api/system/export-json`

## مانیتورینگ

- Liveness: `GET /api/health`
- Readiness: `GET /api/health/ready`
- برای چک AMI در readiness: `CIWA_HEALTH_CHECK_AMI=1`

## چک‌لیست امنیت قبل از تحویل

- [ ] رمز admin عوض شده
- [ ] `CIWA_DISABLE_AUTH` خاموش
- [ ] دیتابیس با رمز قوی و دسترسی شبکه محدود
- [ ] AMI فقط از localhost یا IP مجاز
- [ ] فایروال: SIP/RTP/SSH طبق سیاست مشتری
- [ ] پشتیبان دوره‌ای `database/backups`
