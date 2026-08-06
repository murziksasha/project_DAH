FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/money/package.json ./packages/money/
COPY apps/api/package.json ./apps/api/

RUN npm install --workspace=@dah/shared --workspace=@dah/money --workspace=@dah/api

COPY packages/shared ./packages/shared
COPY packages/money ./packages/money
COPY apps/api ./apps/api

RUN npm run build -w @dah/shared
RUN npm run build -w @dah/money
RUN npm run db:generate -w @dah/api
RUN npm run build -w @dah/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# pg_dump for in-app / worker weekly + manual backups
RUN apk add --no-cache postgresql16-client || apk add --no-cache postgresql-client

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/money/dist ./packages/money/dist
COPY --from=builder /app/packages/money/package.json ./packages/money/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/assets ./apps/api/assets
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY package.json ./

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
