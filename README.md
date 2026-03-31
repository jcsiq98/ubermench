# Ubermench

AI Business Assistant para trabajadores de oficios independientes en México.
Asistente de negocios por WhatsApp: ingresos, agenda, cobros, CRM.

## Estructura

```
ubermench/
├── backend/        API principal (NestJS + TypeScript + Prisma + PostgreSQL)
├── web/            Dashboard del provider (Next.js) — en desarrollo
├── scripts/        Utilidades (start-db.js)
├── _archive/       Prototipos anteriores preservados (no activos)
└── docker-compose.yml
```

## Stack activo

- **Backend**: NestJS, PostgreSQL, Prisma, Redis, BullMQ
- **Frontend**: Next.js (App Router)
- **Mensajería**: WhatsApp Cloud API
- **AI**: OpenAI (gpt-4o-mini), intent detection, contexto conversacional

## Levantar el proyecto (primera vez)

```bash
# 1. Instalar dependencias
cd backend && npm install
cd ../web && npm install
cd ..

# 2. Configurar variables de entorno
cp backend/.env.example backend/.env
# Editar backend/.env con tus credenciales (ver comentarios en el archivo)

# 3. Levantar PostgreSQL (elegir UNA opción)
# Opción A — PostgreSQL embebida (sin instalar nada):
node scripts/start-db.js    # Deja corriendo en esta terminal

# Opción B — Docker (también levanta Redis):
docker-compose up -d
# Si usas Docker, cambia DATABASE_URL en .env (ver instrucciones en .env.example)

# 4. Aplicar migraciones y seed (en otra terminal)
cd backend
npx prisma migrate dev
npm run db:seed              # Datos iniciales (categorías, zonas, admin)
# npm run db:seed:demo       # (Opcional) Datos demo realistas para CDMX

# 5. Arrancar backend (puerto 3000)
npm run start:dev

# 6. Arrancar frontend (en otra terminal, puerto 3001)
cd web && npm run dev
```

## Levantar el proyecto (ya configurado)

```bash
node scripts/start-db.js           # Terminal 1: DB
cd backend && npm run start:dev    # Terminal 2: API
cd web && npm run dev              # Terminal 3: Web
```

## Para desarrollo con WhatsApp

```bash
# Necesitas exponer el backend para recibir webhooks de Meta
ngrok http 3000
# Configura la URL de ngrok en Meta for Developers → WhatsApp → Webhook
```

## URLs útiles (en dev)

| URL | Qué es |
|-----|--------|
| http://localhost:3000/api/docs | Swagger / documentación API |
| http://localhost:3000/api/health | Health check |
| http://localhost:3000/api/health/whatsapp | Estado del token de WhatsApp |
| http://localhost:3001 | Dashboard web |
| http://localhost:3001/admin | Panel de administración |

## Qué funciona sin credenciales externas

| Servicio | Sin credenciales |
|----------|-----------------|
| PostgreSQL | Requiere DB (embebida o Docker) |
| Redis | Fallback a in-memory (funcional para dev) |
| WhatsApp | Recibe webhooks, pero no envía mensajes |
| OpenAI | Responde con mensaje fallback genérico |
| Cloudinary | Retorna URL placeholder (no truena) |
| Firebase | Push notifications deshabilitadas |

## Módulos del backend

Los módulos activos viven en `backend/src/modules/`.
Los módulos del modelo marketplace anterior están en `backend/src/modules/_marketplace/` (preservados, no activos en el nuevo roadmap).

## Documentación estratégica

Los documentos de estrategia, roadmap del pivot, y plan de ejecución viven en el repositorio `ubermench-docs`.
