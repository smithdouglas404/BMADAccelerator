FROM node:22-bookworm-slim
WORKDIR /svc
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
ENV NODE_ENV=production PORT=8300
USER node
EXPOSE 8300
CMD ["node", "src/server.ts"]
