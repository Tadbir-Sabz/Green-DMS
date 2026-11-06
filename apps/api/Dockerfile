FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/*/package*.json ./packages/*/
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# خروجیِ کامپایل‌شده + مانیفستِ فضای‌کاریِ api
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

# وابستگی‌های اجرایی (npm ci در ریشه hoist می‌کند؛ apps/api/node_modules تودرتو ندارد)
COPY --from=builder /app/node_modules ./node_modules

# TASK-19 — دارایی‌هایِ زمانِ اجرا که پیش‌تر از ایمیج جا مانده بودند و بالا آمدنِ
# برنامه در کانتینر را ناممکن می‌کردند:
#   * scripts/migrate.mjs — findMigrateScript() در auto-migrate.ts از cwd بالا می‌رود
#     و در هر دو حالتِ AUTO_MIGRATE=true/false به این فایل نیاز است (apply/status).
#   * migrations/ — migrate.mjs دایرکتوریِ مهاجرت‌ها را نسبت به ریشهٔ خودش می‌یابد
#     (ROOT = والدِ scripts/)، پس هر دو باید زیرِ /app باشند.
#   * package.json — تا `npm run db:migrate` داخلِ کانتینر هم کار کند.
#   * packages/ — پکیج‌هایِ فضای‌کاری (@dms/contracts) در node_modules به‌صورتِ
#     symlink اند؛ بدونِ مقصدِ symlink، require در زمانِ اجرا می‌شکند.
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/packages ./packages

EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
