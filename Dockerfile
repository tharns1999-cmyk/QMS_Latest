# Azure image: the API (Node) serves the web app from the same address, so one container does everything.
# Build:  docker build --build-arg VITE_API_URL=https://<the address people open> -t qms .
# VITE_API_URL is the https address of this deployment (same as ALLOWED_ORIGIN). It is baked into the web build.
FROM node:24-slim AS web
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN corepack enable
WORKDIR /build/apps/web
COPY apps/web/package.json apps/web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/web ./
# public/_headers names the Cloudflare UAT address (still needed there until cut-over). In this image the browser
# must be allowed to call this deployment's own address instead; build:production then checks the address is listed.
RUN sed -i "s|https://qms-api.qms-api.workers.dev|${VITE_API_URL}|g" public/_headers && pnpm run build:production

FROM node:24-slim
RUN corepack enable
WORKDIR /app/api
ENV NODE_ENV=production PORT=8080 WEB_DIST_DIR=/app/web
COPY apps/api/package.json apps/api/pnpm-lock.yaml apps/api/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY apps/api ./
COPY --from=web /build/apps/web/dist /app/web
USER node
EXPOSE 8080
CMD ["node", "src/node/main.js"]
