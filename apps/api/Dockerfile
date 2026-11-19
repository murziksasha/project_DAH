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
RUN npm prune --omit=dev --workspace=@dah/shared --workspace=@dah/money --workspace=@dah/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# pg_dump for in-app / worker weekly + manual backups
RUN apk add --no-cache postgresql16-client || apk add --no-cache postgresql-client
RUN mkdir -p /backups /app && chown -R node:node /backups /app

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=node:node /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=node:node /app/packages/money/dist ./packages/money/dist
COPY --from=builder --chown=node:node /app/packages/money/package.json ./packages/money/
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /app/apps/api/package.json ./apps/api/
COPY --from=builder --chown=node:node /app/apps/api/prisma ./apps/api/prisma
# Prisma 7: CLI config (migrate deploy reads DATABASE_URL from here)
COPY --from=builder --chown=node:node /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=builder --chown=node:node /app/apps/api/assets ./apps/api/assets
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=node:node /app/package.json ./

USER node
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/src/main.js"]
