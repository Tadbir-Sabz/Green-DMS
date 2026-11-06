FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
# TASK-19 — Next.js rewriteهای next.config.mjs را در زمانِ build در
# .next/routes-manifest.json می‌پزد (مقادیرِ process.env همان لحظه خوانده می‌شوند؛
# تغییرِ env در زمانِ اجرا اثری ندارد — برخلافِ `next dev`). پس API_PROXY_TARGET
# باید build-arg باشد؛ پیش‌فرضِ http://api:4000 برایِ پشتهٔ docker compose است.
ARG API_PROXY_TARGET=http://api:4000
ENV API_PROXY_TARGET=$API_PROXY_TARGET
COPY . .
RUN npm run build -w apps/web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# خروجیِ build + دارایی‌هایِ اجراییِ وب
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
# TASK-19 — next.config.mjs در زمانِ `next start` لازم است: rewriteهایِ پروکسیِ
# هم‌مبدأ (/api/* → API_PROXY_TARGET) همین‌جا ثبت می‌شوند؛ بدونِ آن پروکسی از کار
# می‌افتد. apps/web/node_modules هم (تودرتویِ @hookform/resolvers نسخهٔ متفاوت از
# hoisted) باید کپی شود وگرنه SSR صفحاتِ فرم‌دار می‌شکند.
COPY --from=builder /app/apps/web/next.config.mjs ./apps/web/next.config.mjs
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
# وابستگی‌هایِ اجرایی + پکیج‌هایِ فضای‌کاری (@dms/api-client و @dms/contracts در
# node_modules symlink اند؛ مقصدشان باید وجود داشته باشد)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

EXPOSE 3000
# `next start` باید در پوشهٔ پروژه (جایی که .next و next.config.mjs هست) اجرا شود؛
# پیش‌تر cwd برابر /app بود و هیچ production buildی پیدا نمی‌شد.
WORKDIR /app/apps/web
CMD ["npx", "next", "start", "-p", "3000"]
