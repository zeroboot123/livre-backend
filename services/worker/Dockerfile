FROM node:22-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 workeruser

COPY package.json ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

USER workeruser

CMD ["node", "dist/index.js"]
