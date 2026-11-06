FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --global npm@11.12.1 \
    && npm ci --registry=https://registry.npmjs.org --replace-registry-host=always

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY --from=build /app/db/migrations ./db/migrations
COPY package.json ./

USER node
EXPOSE 3000
CMD ["node", "dist/boot.js"]
