const whatsapp = require('../services/whatsappService');
const sessionManager = require('../services/sessionManager');
const { db } = require('../config/database');
const { getServiceListSections, getCategoryById, extractServiceId } = require('../constants/serviceCategories');
const crypto = require('crypto');

// ──────────────────────────────────────────────
// Conversation states for the customer flow
// ──────────────────────────────────────────────
const STATES = {
  NEW: 'NEW',
  WELCOME: 'WELCOME',
  AWAITING_SERVICE_SELECTION: 'AWAITING_SERVICE_SELECTION',
  AWAITING_NAME: 'AWAITING_NAME',
  SERVICE_SELECTED: 'SERVICE_SELECTED',
  REGISTERED: 'REGISTERED',
  // Future milestones
  PROVIDER_LIST: 'PROVIDER_LIST',
  PROVIDER_DETAIL: 'PROVIDER_DETAIL',
  BOOKING_CONFIRM: 'BOOKING_CONFIRM',
  CHAT_ACTIVE: 'CHAT_ACTIVE',
  RATING: 'RATING',
};

// ──────────────────────────────────────────────
// Main entry point — routes message by state
// ──────────────────────────────────────────────
const handleCustomerMessage = async (phone, waName, message) => {
  const session = await sessionManager.getSession(phone);
  const state = session?.state || STATES.NEW;
  const sessionData = session?.data || {};

  // Extract text for global keyword detection
  const text = extractText(message);

  // ── Global keywords (work from any state) ──
  if (text === 'menu' || text === 'start') {
    return await handleMenu(phone, waName);
  }
  if (text === 'help') {
    return await handleHelp(phone);
  }
  if (text === 'cancel') {
    return await handleCancel(phone, waName);
  }

  // ── State machine ──
  switch (state) {
    case STATES.NEW:
      return await handleNewUser(phone, waName);

    case STATES.WELCOME:
    case STATES.AWAITING_SERVICE_SELECTION:
      return await handleServiceSelection(phone, waName, message, sessionData);

    case STATES.AWAITING_NAME:
      return await handleNameRegistration(phone, waName, message, sessionData);

    case STATES.SERVICE_SELECTED:
    case STATES.REGISTERED:
      // User already selected a service and is registered
      // Transition to M3 (provider listing) — for now show confirmation
      return await handlePostRegistration(phone, sessionData);

    default:
      return await handleUnknownState(phone, waName);
  }
};

// ──────────────────────────────────────────────
// State handlers
// ──────────────────────────────────────────────

/**
 * Handle a completely new user (no session exists)
 */
const handleNewUser = async (phone, waName) => {
  // Check if this phone number is already registered in the DB
  const existingUser = await findUserByPhone(phone);

  if (existingUser) {
    return await handleReturningUser(phone, existingUser);
  }

  // Brand new user — send welcome + service list
  await whatsapp.sendTextMessage(
    phone,
    `👋 Welcome to *Handy*!\n\nWe connect you with trusted local service providers.\n\nWhat can we help you with today?`
  );

  await sendServiceCategoryList(phone);

  await sessionManager.setSession(phone, STATES.AWAITING_SERVICE_SELECTION, {
    waName: waName,
  });
};

/**
 * Handle a returning user (phone already in DB)
 */
const handleReturningUser = async (phone, user) => {
  // Check for active requests
  const activeRequest = await getActiveRequest(user.id);

  if (activeRequest) {
    // Show active request status
    const statusEmoji = getStatusEmoji(activeRequest.status);
    await whatsapp.sendTextMessage(
      phone,
      `👋 Welcome back, ${user.name}!\n\nYou have an active request:\n\n${statusEmoji} *${activeRequest.service_type.toUpperCase()}*\nStatus: ${activeRequest.status.replace('_', ' ')}\n${activeRequest.address ? `📍 ${activeRequest.address}` : ''}`
    );

    await whatsapp.sendInteractiveButtons(phone, 'What would you like to do?', [
      { id: 'btn_new_service', title: '📋 New Service' },
      { id: 'btn_my_requests', title: '📄 My Requests' },
      { id: 'btn_help', title: '❓ Help' },
    ]);

    await sessionManager.setSession(phone, STATES.WELCOME, {
      userId: user.id,
      name: user.name,
      isReturning: true,
    });
  } else {
    // No active requests — show quick menu
    await whatsapp.sendTextMessage(
      phone,
      `👋 Welcome back, ${user.name}! Great to see you again.`
    );

    await whatsapp.sendInteractiveButtons(phone, 'What would you like to do?', [
      { id: 'btn_new_service', title: '📋 Book a Service' },
      { id: 'btn_my_requests', title: '📄 My Requests' },
      { id: 'btn_help', title: '❓ Help' },
    ]);

    await sessionManager.setSession(phone, STATES.WELCOME, {
      userId: user.id,
      name: user.name,
      isReturning: true,
    });
  }
};

/**
 * Handle service category selection
 */
