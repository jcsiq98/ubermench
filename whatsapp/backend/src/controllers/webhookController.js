const whatsapp = require('../services/whatsappService');
const sessionManager = require('../services/sessionManager');
const { db } = require('../config/database');
const { handleCustomerMessage } = require('../handlers/customerHandler');

/**
 * GET /api/webhook — Webhook verification (Meta challenge)
 */
const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Webhook] Verification successful');
    return res.status(200).send(challenge);
  }

  console.warn('[Webhook] Verification failed — invalid token');
  return res.status(403).json({ error: 'Forbidden' });
};

/**
 * POST /api/webhook — Receive incoming WhatsApp messages
 */
const receiveMessage = async (req, res) => {
  try {
    // Always respond 200 quickly to avoid Meta retries
    res.status(200).json({ status: 'received' });

    const body = req.body;

    // Validate it's a WhatsApp message notification
    if (
      !body.object ||
      !body.entry ||
      !body.entry[0]?.changes ||
      !body.entry[0]?.changes[0]?.value
    ) {
      return;
    }

    const value = body.entry[0].changes[0].value;

    // Handle message status updates (sent, delivered, read)
    if (value.statuses) {
      for (const status of value.statuses) {
        console.log(`[Webhook] Message ${status.id} status: ${status.status}`);
        await logMessage({
          wamid: status.id,
          phoneNumber: status.recipient_id,
          direction: 'outbound',
          messageType: 'status',
          content: { status: status.status },
          status: status.status,
        });
      }
      return;
    }

    // Handle incoming messages
    if (!value.messages || value.messages.length === 0) {
      return;
    }

    for (const message of value.messages) {
      const senderPhone = message.from;
      const senderName = value.contacts?.[0]?.profile?.name || 'Unknown';
      const messageId = message.id;

      console.log(`[Webhook] Message from ${senderPhone} (${senderName}): type=${message.type}`);

      // Mark as read
      await whatsapp.markAsRead(messageId);

      // Log inbound message
      await logMessage({
        wamid: messageId,
        phoneNumber: senderPhone,
        direction: 'inbound',
        messageType: message.type,
        content: extractMessageContent(message),
        status: 'received',
      });

      // Route to the customer handler (state machine)
      await handleCustomerMessage(senderPhone, senderName, message);
    }
  } catch (error) {
    console.error('[Webhook] Error processing message:', error);
  }
};

/**
 * Extract readable content from any message type
 */
const extractMessageContent = (message) => {
  switch (message.type) {
    case 'text':
      return { text: message.text?.body || '' };
    case 'interactive':
      if (message.interactive?.type === 'list_reply') {
        return {
          type: 'list_reply',
          id: message.interactive.list_reply.id,
          title: message.interactive.list_reply.title,
          description: message.interactive.list_reply.description || '',
        };
      }
      if (message.interactive?.type === 'button_reply') {
        return {
          type: 'button_reply',
          id: message.interactive.button_reply.id,
          title: message.interactive.button_reply.title,
        };
      }
      return { raw: message.interactive };
    case 'location':
      return {
        latitude: message.location?.latitude,
        longitude: message.location?.longitude,
        name: message.location?.name || '',
        address: message.location?.address || '',
      };
    case 'image':
      return { imageId: message.image?.id, caption: message.image?.caption || '' };
    case 'audio':
      return { audioId: message.audio?.id };
    case 'document':
      return { documentId: message.document?.id, filename: message.document?.filename || '' };
    default:
      return { raw: message };
  }
};

/**
 * Log a message to the database
 */
const logMessage = async ({ wamid, phoneNumber, direction, messageType, content, status }) => {
  try {
    await db('whatsapp_messages_log').insert({
      id: require('crypto').randomUUID(),
      wamid,
      phone_number: phoneNumber,
      direction,
      message_type: messageType,
      content: JSON.stringify(content),
      status,
      created_at: new Date(),
    });
  } catch (error) {
    // Don't fail the webhook if logging fails
    console.error('[Webhook] Failed to log message:', error.message);
  }
};

module.exports = {
  verifyWebhook,
  receiveMessage,
};
