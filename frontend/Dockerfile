FROM node:20-slim

WORKDIR /app

RUN npm config set strict-ssl false

COPY package.json package-lock.json ./
RUN npm cache clean --force \
  && npm ci --include=optional \
  && node -e "require('@rollup/rollup-linux-x64-gnu'); console.log('rollup native ok')"

COPY . ./

EXPOSE 5173

USER node

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
