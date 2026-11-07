FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# NEXT_PUBLIC_* são embutidas no bundle em tempo de BUILD.
# Recebidas como build args (Coolify/compose) e expostas ao `next build`.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_VISUAL_DB_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_VISUAL_DB_URL=$NEXT_PUBLIC_VISUAL_DB_URL

RUN mkdir -p /app/public && npm run build

FROM node:22-alpine AS runner

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
