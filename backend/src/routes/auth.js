const express = require('express');
const { register, login, logout, verifyToken } = require('../controllers/authController');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.post('/logout', verifyToken, logout);

module.exports = router;


