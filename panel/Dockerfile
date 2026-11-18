FROM node:22.23.5-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# NEXT_PUBLIC_* são o fallback de build. Em runtime, o painel lê
# NEXT_PUBLIC_* do ambiente do container e injeta em window.__LIVRE_ENV__
# (ver src/lib/public-env.ts), permitindo reutilizar a mesma imagem.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_VISUAL_DB_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_VISUAL_DB_URL=$NEXT_PUBLIC_VISUAL_DB_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN mkdir -p /app/public && npm run build

FROM node:22.23.5-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3003

ENV PORT=3003
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production

CMD ["node", "server.js"]
