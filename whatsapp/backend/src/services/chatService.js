const { redisClient } = require('../config/redis');
const { db } = require('../config/database');
const whatsapp = require('./whatsappService');
const crypto = require('crypto');

const CHAT_SESSION_TTL = 60 * 60 * 24; // 24 hours in seconds
const CHAT_PREFIX = 'chat:';
const CHAT_CUSTOMER_PREFIX = 'chat:customer:';
const CHAT_PROVIDER_PREFIX = 'chat:provider:';

/**
 * Start a chat session between customer and provider for a specific request.
 * Stores session info in Redis for fast lookup.
 *
 * @param {string} requestId - service_requests.id
 * @param {string} customerPhone - customer's WhatsApp phone number
 * @param {string} providerPhone - provider's WhatsApp phone number
 * @param {string} customerName - customer's name
 * @param {string} providerName - provider's name
 */
const startChatSession = async (requestId, customerPhone, providerPhone, customerName, providerName) => {
  try {
    const sessionData = {
      requestId,
      customerPhone,
      providerPhone,
      customerName,
      providerName,
      startedAt: new Date().toISOString(),
    };

    // Store in Redis with TTL
    const customerKey = `${CHAT_CUSTOMER_PREFIX}${customerPhone}`;
    const providerKey = `${CHAT_PROVIDER_PREFIX}${providerPhone}`;

    await redisClient.setex(customerKey, CHAT_SESSION_TTL, JSON.stringify(sessionData));
    await redisClient.setex(providerKey, CHAT_SESSION_TTL, JSON.stringify(sessionData));

    console.log(`[ChatService] Chat session started for request ${requestId}`);

    // Notify both parties
    await whatsapp.sendTextMessage(
      customerPhone,
      `💬 *Chat Started*\n\nYou're now connected with ${providerName}. You can send messages directly!`
    );

    await whatsapp.sendTextMessage(
      providerPhone,
      `💬 *Chat Started*\n\nYou're now connected with ${customerName}. You can send messages directly!`
    );

    return sessionData;
  } catch (error) {
    console.error('[ChatService] Error starting chat session:', error.message);
    return null;
  }
};

/**
 * Get active chat session for a phone number.
 *
 * @param {string} phone - phone number (customer or provider)
 * @returns {Object|null} session data or null if no active session
 */
const getChatSession = async (phone) => {
  try {
    // Try customer key first
    let key = `${CHAT_CUSTOMER_PREFIX}${phone}`;
    let data = await redisClient.get(key);

    if (!data) {
      // Try provider key
      key = `${CHAT_PROVIDER_PREFIX}${phone}`;
      data = await redisClient.get(key);
    }

    if (!data) return null;

    return JSON.parse(data);
  } catch (error) {
    console.error(`[ChatService] Error getting chat session for ${phone}:`, error.message);
    return null;
  }
};

/**
 * Relay a message from sender to recipient.
 * Handles text, image, location, and audio messages.
 *
 * @param {string} senderPhone - sender's phone number
 * @param {Object} message - WhatsApp message object
 * @param {string} senderName - sender's name (optional, will be fetched if not provided)
 */
