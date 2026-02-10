const axios = require('axios');
require('dotenv').config();

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

// Base URL for sending messages
const getMessagesUrl = () => `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`;

// Common headers
const getHeaders = () => ({
  'Authorization': `Bearer ${ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
});

/**
 * Send a plain text message
 */
const sendTextMessage = async (to, text) => {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text },
  };

  return sendMessage(payload);
};

/**
 * Send an interactive list message (up to 10 items per section)
 * @param {string} to - recipient phone number
 * @param {string} headerText - header text
 * @param {string} bodyText - body text
 * @param {string} footerText - footer text
 * @param {string} buttonText - text on the list button
 * @param {Array} sections - array of { title, rows: [{ id, title, description }] }
 */
const sendInteractiveList = async (to, headerText, bodyText, footerText, buttonText, sections) => {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: headerText,
      },
      body: {
        text: bodyText,
      },
      footer: {
        text: footerText,
      },
      action: {
        button: buttonText,
        sections,
      },
    },
  };

  return sendMessage(payload);
};

/**
 * Send interactive reply buttons (max 3 buttons)
 * @param {string} to - recipient phone number
 * @param {string} bodyText - message body
 * @param {Array} buttons - array of { id, title } (max 3, title max 20 chars)
 */
const sendInteractiveButtons = async (to, bodyText, buttons) => {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: bodyText,
      },
      action: {
        buttons: buttons.map((btn) => ({
          type: 'reply',
          reply: {
            id: btn.id,
            title: btn.title,
          },
        })),
      },
    },
  };

  return sendMessage(payload);
};

/**
 * Send an image message
 */
const sendImage = async (to, imageUrl, caption = '') => {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'image',
    image: {
      link: imageUrl,
      caption,
    },
  };

  return sendMessage(payload);
};

/**
 * Mark a message as read
 */
const markAsRead = async (messageId) => {
  const payload = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };

  return sendMessage(payload);
};

/**
 * Core function to send any message payload to WhatsApp Cloud API
 */
const sendMessage = async (payload) => {
  try {
    const response = await axios.post(getMessagesUrl(), payload, {
      headers: getHeaders(),
    });

    console.log(`[WhatsApp] Message sent to ${payload.to || 'N/A'}:`, response.data);
    return { success: true, data: response.data };
  } catch (error) {
    const errData = error.response?.data || error.message;
    console.error(`[WhatsApp] Error sending message:`, JSON.stringify(errData, null, 2));
    return { success: false, error: errData };
  }
};

module.exports = {
  sendTextMessage,
  sendInteractiveList,
  sendInteractiveButtons,
  sendImage,
  markAsRead,
  sendMessage,
};

