FROM node:22.23.5-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

FROM node:22.23.5-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeuser

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Volume de backups (BACKUP_DIR). Criado com dono do usuário da aplicação
# para permitir escrita quando o volume nomeado for inicializado.
RUN mkdir -p /backups && chown nodeuser:nodejs /backups

USER nodeuser

EXPOSE 3002

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3002/health || exit 1

CMD ["node", "dist/index.js"]
