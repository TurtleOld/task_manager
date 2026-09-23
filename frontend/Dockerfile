FROM node:20-slim AS build

WORKDIR /app

# Vite writes a bundled config next to vite.config.ts (vite.config.ts.timestamp-*.mjs).
# Ensure /app is writable even when running as non-root.
RUN chown -R node:node /app

RUN npm config set strict-ssl false

COPY package.json package-lock.json ./
RUN npm cache clean --force \
  && npm ci --include=optional \
  && node -e "require('@rolldown/binding-linux-x64-gnu'); console.log('rolldown native ok')"

COPY . ./

RUN chown -R node:node /app

EXPOSE 5173

USER node

FROM build AS bundle

RUN npm run build

FROM nginx:1.27-alpine AS production

ENV BACKEND_UPSTREAM=backend:8000

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=bundle /app/dist /usr/share/nginx/html

EXPOSE 80
