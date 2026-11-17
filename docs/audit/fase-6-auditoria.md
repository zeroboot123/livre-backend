# Auditoria — Fase 6: Logs, Health Agregado e Métricas

**Data:** 2026-11-17
**Escopo:** logs, health, métricas dos serviços.

---

## 1. Achados

| # | Item | Situação atual |
|---|---|---|
| 1 | **Logs** | `admin-api` e `visual-db`: `logger: false` (zero logs). `auth`: Fastify logger ligado por env. Sem JSON estruturado, sem request-id, sem nível uniforme. |
| 2 | **Health** | Cada serviço tem `/health` próprio (admin-api, auth, visual-db). Nenhum agregado (postgres, minio, postgrest, worker, auth, admin-api). |
| 3 | **Métricas** | ❌ nenhum endpoint `/metrics`. Sem Prometheus. |

## 2. Prioridades recomendadas
1. Ativar logs estruturados (pino já presente como dependência transitiva no auth; avaliar pino direto nos três serviços).
2. Health agregado em um serviço (ou em admin-api) com checks de postgres, minio, postgrest, worker.
3. Métricas básicas: process + event counters (http requests) via `/metrics`.

## 3. Estado atual resumido
- `GET /health` admin-api: `{status, service, timestamp}` — não checa banco.
- `GET /health` auth: `{status, service, timestamp}` — não checa banco.
- `GET /health` visual-db: `{status, ...}` — não checa banco.
- Sem healthcheck agregado no compose.

---

## 🏁 Fase 6 — Concluída (auditoria)

**Próximo: Auditoria da Fase 7 (rate limit, auditoria, escopos de token, CORS, grants).**
