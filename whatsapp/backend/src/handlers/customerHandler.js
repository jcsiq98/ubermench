const whatsapp = require('../services/whatsappService');
const sessionManager = require('../services/sessionManager');
const providerService = require('../services/providerService');
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
  // Milestone 3 — Provider listing, detail & booking
  PROVIDER_LIST: 'PROVIDER_LIST',
  PROVIDER_DETAIL: 'PROVIDER_DETAIL',
  AWAITING_LOCATION: 'AWAITING_LOCATION',
  AWAITING_DESCRIPTION: 'AWAITING_DESCRIPTION',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  // Future milestones
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
      // User selected a service & is registered — show provider list
      return await showProviderList(phone, sessionData);

    case STATES.PROVIDER_LIST:
      return await handleProviderListSelection(phone, waName, message, sessionData);

    case STATES.PROVIDER_DETAIL:
      return await handleProviderDetailAction(phone, waName, message, sessionData);

    case STATES.AWAITING_LOCATION:
      return await handleLocationInput(phone, waName, message, sessionData);

    case STATES.AWAITING_DESCRIPTION:
      return await handleDescriptionInput(phone, waName, message, sessionData);

    case STATES.BOOKING_CONFIRMED:
      return await handlePostBooking(phone, sessionData);

    default:
      return await handleUnknownState(phone, waName);
  }
};

// ──────────────────────────────────────────────
// State handlers — Milestones 1 & 2
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

      // ── M3: Immediately show provider list ──
      return await showProviderList(phone, updatedData);
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

  // ── M3: Immediately show provider list ──
  return await showProviderList(phone, updatedData);
};

// ──────────────────────────────────────────────
// State handlers — Milestone 3
// ──────────────────────────────────────────────

/**
 * Show the list of available providers for the selected service type.
 * Called after service selection (registered user) or after name registration (new user).
 */
const showProviderList = async (phone, sessionData) => {
  const serviceType = sessionData.serviceType;
  const serviceName = sessionData.serviceName || serviceType;

  if (!serviceType) {
    await whatsapp.sendTextMessage(phone, `❌ No service selected. Type "menu" to start over.`);
    return;
  }

  const providers = await providerService.getProvidersByServiceType(serviceType, 10);

  if (providers.length === 0) {
    // ── 3.5: No providers available ──
    await whatsapp.sendTextMessage(
      phone,
      `😕 No providers available for ${serviceName} right now.\n\nWould you like to:`
    );

    await whatsapp.sendInteractiveButtons(phone, 'Choose an option:', [
      { id: 'btn_try_another', title: '🔄 Try Another' },
      { id: 'btn_cancel', title: '❌ Cancel' },
    ]);

    await sessionManager.setSession(phone, STATES.PROVIDER_LIST, sessionData);
    return;
  }

  // ── 3.2: Format providers as interactive list ──
  const rows = providers.map((p) => {
    const rating = Number(p.rating_average).toFixed(1);
    // WhatsApp list row title max 24 chars
    const title = truncate(`⭐${rating} ${p.name}`, 24);
    // WhatsApp list row description max 72 chars
    const services = formatServiceTypes(p.service_types);
    const description = truncate(`${p.total_jobs} jobs | ${services}`, 72);

    return {
      id: `provider_${p.provider_id}`,
      title,
      description,
    };
  });

  const sections = [{ title: 'Available Providers', rows }];

  await whatsapp.sendInteractiveList(
    phone,
    `${serviceName} Providers`,
    `We found ${providers.length} provider${providers.length > 1 ? 's' : ''} for ${serviceName}.\n\nSelect a provider to see their profile and reviews.`,
    'Powered by Handy',
    'View Providers',
    sections
  );

  await sessionManager.setSession(phone, STATES.PROVIDER_LIST, sessionData);
};

/**
 * Handle user interaction when in PROVIDER_LIST state.
 * User can select a provider from the list, tap "Try Another", or "Cancel".
 */
const handleProviderListSelection = async (phone, waName, message, sessionData) => {
  if (message.type === 'interactive') {
    const content = extractInteractiveContent(message);

    // Handle list reply — user selected a provider
    if (content?.type === 'list_reply') {
      const providerId = extractProviderId(content.id);
      if (providerId) {
        return await showProviderDetail(phone, providerId, sessionData);
      }
    }

    // Handle button replies (from "no providers" screen)
    if (content?.type === 'button_reply') {
      if (content.id === 'btn_try_another') {
        await sendServiceCategoryList(phone);
        await sessionManager.setSession(phone, STATES.AWAITING_SERVICE_SELECTION, {
          userId: sessionData.userId,
          name: sessionData.name,
          waName: sessionData.waName,
        });
        return;
      }
      if (content.id === 'btn_cancel') {
        return await handleCancel(phone, waName);
      }
    }
  }

  // Text input — unrecognized
  await whatsapp.sendTextMessage(
    phone,
    `🤔 Please select a provider from the list above, or type "menu" to start over.`
  );
};

