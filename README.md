# Identity Server

Sistema de autenticación y autorización multi-tenant (RBAC + ABAC) para SaaS B2B.
Stack: **NestJS 11** + **PostgreSQL 16** + **TypeORM**. Toda la criptografía de auth
(JWT RS256, refresh tokens rotativos, guards) implementada desde cero sobre `node:crypto`.

## Puesta en marcha

```bash
# 1. Copiar y ajustar variables de entorno
cp .env.example .env

# 2. Levantar PostgreSQL 16
docker compose up -d

# 3. Instalar dependencias
npm install

# 4. Arrancar en modo desarrollo
npm run start:dev
```

## Comandos

| Comando             | Descripción                          |
| ------------------- | ------------------------------------ |
| `npm run build`     | Compilar a `dist/`                   |
| `npm run start:dev` | Arrancar con hot-reload              |
| `npm run lint`      | Lint + auto-fix                      |
| `npm test`          | Tests unitarios (Jest)               |
| `npm run test:e2e`  | Tests e2e (supertest)                |

## Configuración

Toda la configuración se valida al arrancar (ver `src/config/env.validation.ts`).
Variables principales en `.env.example` (aplicación + conexión a PostgreSQL).
