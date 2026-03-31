const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { db } = require('../config/database');
const { redisClient } = require('../config/redis');

// Validation schemas
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('customer', 'provider').required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Generate JWT token
const generateToken = (userId, role) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Register new user
const register = async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, email, phone, password, role } = value;

    // Check if user already exists
    const existingUser = await db('users').where({ email }).first();
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const [user] = await db('users')
      .insert({
        name,
        email,
        phone,
        password: hashedPassword,
        role,
        rating_average: 0.0,
        created_at: new Date()
      })
      .returning(['id', 'name', 'email', 'phone', 'role', 'rating_average', 'created_at']);

    // If provider, create provider profile
    if (role === 'provider') {
      await db('providers').insert({
        user_id: user.id,
        service_types: JSON.stringify([]),
        is_online: false,
        lat: 0,
        lng: 0,
        rating_average: 0.0,
        total_jobs: 0,
        bio: '',
        portfolio_images: JSON.stringify([]),
        created_at: new Date()
      });
    }

    // Generate token
    const token = generateToken(user.id, user.role);

    res.status(201).json({
      message: 'User created successfully',
      user,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password } = value;

    // Find user
    const user = await db('users').where({ email }).first();
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user.id, user.role);

    // Store user session in Redis
    await redisClient.setex(`user:${user.id}`, 86400, JSON.stringify({
      id: user.id,
      role: user.role,
      lastLogin: new Date()
    }));

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      user: userWithoutPassword,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Logout user
const logout = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Remove session from Redis
    await redisClient.del(`user:${userId}`);
    
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Verify token middleware
const verifyToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if session exists in Redis
    const session = await redisClient.get(`user:${decoded.userId}`);
    if (!session) {
      return res.status(401).json({ error: 'Session expired' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = {
  register,
  login,
  logout,
  verifyToken
};


