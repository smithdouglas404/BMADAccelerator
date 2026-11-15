FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 WORKSPACES_DIR=/data/workspaces
RUN apt-get update && apt-get install -y --no-install-recommends openssl git && rm -rf /var/lib/apt/lists/*
COPY --from=build /app ./
RUN mkdir -p /data/workspaces
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
