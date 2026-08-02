FROM node:22-alpine AS builder
WORKDIR /app

# Browser-facing API URL (public). Server rewrites use API_UPSTREAM at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Docker Compose service name; baked into next.config rewrites during `next build`.
ARG API_UPSTREAM=http://api:3001
ENV API_UPSTREAM=$API_UPSTREAM

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN npm install --workspace=@dah/shared --workspace=@dah/web

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN npm run build -w @dah/shared
RUN npm run build -w @dah/web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Runtime fallback (standalone already embeds rewrites from build-time API_UPSTREAM)
ENV API_UPSTREAM=http://api:3001

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
