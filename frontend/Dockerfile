FROM node:20-slim

WORKDIR /app

# Docker Desktop in some corporate/proxy environments can MITM HTTPS which breaks npm with
# `SELF_SIGNED_CERT_IN_CHAIN`. Disable strict SSL inside the container build.
RUN npm config set strict-ssl false

# Install deps first for better layer caching
COPY package.json package-lock.json ./
RUN npm cache clean --force \
  && npm ci --include=optional \
  && node -e "require('@rollup/rollup-linux-x64-gnu'); console.log('rollup native ok')"

# Copy the rest of the frontend sources
COPY . ./

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
