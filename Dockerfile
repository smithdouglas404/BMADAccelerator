FROM node:22-bookworm-slim AS base
# git: BMAD workspaces and generated apps are git repos. python3 + uv: BMAD's own scripts.
# chromium + fonts: screenshots for screen markup and Generate's design review. unzip: skill uploads. markitdown: reads uploads.
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl git ca-certificates curl python3 unzip chromium fonts-dejavu-core fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.9.5 /uv /uvx /usr/local/bin/
ENV UV_TOOL_BIN_DIR=/usr/local/bin UV_TOOL_DIR=/opt/uv-tools UV_PYTHON_INSTALL_DIR=/opt/uv-python \
    CHROMIUM_PATH=/usr/bin/chromium
# shadcn: its MCP server lets the agents look up shadcn/ui components, blocks and charts. Pinned.
ARG SHADCN_VERSION=4.23.0
RUN npm install -g shadcn@${SHADCN_VERSION} && npm cache clean --force
RUN uv python install 3.11 3.12 && uv tool install 'markitdown[pptx,docx,xlsx,xls,pdf]' \
    && chmod -R a+rX /opt/uv-tools /opt/uv-python

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN ./scripts/fetch-vendor.sh && npm run build

FROM base AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 WORKSPACES_DIR=/data/workspaces HOME=/home/node \
    UV_CACHE_DIR=/home/node/.cache/uv
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /data/workspaces && chown -R node:node /data
USER node
RUN mkdir -p /home/node/.claude
RUN git config --global user.name "BMAD Accelerator" && git config --global user.email "bmad@accelerator.local" \
    && git config --global init.defaultBranch main
# 3000: the accelerator. 4100-4129: each use case's generated app.
EXPOSE 3000 4100-4129
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
