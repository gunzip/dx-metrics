FROM node:20-alpine AS base
RUN npm install -g pnpm@8

# Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile || pnpm install

# Development stage with hot reload
FROM base AS dev
WORKDIR /app

# Install dependencies first (this layer is cached)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile || pnpm install

# Copy all application files
COPY . .

ENV NODE_ENV=development
EXPOSE 3000

CMD ["pnpm", "dev"]
