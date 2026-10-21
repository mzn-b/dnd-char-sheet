# Builds the web client and API into one image; the API serves the client.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY server server
COPY web web
RUN npm run build --workspace web && npm run build --workspace server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace server
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
ENV WEB_DIST=/app/web/dist
EXPOSE 4000
CMD ["node", "server/dist/index.js"]
