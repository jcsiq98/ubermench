const { redisClient } = require('../config/redis');
require('dotenv').config();

const SESSION_TTL = 60 * 60 * 24; // 24 hours in seconds
const SESSION_PREFIX = 'wa_session:';

/**
 * Get the current session for a phone number
 * @param {string} phoneNumber
 * @returns {Object|null} Session data with state and context
 */
const getSession = async (phoneNumber) => {
  try {
    const key = `${SESSION_PREFIX}${phoneNumber}`;
    const data = await redisClient.get(key);
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    console.error(`[SessionManager] Error getting session for ${phoneNumber}:`, error.message);
    return null;
  }
};

/**
 * Create or update a session
 * @param {string} phoneNumber
 * @param {string} state - current conversation state
 * @param {Object} data - arbitrary context data to store
 */
const setSession = async (phoneNumber, state, data = {}) => {
  try {
    const key = `${SESSION_PREFIX}${phoneNumber}`;
    const session = {
      phoneNumber,
      state,
      data,
      updatedAt: new Date().toISOString(),
    };
    await redisClient.setex(key, SESSION_TTL, JSON.stringify(session));
    console.log(`[SessionManager] Session set for ${phoneNumber}: state=${state}`);
    return session;
  } catch (error) {
    console.error(`[SessionManager] Error setting session for ${phoneNumber}:`, error.message);
    return null;
  }
};

/**
 * Clear / delete a session
 * @param {string} phoneNumber
 */
const clearSession = async (phoneNumber) => {
  try {
    const key = `${SESSION_PREFIX}${phoneNumber}`;
    await redisClient.del(key);
    console.log(`[SessionManager] Session cleared for ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error(`[SessionManager] Error clearing session for ${phoneNumber}:`, error.message);
    return false;
  }
};

module.exports = {
  getSession,
  setSession,
  clearSession,
};

