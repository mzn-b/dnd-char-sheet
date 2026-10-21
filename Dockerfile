# Builds the web client and API into one image; the API serves the client.
# NODE_IMAGE can point at a mirror (e.g. mirror.gcr.io/library/node:22-alpine) if Docker Hub rate-limits you.
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY server server
COPY web web
RUN npm run build --workspace web && npm run build --workspace server

FROM ${NODE_IMAGE}
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
# Postgres is not in this image: point DATABASE_URL at a database (see README, "Deploying to kind with Argo CD").
USER node
CMD ["node", "server/dist/index.js"]
