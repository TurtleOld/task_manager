FROM node:20-slim

WORKDIR /app

# Vite writes a bundled config next to vite.config.ts (vite.config.ts.timestamp-*.mjs).
# Ensure /app is writable even when running as non-root.
RUN chown -R node:node /app

RUN npm config set strict-ssl false

COPY package.json package-lock.json ./
RUN npm cache clean --force \
  && npm ci --include=optional \
  && node -e "require('@rollup/rollup-linux-x64-gnu'); console.log('rollup native ok')"

COPY . ./

RUN chown -R node:node /app

EXPOSE 5173

USER node

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