const relayMessage = async (senderPhone, message, senderName = null) => {
  try {
    const session = await getChatSession(senderPhone);
    if (!session) {
      return { success: false, error: 'No active chat session' };
    }

    // Determine if sender is customer
    const isCustomer = session.customerPhone === senderPhone;

    // Get sender name if not provided
    if (!senderName) {
      const sender = await db('users').where('phone', senderPhone).first();
      senderName = sender ? sender.name : (isCustomer ? session.customerName : session.providerName);
    }
    const recipientPhone = isCustomer ? session.providerPhone : session.customerPhone;
    const recipientName = isCustomer ? session.providerName : session.customerName;

    // Format message with sender attribution
    const prefix = `👤 ${senderName}: `;

    // Handle different message types
    let relayed = false;
    let messageContent = '';
    let messageType = 'text';

    switch (message.type) {
      case 'text':
        messageContent = message.text?.body || '';
        await whatsapp.sendTextMessage(recipientPhone, `${prefix}${messageContent}`);
        relayed = true;
        messageType = 'text';
        break;

      case 'image':
        const imageId = message.image?.id;
        const caption = message.image?.caption || '';
        if (imageId) {
          // For images, we need to download and re-upload or use the image URL
          // WhatsApp Cloud API requires us to use the media URL
          // For now, send a text notification with image info
          await whatsapp.sendTextMessage(
            recipientPhone,
            `${prefix}📷 Image${caption ? `: ${caption}` : ''}`
          );
          // Note: Full image relay requires downloading from WhatsApp and re-uploading
          // This is a limitation - we'll notify about the image
          relayed = true;
          messageType = 'image';
          messageContent = JSON.stringify({ imageId, caption });
        }
        break;

      case 'location':
        const lat = message.location?.latitude;
        const lng = message.location?.longitude;
        const locationName = message.location?.name || '';
        const locationAddress = message.location?.address || '';

        await whatsapp.sendTextMessage(
          recipientPhone,
          `${prefix}📍 Location: ${locationName || locationAddress || `${lat}, ${lng}`}`
        );

        // Send location via WhatsApp (if we have coordinates)
        if (lat && lng) {
          // Note: WhatsApp Cloud API doesn't support forwarding location directly
          // We'll send a text notification for now
          // Full location relay would require using Google Maps link or similar
        }

        relayed = true;
        messageType = 'location';
        messageContent = JSON.stringify({ lat, lng, name: locationName, address: locationAddress });
        break;

      case 'audio':
        const audioId = message.audio?.id;
        await whatsapp.sendTextMessage(recipientPhone, `${prefix}🎤 Voice message`);
        relayed = true;
        messageType = 'text'; // Store as text since we can't relay audio easily
        messageContent = JSON.stringify({ audioId });
        break;

      default:
        await whatsapp.sendTextMessage(recipientPhone, `${prefix}📎 Message (unsupported type)`);
        relayed = true;
        messageType = 'text';
        messageContent = JSON.stringify(message);
    }

    if (relayed) {
      // Persist message to database
      await persistMessage(session.requestId, senderPhone, messageContent, messageType);

      console.log(`[ChatService] Message relayed from ${senderPhone} to ${recipientPhone}`);
      return { success: true, session };
    }

    return { success: false, error: 'Message type not supported' };
  } catch (error) {
    console.error('[ChatService] Error relaying message:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * End a chat session.
 * Removes session from Redis and notifies both parties.
 *
 * @param {string} requestId - service_requests.id
 * @param {string} endedBy - phone number of person who ended the chat
 */
const endChatSession = async (requestId, endedBy) => {
  try {
    // Find session by requestId (we need to search Redis or query DB)
    // For simplicity, we'll get it from the person who ended it
    const session = await getChatSession(endedBy);
    if (!session || session.requestId !== requestId) {
      return { success: false, error: 'Session not found' };
    }

    const { customerPhone, providerPhone, customerName, providerName } = session;

    // Remove from Redis
    await redisClient.del(`${CHAT_CUSTOMER_PREFIX}${customerPhone}`);
    await redisClient.del(`${CHAT_PROVIDER_PREFIX}${providerPhone}`);

    // Notify both parties
    const endedByName = endedBy === customerPhone ? customerName : providerName;

    await whatsapp.sendTextMessage(
      customerPhone,
      `💬 Chat ended by ${endedByName}.\n\nType "menu" to start a new service request.`
    );

    await whatsapp.sendTextMessage(
      providerPhone,
      `💬 Chat ended by ${endedByName}.\n\nType "menu" to return to your dashboard.`
    );

    console.log(`[ChatService] Chat session ended for request ${requestId}`);
    return { success: true };
  } catch (error) {
    console.error('[ChatService] Error ending chat session:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Mark service as completed (provider action).
 * Ends chat session and transitions to rating flow.
 *
 * @param {string} requestId - service_requests.id
 * @param {string} providerPhone - provider's phone number
 */
const markServiceComplete = async (requestId, providerPhone) => {
  try {
    // Update service request status
    await db('service_requests')
      .where('id', requestId)
      .update({
        status: 'completed',
        completed_at: new Date(),
        updated_at: new Date(),
      });

    // Get session to notify customer
    const session = await getChatSession(providerPhone);
    if (session) {
      const { customerPhone, providerName } = session;

      // End chat session
      await endChatSession(requestId, providerPhone);

      // Notify customer (rating flow will be handled by customerHandler)
      await whatsapp.sendTextMessage(
        customerPhone,
        `✅ The service has been completed!\n\nHow was your experience with ${providerName}?`
      );

      // Notify provider
      await whatsapp.sendTextMessage(
        providerPhone,
        `✅ Service marked as completed!\n\nThe customer will be asked to rate your service.`
      );
    }

    console.log(`[ChatService] Service ${requestId} marked as complete`);
    return { success: true };
  } catch (error) {
    console.error('[ChatService] Error marking service complete:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Persist a relayed message to the database.
 *
 * @param {string} requestId - service_requests.id
 * @param {string} senderPhone - sender's phone number
 * @param {string} content - message content
 * @param {string} type - message type (text, image, location)
 */
const persistMessage = async (requestId, senderPhone, content, type = 'text') => {
  try {
    // Get sender user ID
    const sender = await db('users').where('phone', senderPhone).first();
    if (!sender) {
      console.warn(`[ChatService] Sender not found: ${senderPhone}`);
      return;
    }

    await db('messages').insert({
      id: crypto.randomUUID(),
      request_id: requestId,
      sender_id: sender.id,
      content: content,
      type: type,
      is_read: false,
      created_at: new Date(),
    });
  } catch (error) {
    console.error('[ChatService] Error persisting message:', error.message);
  }
};

/**
 * Check and clean up stale chat sessions (older than 24 hours).
 * This should be called periodically (e.g., via cron job).
 */
const cleanupStaleSessions = async () => {
  try {
    // This is a simplified version - in production, you'd want to scan Redis keys
    // and check TTL or timestamps
    // For now, Redis TTL handles this automatically
    console.log('[ChatService] Stale session cleanup - handled by Redis TTL');
  } catch (error) {
    console.error('[ChatService] Error cleaning up stale sessions:', error.message);
  }
};

module.exports = {
  startChatSession,
  getChatSession,
  relayMessage,
  endChatSession,
  markServiceComplete,
  persistMessage,
  cleanupStaleSessions,
};

