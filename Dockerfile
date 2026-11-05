# Stage 1: build
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# Stage 2: run
FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY src/database ./src/database

EXPOSE 8080

CMD ["node", "dist/index.js"]
