# Production image: the API serves the built web app and /api from one origin.
# Put it behind a TLS terminator (SWAG): the app needs HTTPS for the Lichess
# login (WebCrypto) and cross-origin isolation.
#   docker compose -f docker-compose.prod.yml up -d --build

FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/legions/package.json packages/legions/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run assets && npm run build

FROM node:22-slim
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/web
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --no-audit --no-fund -w @outofbook/api && npm cache clean --force
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/migrations apps/api/migrations
COPY --from=build /repo/apps/web/dist web
USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
