# CIWA Telecom

پنل مدیریت مرکز تلفن متن‌باز (Open Source) برای استقرار داخل شبکه سازمان، با هسته Asterisk و رابط وب فارسی.

نرم‌افزار **رایگان** است و تحت مجوز متن‌باز منتشر می‌شود. **نصب، پیکربندی، پشتیبانی، سفارشی‌سازی و آموزش** به‌صورت خدمات تجاری از طرف تیم سیوا ارائه می‌شود.

- وب‌سایت: [ciwa.ir](https://ciwa.ir)
- مخزن: [github.com/Hosseinmehrjoo/ciwatelecom](https://github.com/Hosseinmehrjoo/ciwatelecom)

## چرا متن‌باز با خدمات پولی؟

- شفافیت کد و استقلال سازمان روی زیرساخت خودش
- بدون هزینه لایسنس نرم‌افزار برای استفاده داخلی
- درآمد از ارزش واقعی: استقرار امن، اتصال به مخابرات/ترانک، HA، آموزش اپراتور و SLA

اگر فقط نرم‌افزار را clone کنید، مسئولیت اجرا، امنیت و نگهداری با تیم فنی خودتان است. برای محیط تولید، استفاده از خدمات معتبر توصیه می‌شود.

## معماری

- `frontend/`: رابط React (Vite)
- `backend/api/`: API Node.js
- `backend/services/`: منطق PBX، AMI، تولید conf، احراز هویت، دیتابیس
- `config/ciwa/`: تنظیمات عملیاتی (JSON یا پایگاه داده)
- `config/asterisk/`: خروجی تولید‌شده برای Asterisk
- `core/asterisk/`: سورس Asterisk (فقط خواندنی؛ در این مخزن تغییر ندهید)

## پیش‌نیازها

- Node.js 22+
- Linux (توصیه برای Asterisk)
- Docker (اختیاری، برای Compose و بیلد Asterisk)

## نصب سریع (توسعه)

```bash
cp .env.example .env

cd backend/api && npm install && npm run dev
cd frontend && npm install && npm run dev
```

- UI: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8788`

ورود اولیه: کاربر `admin` و رمز `admin` — بلافاصله رمز را عوض کنید.

## Asterisk

```bash
./scripts/install/build-asterisk-docker.sh
./scripts/install/start-asterisk.sh
```

AMI پیش‌فرض: `127.0.0.1:5038`

## استقرار تولید

راهنمای کامل: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

```bash
docker compose up -d --build
```

شامل PostgreSQL، API و nginx برای UI.

متغیرهای مهم در `.env.example`: پورت‌ها، رمز دیتابیس، `AMI_HOST`, `CIWA_DATABASE_URL`.

## دیتابیس

پیش‌فرض: فایل‌های `config/ciwa/*.json`.

از پنل، بخش **تنظیمات دیتابیس** می‌توانید PostgreSQL یا MySQL متصل کنید. نمونه تنظیمات: `config/ciwa/database.json.example`.

## قابلیت‌های اصلی

مرکز تلفن: داخلی، ترانک، مسیر ورودی/خروجی، صف، IVR، گروه زنگ، زمان‌بندی، کنفرانس، صندوق صوتی، موزیک انتظار، CDR، ضبط، مانیتور زنده، برقراری تماس (AMI).

سامانه: احراز هویت و نقش‌ها، ممیزی، پشتیبان و بازیابی، شبکه و فایروال (desired state)، SIP/RTP، AMI.

## تست

```bash
cd backend/api && npm test
cd frontend && npm run build
```

## مشارکت

Issue و Pull Request در GitHub پذیرفته می‌شود. قبل از PR بزرگ، یک Issue برای هم‌ترازی طراحی باز کنید.

## خدمات تجاری (سیوا)

- نصب و استقرار on-prem
- اتصال SIP/ترانک و بهینه‌سازی کیفیت تماس
- مهاجرت از PBX قبلی
- پشتیبانی و آموزش

تماس: از [ciwa.ir](https://ciwa.ir)

## مجوز

متن مجوز در فایل `LICENSE` در ریشه مخزن آمده است. استفاده تجاری از خود نرم‌افزار طبق مجوز مجاز است؛ نام و برند CIWA طبق قوانین مجوز و علائم تجاری استفاده شود.

## امنیت

گزارش آسیب‌پذیری: از Issues با برچسب security یا تماس از وب‌سایت (بدون انتشار عمومی جزئیات تا رفع).
