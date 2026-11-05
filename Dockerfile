FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# Copy migrations and schema
COPY src/database ./src/database

EXPOSE 8080

CMD ["node", "dist/index.js"]