const handleServiceSelection = async (phone, waName, message, sessionData) => {
  let serviceId = null;

  // Handle interactive list reply (user tapped a service from the list)
  if (message.type === 'interactive') {
    const content = extractInteractiveContent(message);
    if (content?.type === 'list_reply') {
      serviceId = extractServiceId(content.id);
    } else if (content?.type === 'button_reply') {
      // Handle button replies from returning user menu
      if (content.id === 'btn_new_service') {
        await sendServiceCategoryList(phone);
        await sessionManager.setSession(phone, STATES.AWAITING_SERVICE_SELECTION, sessionData);
        return;
      }
      if (content.id === 'btn_my_requests') {
        await showMyRequests(phone, sessionData.userId);
        return;
      }
      if (content.id === 'btn_help') {
        return await handleHelp(phone);
      }
    }
  }

  // Handle text-based service selection (user typed a service name)
  if (!serviceId && message.type === 'text') {
    const text = extractText(message);
    serviceId = matchServiceByText(text);
  }

  // Valid service selected
  if (serviceId) {
    const category = getCategoryById(serviceId);
    if (!category) {
      await whatsapp.sendTextMessage(phone, `❌ Sorry, that service is not available. Please select from the list.`);
      await sendServiceCategoryList(phone);
      return;
    }

    const updatedData = { ...sessionData, serviceType: serviceId, serviceName: category.title };

    // Check if user is already registered
    const existingUser = await findUserByPhone(phone);

    if (existingUser) {
      // Already registered — skip name, go straight to provider list
      updatedData.userId = existingUser.id;
      updatedData.name = existingUser.name;

      await whatsapp.sendTextMessage(
        phone,
        `✅ Great choice! You selected: ${category.title}\n\n🔍 Searching for available providers...`
      );

      await sessionManager.setSession(phone, STATES.SERVICE_SELECTED, updatedData);

      // TODO (M3): Transition to provider listing
      await whatsapp.sendTextMessage(
        phone,
        `🚧 Provider listing is coming in the next update!\n\nYour selection (${category.title}) has been saved. Type "menu" to go back.`
      );
    } else {
      // New user — need to register first (ask for name)
      await whatsapp.sendTextMessage(
        phone,
        `✅ Great choice! You selected: ${category.title}\n\nBefore we find you a provider, what's your name?`
      );

      await sessionManager.setSession(phone, STATES.AWAITING_NAME, updatedData);
    }
    return;
  }

  // Nothing matched — re-show the list
  await whatsapp.sendTextMessage(
    phone,
    `🤔 I didn't understand that. Please select a service from the list below, or type "help" for assistance.`
  );
  await sendServiceCategoryList(phone);
};

/**
 * Handle name registration for new users
 */
const handleNameRegistration = async (phone, waName, message, sessionData) => {
  if (message.type !== 'text') {
    await whatsapp.sendTextMessage(phone, `📝 Please type your name to continue.`);
    return;
  }

  const name = message.text?.body?.trim();

  if (!name || name.length < 2) {
    await whatsapp.sendTextMessage(phone, `📝 Please enter a valid name (at least 2 characters).`);
    return;
  }

  if (name.length > 100) {
    await whatsapp.sendTextMessage(phone, `📝 Name is too long. Please enter a shorter name.`);
    return;
  }

  // Create user in DB
  const userId = crypto.randomUUID();
  try {
    await db('users').insert({
      id: userId,
      name: name,
      phone: phone,
      role: 'customer',
      whatsapp_name: waName || null,
      rating_average: 0,
      created_at: new Date(),
      updated_at: new Date(),
    });

    console.log(`[CustomerHandler] New user registered: ${name} (${phone}) — ID: ${userId}`);
  } catch (error) {
    console.error('[CustomerHandler] Error creating user:', error.message);
    await whatsapp.sendTextMessage(phone, `❌ Something went wrong. Please try again.`);
    return;
  }

  const updatedData = { ...sessionData, userId, name };

  await whatsapp.sendTextMessage(
    phone,
    `🎉 Nice to meet you, ${name}!\n\n🔍 Now searching for ${sessionData.serviceName || 'your service'} providers...`
  );

  await sessionManager.setSession(phone, STATES.REGISTERED, updatedData);

  // TODO (M3): Transition to provider listing
  await whatsapp.sendTextMessage(
    phone,
    `🚧 Provider listing is coming in the next update!\n\nYour registration and service selection have been saved. Type "menu" to go back.`
  );
};

/**
 * Handle post-registration state (placeholder for M3 transition)
 */
const handlePostRegistration = async (phone, sessionData) => {
  await whatsapp.sendTextMessage(
    phone,
    `You've already selected ${sessionData.serviceName || 'a service'}.\n\n🚧 Provider listing is coming soon!\n\nType "menu" to start over or "help" for assistance.`
  );
};

// ──────────────────────────────────────────────
// Global command handlers
// ──────────────────────────────────────────────

/**
 * Show main menu (service categories list)
 */
const handleMenu = async (phone, waName) => {
  const existingUser = await findUserByPhone(phone);

  if (existingUser) {
    await whatsapp.sendTextMessage(phone, `📋 Main Menu — What service do you need, ${existingUser.name}?`);
  } else {
    await whatsapp.sendTextMessage(phone, `📋 Main Menu — What service do you need?`);
  }

  await sendServiceCategoryList(phone);
  await sessionManager.setSession(phone, STATES.AWAITING_SERVICE_SELECTION, {
    waName,
    userId: existingUser?.id || null,
    name: existingUser?.name || waName,
  });
};

