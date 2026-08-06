FROM node:22-alpine AS builder
WORKDIR /app

# Browser-facing API URL (public hint only; runtime uses same-origin /api via edge nginx)
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN npm install --workspace=@dah/shared --workspace=@dah/web

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN npm run build -w @dah/shared
RUN npm run build -w @dah/web

# Static export → lightweight nginx (no Node runtime)
FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/out /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
