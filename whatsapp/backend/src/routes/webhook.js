const express = require('express');
const router = express.Router();
const { verifyWebhook, receiveMessage } = require('../controllers/webhookController');

// GET /api/webhook — Meta verification challenge
router.get('/', verifyWebhook);

// POST /api/webhook — Receive incoming messages
router.post('/', receiveMessage);

module.exports = router;

