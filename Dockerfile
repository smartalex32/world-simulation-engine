FROM node:22-alpine

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm typecheck:hosted

ENV NODE_ENV=production
EXPOSE 8787
CMD ["pnpm", "host"]
