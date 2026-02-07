# Ubermench — Service Marketplace Platform

A comprehensive service marketplace that connects customers with trusted local service providers (plumbing, electrical, cleaning, gardening, repair, and more). Available in two versions:

## 📁 Project Structure

```
ubermench/
├── mobile/          # Flutter/Dart cross-platform mobile app
├── whatsapp/        # WhatsApp-based "light" version
└── README.md        # You are here
```

---

## 📱 Mobile App (`mobile/`)

A full-featured cross-platform mobile application built with **Flutter (Dart)**.

### Tech Stack
- **Flutter** — Cross-platform UI (iOS + Android)
- **Riverpod** — State management
- **Firebase** — Authentication, push notifications
- **Google Maps** — Location services and tracking
- **Go Router** — Navigation
- **Hive** — Local storage

### Getting Started
```bash
cd mobile
flutter pub get
flutter run
```

> See [`mobile/`](./mobile/) for full details.

---

## 💬 WhatsApp Edition (`whatsapp/`)

A "light" version of the platform that runs entirely through **WhatsApp**, powered by the [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api). Inspired by platforms like [MiChamba](https://www.michamba.ai/).

### How It Works

**For Customers:**
1. Message the bot on WhatsApp → Select a service category
2. Browse providers with ratings and reviews
3. Book a provider → Chat directly with them
4. Rate the provider after the service is completed

**For Providers:**
1. Register via WhatsApp → Set services and bio
2. Receive customer request notifications
3. Accept/decline requests → Chat with customer
4. Get rated after completing the service

### Tech Stack
- **Node.js + Express** — Backend API & webhook handler
- **WhatsApp Cloud API** — Messaging interface (interactive lists, buttons, media)
- **PostgreSQL** — Database (SQLite for development)
- **Redis** — Session management & caching
- **Knex.js** — Query builder & migrations
- **Docker** — Containerized infrastructure

### Getting Started
```bash
cd whatsapp/backend
npm install
cp env.example .env    # Configure your environment
npm run dev
```

> See [`whatsapp/milestone.md`](./whatsapp/milestone.md) for the full development roadmap and milestones.

---

## 🛠️ Development

### Prerequisites
- **Mobile:** Flutter SDK (>=3.0.0), Firebase project
- **WhatsApp:** Node.js (>=18.0.0), Meta Developer account, PostgreSQL, Redis

### Repository Workflow
Each change should be committed with a descriptive message referencing the milestone:
```bash
git add -A
git commit -m "M1: Add WhatsApp webhook endpoint and message service"
git push origin main
```

---

## 📄 License

This project is licensed under the MIT License.
