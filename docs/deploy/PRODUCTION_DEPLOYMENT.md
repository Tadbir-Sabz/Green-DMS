# راهنمای استقرار پروداکشن Green-DMS

## پیش‌نیازها
- Docker و Docker Compose
- دامنه با SSL (Cloudflare/Nginx/Traefik)
- PostgreSQL 16 + PostGIS، Redis

## مراحل استقرار

### ۱) تنظیم متغیرها
```bash
cp .env.production.example .env.production
# ویرایش مقادیر مطابق محیط
```

### ۲) راه‌اندازی با Docker Compose
```bash
docker compose --env-file .env.production up -d --build
```

### ۳) اجرای مایگریشن‌ها
```bash
docker compose exec api npm run migrate
```

### ۴) بررسی سلامت
- API: `http://localhost:3001/health`
- Web: `http://localhost:3000`

## شبکه و امنیت
- استفاده از HTTPS در پروداکشن الزامی است
- SECRETها را حتماً تغییر دهید
- دسترسی به پورت‌های داخلی محدود شود
- بک‌آپ منظم PostgreSQL

## مانیتورینگ
- Health endpoints: `/health`, `/health/live`, `/health/ready`
- لاگ‌ها: `docker compose logs -f api`

## به‌روزرسانی
```bash
git pull
docker compose up -d --build
```
