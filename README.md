# Servicios Uber Like - Service Marketplace App

A comprehensive service marketplace application similar to Uber but for local services, built with Flutter (Dart) and Node.js.

## 🚀 Features

### Core Functionality
- **User Authentication**: Registration and login for customers and service providers
- **Service Categories**: Plumbing, electrical, cleaning, gardening, repair, and more
- **Real-time Matching**: Automatic provider matching based on location and availability
- **Live Tracking**: Real-time location tracking of service providers
- **In-app Chat**: Communication between customers and providers
- **Payment Integration**: Secure payment processing with Stripe
- **Rating System**: Customer reviews and provider ratings
- **Push Notifications**: Real-time notifications for service updates

### Technical Features
- **Cross-platform**: Single codebase for iOS and Android
- **Real-time Communication**: WebSocket integration for live updates
- **Geolocation**: GPS-based service matching and tracking
- **Offline Support**: Local data caching and offline functionality
- **Scalable Architecture**: Microservices-ready backend design

## 🏗️ Architecture

### Frontend (Flutter)
```
lib/
├── app/                    # App configuration
├── core/                   # Core utilities and configurations
│   ├── config/            # Firebase, API configurations
│   ├── routing/           # Navigation and routing
│   └── theme/             # App theming
├── data/                  # Data layer
│   ├── models/           # Data models
│   └── repositories/     # Data repositories
├── features/             # Feature modules
│   ├── auth/            # Authentication
│   ├── home/            # Home screen
│   ├── map/             # Map integration
│   ├── request/         # Service requests
│   └── profile/         # User profile
└── main.dart            # App entry point
```

### Backend (Node.js)
```
backend/
├── src/
│   ├── config/          # Database and Redis configuration
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Custom middleware
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   └── server.js       # Server entry point
├── migrations/          # Database migrations
├── seeds/              # Database seeds
└── package.json        # Dependencies
```

## 🛠️ Tech Stack

### Frontend
- **Flutter**: Cross-platform mobile development
- **Dart**: Programming language
- **Riverpod**: State management
- **Go Router**: Navigation
- **Firebase**: Authentication and push notifications
- **Google Maps**: Location services

### Backend
- **Node.js**: Runtime environment
- **Express.js**: Web framework
- **PostgreSQL**: Primary database
- **Redis**: Caching and sessions
- **Socket.io**: Real-time communication
- **JWT**: Authentication tokens
- **Stripe**: Payment processing

## 📱 Getting Started

### Prerequisites
- Flutter SDK (>=3.0.0)
- Node.js (>=18.0.0)
- PostgreSQL
- Redis
- Firebase project

### Frontend Setup

1. **Install Flutter dependencies**:
   ```bash
   cd /home/jcsiq98/ubermench
   flutter pub get
   ```

2. **Configure Firebase**:
   - Create a Firebase project
   - Enable Authentication and Firestore
   - Download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
   - Update `lib/core/config/firebase_options.dart` with your project details

3. **Run the app**:
   ```bash
   flutter run
   ```

### Backend Setup

1. **Install dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Setup database**:
   ```bash
   # Create PostgreSQL database
   createdb servicios_uber
   
   # Run migrations
   npm run migrate
   
   # Seed sample data
   npm run seed
   ```

4. **Start the server**:
   ```bash
   npm run dev
   ```

## 🔧 Configuration

### Environment Variables

#### Backend (.env)
```env
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=servicios_uber

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-jwt-key

# Stripe
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key

# Google Maps
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### Firebase Configuration
Update `lib/core/config/firebase_options.dart` with your Firebase project credentials.

## 📊 Database Schema

### Core Tables
- **users**: Customer and provider accounts
- **providers**: Service provider profiles and availability
- **service_requests**: Service requests and status tracking
- **assignments**: Provider-request matching
- **payments**: Payment transactions
- **ratings**: Customer reviews and ratings
- **messages**: In-app chat messages

## 🚀 Deployment

### Frontend
1. Build for production:
   ```bash
   flutter build apk --release  # Android
   flutter build ios --release  # iOS
   ```

2. Deploy to app stores or distribute directly

### Backend
1. Set production environment variables
2. Deploy to cloud platform (AWS, Google Cloud, Heroku)
3. Configure database and Redis instances
4. Set up monitoring and logging

## 🔒 Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting
- Input validation
- CORS configuration
- Helmet.js security headers

## 📈 Performance Optimizations

- Redis caching
- Database indexing
- Image optimization
- Lazy loading
- Connection pooling

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

## 🔮 Roadmap

### Phase 1 (MVP)
- [x] Basic authentication
- [x] Service request creation
- [x] Provider matching
- [x] Real-time communication
- [ ] Payment integration
- [ ] Rating system

### Phase 2
- [ ] Advanced matching algorithm
- [ ] Surge pricing
- [ ] Multi-language support
- [ ] Advanced analytics
- [ ] Admin dashboard

### Phase 3
- [ ] AI-powered recommendations
- [ ] Blockchain integration
- [ ] IoT device integration
- [ ] Advanced reporting