/**
 * Show the detail card for a specific provider.
 * Includes bio, rating, jobs count, and recent reviews.
 */
const showProviderDetail = async (phone, providerId, sessionData) => {
  const provider = await providerService.getProviderDetail(providerId);

  if (!provider) {
    await whatsapp.sendTextMessage(phone, `❌ Provider not found. Please try again.`);
    return await showProviderList(phone, sessionData);
  }

  const reviews = await providerService.getProviderReviews(providerId, 3);

  // ── 3.3: Build detail card ──
  const rating = Number(provider.rating_average).toFixed(1);
  const services = formatServiceTypes(provider.service_types);

  let detailMsg = `👤 *${provider.name}*\n`;
  detailMsg += `⭐ Rating: ${rating}/5.0 (${provider.total_jobs} jobs)\n`;
  detailMsg += `🛠 Services: ${services}\n\n`;
  detailMsg += `📝 *Bio:* ${provider.bio || 'No bio available.'}\n\n`;

  if (reviews.length > 0) {
    detailMsg += `💬 *Recent Reviews:*\n━━━━━━━━━━━━━━━\n`;
    for (const review of reviews) {
      const stars = getStarString(review.stars);
      const reviewer = getFirstName(review.reviewer_name);
      const comment = review.comment ? `"${review.comment}"` : '(no comment)';
      detailMsg += `${stars} — ${comment} — ${reviewer}\n`;
    }
  } else {
    detailMsg += `💬 No reviews yet.`;
  }

  await whatsapp.sendTextMessage(phone, detailMsg);

  // Action buttons
  await whatsapp.sendInteractiveButtons(
    phone,
    'What would you like to do?',
    [
      { id: 'btn_book_provider', title: '✅ Book Provider' },
      { id: 'btn_back_to_list', title: '🔙 Back to List' },
      { id: 'btn_cancel', title: '❌ Cancel' },
    ]
  );

  // Store selected provider in session
  const updatedData = {
    ...sessionData,
    selectedProviderId: provider.provider_id,
    selectedProviderUserId: provider.user_id,
    selectedProviderName: provider.name,
  };

  await sessionManager.setSession(phone, STATES.PROVIDER_DETAIL, updatedData);
};

/**
 * Handle user interaction when viewing a provider detail card.
 * Options: Book This Provider, Back to List, Cancel.
 */
const handleProviderDetailAction = async (phone, waName, message, sessionData) => {
  if (message.type === 'interactive') {
    const content = extractInteractiveContent(message);

    if (content?.type === 'button_reply') {
      switch (content.id) {
        case 'btn_book_provider':
          // ── 3.4: Start booking flow — ask for location ──
          await whatsapp.sendTextMessage(
            phone,
            `📍 Please share your location or type your address where you need the service.`
          );
          await sessionManager.setSession(phone, STATES.AWAITING_LOCATION, sessionData);
          return;

        case 'btn_back_to_list':
          // Re-show provider list for same service
          return await showProviderList(phone, sessionData);

        case 'btn_cancel':
          return await handleCancel(phone, waName);
      }
    }
  }

  // Unrecognized input
  await whatsapp.sendTextMessage(
    phone,
    `🤔 Please tap one of the buttons above, or type "menu" to start over.`
  );
};

/**
 * Handle location/address input during the booking flow.
 * Accepts WhatsApp location sharing OR a typed text address.
 */
const handleLocationInput = async (phone, waName, message, sessionData) => {
  let address = null;
  let lat = 0;
  let lng = 0;

  // WhatsApp location message
  if (message.type === 'location') {
    lat = message.location?.latitude || 0;
    lng = message.location?.longitude || 0;
    address = message.location?.address || message.location?.name || 'Shared Location';
    console.log(`[CustomerHandler] Location received: ${lat}, ${lng} — ${address}`);
  }

  // Text address
  if (message.type === 'text') {
    const text = message.text?.body?.trim();
    if (text && text.length >= 3) {
      address = text;
    }
  }

  if (!address) {
    await whatsapp.sendTextMessage(
      phone,
      `📍 Please share your WhatsApp location or type your address (at least 3 characters).`
    );
    return;
  }

  // Save location data and ask for description
  const updatedData = { ...sessionData, address, lat, lng };

  await whatsapp.sendTextMessage(
    phone,
    `📝 Briefly describe what you need (or send *"skip"* to continue):`
  );

  await sessionManager.setSession(phone, STATES.AWAITING_DESCRIPTION, updatedData);
};

