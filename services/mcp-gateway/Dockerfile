# Son of Anton — MCP Gateway
# Model Context Protocol gateway that exposes graph and vector queries
# as MCP tools for Claude-based agents.

FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Shared metrics library — available at /_lib/ (two levels up from /app/src/ and /app/dist/)
COPY _lib/metrics/dist/src/ /_lib/metrics/dist/src/

COPY mcp-gateway/package*.json mcp-gateway/tsconfig.json ./
RUN npm ci

COPY mcp-gateway/src/ ./src/
RUN npx tsc

EXPOSE 3100

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
    CMD curl -sf http://localhost:3100/health || exit 1

CMD ["node", "dist/index.js"]
