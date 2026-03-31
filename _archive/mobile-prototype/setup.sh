#!/bin/bash

# Servicios Uber Like - Setup Script
# This script sets up the development environment for the project

set -e

echo "🚀 Setting up Servicios Uber Like project..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if required tools are installed
check_requirements() {
    echo "Checking requirements..."
    
    if ! command -v flutter &> /dev/null; then
        print_error "Flutter is not installed. Please install Flutter first."
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    if ! command -v psql &> /dev/null; then
        print_warning "PostgreSQL is not installed. Please install PostgreSQL first."
    fi
    
    if ! command -v redis-server &> /dev/null; then
        print_warning "Redis is not installed. Please install Redis first."
    fi
    
    print_status "Requirements check completed"
}

# Setup Flutter project
setup_flutter() {
    echo "Setting up Flutter project..."
    
    cd /home/jcsiq98/ubermench
    
    # Get Flutter dependencies
    flutter pub get
    
    # Generate code
    flutter packages pub run build_runner build
    
    print_status "Flutter project setup completed"
}

# Setup backend
setup_backend() {
    echo "Setting up backend..."
    
    cd /home/jcsiq98/ubermench/backend
    
    # Install dependencies
    npm install
    
    # Create .env file if it doesn't exist
    if [ ! -f .env ]; then
        cp env.example .env
        print_warning "Created .env file from template. Please update with your configuration."
    fi
    
    print_status "Backend setup completed"
}

# Setup database
setup_database() {
    echo "Setting up database..."
    
    # Check if PostgreSQL is running
    if ! pg_isready -q; then
        print_error "PostgreSQL is not running. Please start PostgreSQL first."
        return 1
    fi
    
    # Create database if it doesn't exist
    createdb servicios_uber 2>/dev/null || print_warning "Database 'servicios_uber' already exists or creation failed"
    
    # Run migrations
    cd /home/jcsiq98/ubermench/backend
    npm run migrate
    
    # Seed database
    npm run seed
    
    print_status "Database setup completed"
}

# Setup Redis
setup_redis() {
    echo "Setting up Redis..."
    
    # Check if Redis is running
    if ! redis-cli ping &> /dev/null; then
        print_warning "Redis is not running. Please start Redis first."
        return 1
    fi
    
    print_status "Redis setup completed"
}

# Main setup function
main() {
    echo "Starting setup process..."
    
    check_requirements
    setup_flutter
    setup_backend
    
    # Try to setup database and Redis, but don't fail if they're not available
    setup_database || print_warning "Database setup skipped"
    setup_redis || print_warning "Redis setup skipped"
    
    echo ""
    echo "🎉 Setup completed!"
    echo ""
    echo "Next steps:"
    echo "1. Update backend/.env with your configuration"
    echo "2. Configure Firebase in lib/core/config/firebase_options.dart"
    echo "3. Start the backend: cd backend && npm run dev"
    echo "4. Start the Flutter app: flutter run"
    echo ""
    echo "For detailed instructions, see README.md"
}

# Run main function
main "$@"