/**
 * Handle service description input.
 * User can type a description or send "skip".
 */
const handleDescriptionInput = async (phone, waName, message, sessionData) => {
  if (message.type !== 'text') {
    await whatsapp.sendTextMessage(phone, `📝 Please type a description or send "skip" to continue.`);
    return;
  }

  const text = message.text?.body?.trim() || '';
  const description = text.toLowerCase() === 'skip' ? '' : text;

  // ── Create the service request in the database ──
  const requestId = crypto.randomUUID();
  try {
    await db('service_requests').insert({
      id: requestId,
      customer_id: sessionData.userId,
      service_type: sessionData.serviceType,
      status: 'created',
      origin_lat: sessionData.lat || 0,
      origin_lng: sessionData.lng || 0,
      address: sessionData.address,
      description: description,
      provider_id: sessionData.selectedProviderId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    console.log(`[CustomerHandler] Service request created: ${requestId}`);
  } catch (error) {
    console.error('[CustomerHandler] Error creating service request:', error.message);
    await whatsapp.sendTextMessage(phone, `❌ Something went wrong creating your request. Please try again.`);
    return;
  }

  // ── Send booking confirmation ──
  const serviceName = sessionData.serviceName || sessionData.serviceType;
  const providerName = sessionData.selectedProviderName || 'your provider';

  let confirmMsg = `✅ *Request Created!*\n\n`;
  confirmMsg += `🛠 Service: ${serviceName}\n`;
  confirmMsg += `👤 Provider: ${providerName}\n`;
  confirmMsg += `📍 Address: ${sessionData.address}\n`;
  if (description) {
    confirmMsg += `📝 Description: ${description}\n`;
  }
  confirmMsg += `\nWe're notifying the provider now. You'll receive a confirmation shortly!`;

  await whatsapp.sendTextMessage(phone, confirmMsg);

  // Update session to BOOKING_CONFIRMED
  const updatedData = {
    ...sessionData,
    requestId,
    description,
  };
  await sessionManager.setSession(phone, STATES.BOOKING_CONFIRMED, updatedData);
};

/**
 * Handle messages after a booking has been confirmed.
 * Show booking status or redirect to menu.
 */
const handlePostBooking = async (phone, sessionData) => {
  const serviceName = sessionData.serviceName || sessionData.serviceType;
  const providerName = sessionData.selectedProviderName || 'your provider';

  await whatsapp.sendTextMessage(
    phone,
    `📋 Your request for *${serviceName}* with *${providerName}* has been submitted!\n\nWe'll notify you when the provider responds.\n\nType "menu" to book another service or "help" for assistance.`
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
 * Extract provider ID from a list reply id (e.g. "provider_abc-123" → "abc-123")
 */
const extractProviderId = (listReplyId) => {
  if (!listReplyId || !listReplyId.startsWith('provider_')) return null;
  return listReplyId.replace('provider_', '');
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

/**
 * Generate a star string from a rating number (e.g. 5 → "⭐⭐⭐⭐⭐")
 */
const getStarString = (stars) => {
  const count = Math.min(Math.max(Math.round(stars), 0), 5);
  return '⭐'.repeat(count);
};

/**
 * Get the first name + last initial for privacy (e.g. "Maria Garcia" → "Maria G.")
 */
const getFirstName = (fullName) => {
  if (!fullName) return 'Anonymous';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length > 1) {
    return `${parts[0]} ${parts[1][0]}.`;
  }
  return parts[0];
};

/**
 * Parse service_types JSON and return a readable string
 */
const formatServiceTypes = (serviceTypesJson) => {
  try {
    const types = typeof serviceTypesJson === 'string'
      ? JSON.parse(serviceTypesJson)
      : serviceTypesJson;
    if (!Array.isArray(types)) return 'Various';
    return types.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ');
  } catch {
    return 'Various';
  }
};

/**
 * Truncate a string to maxLen characters, adding "…" if truncated
 */
const truncate = (str, maxLen) => {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
};

module.exports = {
  handleCustomerMessage,
  STATES,
};
