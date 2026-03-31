# Ubermench — WhatsApp Edition

A WhatsApp-based service marketplace that connects customers with local service providers through conversational interfaces, powered by the [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api).

## 📋 Milestones & Roadmap

See **[milestone.md](./milestone.md)** for the full development plan, task breakdowns, and manual test plans for each phase.

## 🏗️ Architecture

```
whatsapp/
├── backend/
│   ├── src/
│   │   ├── config/          # Database and Redis configuration
│   │   ├── controllers/     # Request handlers
│   │   ├── handlers/        # WhatsApp conversation handlers (customer, provider)
│   │   ├── middleware/       # Auth, error handling, webhook validation
│   │   ├── routes/          # API + webhook routes
│   │   ├── services/        # WhatsApp API, sessions, chat relay, providers
│   │   └── server.js        # Entry point
│   ├── migrations/          # Database schema migrations
│   ├── seeds/               # Sample/demo data
│   ├── public/admin/        # Admin dashboard (static HTML + JS)
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml       # PostgreSQL + Redis + Backend
├── milestone.md             # Development roadmap
└── README.md                # You are here
```

## 🚀 Quick Start

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp env.example .env
# Edit .env with your WhatsApp API credentials, DB config, etc.
```

### 3. Run database migrations
```bash
npm run migrate
npm run seed
```

### 4. Start development server
```bash
npm run dev
```

### 5. Expose webhook (development)
```bash
ngrok http 5000
# Then configure the ngrok URL in Meta Developer Dashboard
```

## 🔑 Required Environment Variables

| Variable | Description |
|----------|-------------|
| `WHATSAPP_API_URL` | `https://graph.facebook.com/v21.0` |
| `WHATSAPP_PHONE_NUMBER_ID` | Your WhatsApp Business phone number ID |
| `WHATSAPP_ACCESS_TOKEN` | Permanent access token from Meta |
| `WHATSAPP_VERIFY_TOKEN` | Custom token for webhook verification |
| `DB_HOST` | Database host (default: `localhost`) |
| `DB_PORT` | Database port (default: `5432`) |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `DB_NAME` | Database name |
| `REDIS_HOST` | Redis host (default: `localhost`) |
| `REDIS_PORT` | Redis port (default: `6379`) |
| `JWT_SECRET` | Secret for JWT tokens |

## 🐳 Docker

```bash
docker-compose up --build
```

This starts PostgreSQL, Redis, and the backend API.