/**
 * Show help text
 */
const handleHelp = async (phone) => {
  await whatsapp.sendTextMessage(
    phone,
    `❓ *Handy Help*\n\nHere's what you can do:\n\n` +
    `📋 *"menu"* — Browse available services\n` +
    `❌ *"cancel"* — Cancel and start over\n` +
    `❓ *"help"* — Show this help message\n\n` +
    `Simply select a service category and we'll connect you with the best local providers, complete with ratings and reviews!\n\n` +
    `Need human assistance? Contact us at support@handy.com`
  );
};

/**
 * Cancel current flow and reset
 */
const handleCancel = async (phone, waName) => {
  await sessionManager.clearSession(phone);
  await whatsapp.sendTextMessage(
    phone,
    `✅ Your current action has been cancelled.\n\nType anything to start over or "menu" to see available services.`
  );
};

/**
 * Handle unknown/unexpected state
 */
const handleUnknownState = async (phone, waName) => {
  await sessionManager.clearSession(phone);
  await handleNewUser(phone, waName);
};

// ──────────────────────────────────────────────
// Helper functions
// ──────────────────────────────────────────────

/**
 * Send the service categories interactive list
 */
const sendServiceCategoryList = async (phone) => {
  await whatsapp.sendInteractiveList(
    phone,
    'Our Services',
    'We offer a wide range of professional services. Tap the button below to browse and select.',
    'Powered by Handy',
    'Browse Services',
    getServiceListSections()
  );
};

/**
 * Show user's past/active requests
 */
const showMyRequests = async (phone, userId) => {
  if (!userId) {
    await whatsapp.sendTextMessage(phone, `You don't have any requests yet. Type "menu" to book a service!`);
    return;
  }

  const requests = await db('service_requests')
    .where({ customer_id: userId })
    .orderBy('created_at', 'desc')
    .limit(5);

  if (requests.length === 0) {
    await whatsapp.sendTextMessage(phone, `📭 You don't have any requests yet.\n\nType "menu" to book your first service!`);
    return;
  }

  let msg = `📄 *Your Recent Requests:*\n\n`;
  for (const req of requests) {
    const emoji = getStatusEmoji(req.status);
    msg += `${emoji} *${req.service_type.toUpperCase()}*\n`;
    msg += `   Status: ${req.status.replace('_', ' ')}\n`;
    if (req.address) msg += `   📍 ${req.address}\n`;
    msg += `   📅 ${new Date(req.created_at).toLocaleDateString()}\n\n`;
  }
  msg += `Type "menu" to book a new service.`;

  await whatsapp.sendTextMessage(phone, msg);
};

/**
 * Extract text from a message (lowercased, trimmed)
 */
const extractText = (message) => {
  if (message.type === 'text') {
    return message.text?.body?.trim().toLowerCase() || '';
  }
  return '';
};

/**
 * Extract interactive content from a message
 */
const extractInteractiveContent = (message) => {
  if (message.type !== 'interactive') return null;

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
  return null;
};

/**
 * Try to match typed text to a service category
 */
const matchServiceByText = (text) => {
  const map = {
    plumbing: 'plumbing',
    plumber: 'plumbing',
    pipes: 'plumbing',
    electrical: 'electrical',
    electrician: 'electrical',
    electric: 'electrical',
    wiring: 'electrical',
    cleaning: 'cleaning',
    clean: 'cleaning',
    cleaner: 'cleaning',
    gardening: 'gardening',
    garden: 'gardening',
    lawn: 'gardening',
    landscaping: 'gardening',
    repair: 'repair',
    handyman: 'repair',
    fix: 'repair',
    other: 'other',
  };

  return map[text] || null;
};

/**
 * Find a user by phone number
 */
const findUserByPhone = async (phone) => {
  try {
    const user = await db('users').where({ phone }).first();
    return user || null;
  } catch (error) {
    console.error('[CustomerHandler] Error finding user:', error.message);
    return null;
  }
};

/**
 * Get active (non-completed, non-cancelled) request for a user
 */
const getActiveRequest = async (userId) => {
  try {
    const request = await db('service_requests')
      .where({ customer_id: userId })
      .whereNotIn('status', ['completed', 'cancelled', 'paid'])
      .orderBy('created_at', 'desc')
      .first();
    return request || null;
  } catch (error) {
    console.error('[CustomerHandler] Error getting active request:', error.message);
    return null;
  }
};

/**
 * Get emoji for request status
 */
const getStatusEmoji = (status) => {
  const map = {
    created: '🆕',
    searching: '🔍',
    provider_assigned: '👤',
    provider_arriving: '🚗',
    in_progress: '⏳',
    completed: '✅',
    cancelled: '❌',
    paid: '💰',
  };
  return map[status] || '📋';
};

module.exports = {
  handleCustomerMessage,
  STATES,
};

