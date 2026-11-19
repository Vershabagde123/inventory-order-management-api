# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# prisma generate (no DB needed) + tsc
RUN npm run build

# ---------- Runtime stage ----------
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

COPY package.json package-lock.json ./
# Production deps only. `prisma` CLI is a runtime dependency so the container
# can run `npx prisma migrate deploy`.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./

USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=6s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
