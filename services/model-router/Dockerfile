FROM node:20-alpine AS build

WORKDIR /app

# Shared metrics library — available at /_lib/ (two levels up from /app/src/ and /app/dist/)
COPY _lib/metrics/dist/src/ /_lib/metrics/dist/src/

COPY model-router/package.json model-router/package-lock.json* ./
RUN npm install

COPY model-router/tsconfig.json ./
COPY model-router/src/ ./src/

RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules/ ./node_modules/
COPY --from=build /app/dist/src/ ./dist/
COPY --from=build /_lib/metrics/dist/src/ /_lib/metrics/dist/src/
COPY model-router/config/ ./config/

EXPOSE 3200

CMD ["node", "dist/index.js"]
