const whatsapp = require('../services/whatsappService');
const sessionManager = require('../services/sessionManager');
const { db } = require('../config/database');
const { handleCustomerMessage } = require('../handlers/customerHandler');
const { handleProviderMessage } = require('../handlers/providerHandler');
const { getChatSession, relayMessage } = require('../services/chatService');

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

      // ── M5: Check for active chat session first ──
      const chatSession = await getChatSession(senderPhone);
      if (chatSession) {
        // Handle chat-specific commands (let handlers process these)
        const text = message.type === 'text' ? message.text?.body?.trim().toLowerCase() : '';
        const isChatCommand = text === 'end chat' || text === 'cerrar chat' || 
                             (text === 'complete' || text === 'completar');
        
        if (!isChatCommand) {
          // Relay message (non-command messages)
          const result = await relayMessage(senderPhone, message, senderName);
          if (result.success) {
            return; // Message relayed, don't process further
          }
          // If relay failed, continue to handler for error handling
        }
        // If it's a command, continue to handler for proper state management
      }

      // ── Route message based on session state FIRST, then user role ──
      const session = await sessionManager.getSession(senderPhone);
      const sessionState = session?.state || 'NEW';

      // Customer-only states: ONLY ever set by the customer handler.
      // If a user is in one of these, they MUST be in the customer flow,
      // regardless of their DB role (e.g. a provider using customer mode).
      const customerOnlyStates = [
        'WELCOME',
        'AWAITING_SERVICE_SELECTION',
        'AWAITING_NAME',
        'SERVICE_SELECTED',
        'PROVIDER_LIST',
        'PROVIDER_DETAIL',
        'AWAITING_LOCATION',
        'AWAITING_DESCRIPTION',
        'BOOKING_CONFIRMED',
        // M6: Customer rating flow
        'AWAITING_RATING',
        'AWAITING_RATING_FINE',
        'AWAITING_RATING_COMMENT',
      ];

      // Provider-only states: ONLY ever set by the provider handler.
      const providerOnlyStates = [
        'REGISTRATION_START',
        'AWAITING_PROVIDER_NAME',
        'AWAITING_SERVICE_TYPES',
        'AWAITING_BIO',
        'IDLE',
        'REQUEST_RECEIVED',
        'AWAITING_REQUEST_RESPONSE',
        // M6: Provider rating flow
        'AWAITING_PROVIDER_RATING',
        'AWAITING_PROVIDER_RATING_FINE',
        'AWAITING_PROVIDER_RATING_COMMENT',
      ];

      const isInCustomerFlow = customerOnlyStates.includes(sessionState);
      const isInProviderFlow = providerOnlyStates.includes(sessionState);

      // Check if user is a provider in DB
      const user = await db('users').where({ phone: senderPhone }).first();
      const isProvider = user && user.role === 'provider';

      // Check for provider registration keyword (works even if not registered)
      const text = message.type === 'text' ? message.text?.body?.trim().toLowerCase() : '';
      const isProviderRegistration = text === 'register provider' || text === 'registrar proveedor';

      // ── Routing priority ──
      // 1. Session state is customer-only → customer handler (even if DB role is provider)
      // 2. Session state is provider-only → provider handler
      // 3. Provider registration keyword → provider handler
      // 4. DB role is provider → provider handler (shows menu with customer mode option)
      // 5. Default → customer handler
      if (isInCustomerFlow) {
        await handleCustomerMessage(senderPhone, senderName, message);
      } else if (isInProviderFlow || isProviderRegistration) {
        await handleProviderMessage(senderPhone, senderName, message);
      } else if (isProvider) {
        await handleProviderMessage(senderPhone, senderName, message);
      } else {
        await handleCustomerMessage(senderPhone, senderName, message);
      }
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
