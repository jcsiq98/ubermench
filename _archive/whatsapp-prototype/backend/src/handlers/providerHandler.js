const whatsapp = require('../services/whatsappService');
const sessionManager = require('../services/sessionManager');
const { startChatSession, endChatSession, getChatSession, markServiceComplete } = require('../services/chatService');
const { db } = require('../config/database');
const crypto = require('crypto');
const { SERVICE_CATEGORIES, getServiceListSections } = require('../constants/serviceCategories');

// ──────────────────────────────────────────────
// Conversation states for the provider flow
// ──────────────────────────────────────────────
const STATES = {
  NEW: 'NEW',
  REGISTRATION_START: 'REGISTRATION_START',
  AWAITING_PROVIDER_NAME: 'AWAITING_PROVIDER_NAME',
  AWAITING_SERVICE_TYPES: 'AWAITING_SERVICE_TYPES',
  AWAITING_BIO: 'AWAITING_BIO',
  REGISTERED: 'REGISTERED',
  IDLE: 'IDLE',
  REQUEST_RECEIVED: 'REQUEST_RECEIVED',
  AWAITING_REQUEST_RESPONSE: 'AWAITING_REQUEST_RESPONSE',
  // Milestone 5 — Chat relay
  CHAT_ACTIVE: 'CHAT_ACTIVE',
  // Milestone 6 — Provider rates customer
  AWAITING_PROVIDER_RATING: 'AWAITING_PROVIDER_RATING',
  AWAITING_PROVIDER_RATING_FINE: 'AWAITING_PROVIDER_RATING_FINE',
  AWAITING_PROVIDER_RATING_COMMENT: 'AWAITING_PROVIDER_RATING_COMMENT',
};

// ──────────────────────────────────────────────
// Main entry point — routes message by state
// ──────────────────────────────────────────────
const handleProviderMessage = async (phone, waName, message) => {
  const session = await sessionManager.getSession(phone);
  const state = session?.state || STATES.NEW;
  const sessionData = session?.data || {};

  // Extract text for global keyword detection
  const text = extractText(message);

  // ── M6: During rating flow, "skip" skips the rating entirely ──
  const isInRatingFlow = [
    STATES.AWAITING_PROVIDER_RATING,
    STATES.AWAITING_PROVIDER_RATING_FINE,
    STATES.AWAITING_PROVIDER_RATING_COMMENT,
  ].includes(state);

  if (isInRatingFlow && text === 'skip') {
    await whatsapp.sendTextMessage(phone, `✅ Rating skipped. Thank you!`);
    return await completeRequestLifecycle(phone, sessionData);
  }

  // ── Global keywords (work from any state) ──
  if (text === 'help') {
    return await handleHelp(phone);
  }
  if (text === 'menu' || text === 'start') {
    return await handleMenu(phone, waName);
  }

  // ── Check if user is registered provider ──
  const existingUser = await findUserByPhone(phone);
  const isRegisteredProvider = existingUser && existingUser.role === 'provider';

  // ── Registration trigger keyword ──
  if (text === 'register provider' || text === 'registrar proveedor') {
    return await startProviderRegistration(phone, waName);
  }

  // ── Mode selection keywords (for providers who want to use as customer)
  if (text === 'customer mode' || text === 'modo cliente' || text === 'soy cliente') {
    // Clear provider session and route to customer handler
    await sessionManager.clearSession(phone);
    // Import and call customer handler
    const { handleCustomerMessage } = require('./customerHandler');
    return await handleCustomerMessage(phone, waName, message);
  }

  // ── If not registered and not starting registration, prompt ──
  if (!isRegisteredProvider && state === STATES.NEW) {
    return await handleNewProvider(phone, waName);
  }

  // ── State machine ──
  switch (state) {
    case STATES.NEW:
      // If registered provider, show menu with option to use as customer
      if (isRegisteredProvider) {
        return await handleProviderMenu(phone, waName);
      }
      return await handleNewProvider(phone, waName);

    case STATES.REGISTRATION_START:
    case STATES.AWAITING_PROVIDER_NAME:
      return await handleProviderName(phone, waName, message, sessionData);

    case STATES.AWAITING_SERVICE_TYPES:
      // Check if it's a button reply (Add More / Continue)
      if (message.type === 'interactive') {
        const content = extractInteractiveContent(message);
        if (content?.type === 'button_reply') {
          return await handleServiceTypesButtons(phone, content.id, sessionData);
        }
      }
      return await handleServiceTypesSelection(phone, waName, message, sessionData);

    case STATES.AWAITING_BIO:
      return await handleBioInput(phone, waName, message, sessionData);

    case STATES.REGISTERED:
    case STATES.IDLE:
      return await handleIdleState(phone, waName, message, sessionData);

    case STATES.REQUEST_RECEIVED:
    case STATES.AWAITING_REQUEST_RESPONSE:
      return await handleRequestResponse(phone, waName, message, sessionData);

    case STATES.CHAT_ACTIVE:
      return await handleProviderChatActive(phone, waName, message, sessionData);

    // ── Milestone 6: Provider rates customer ──
    case STATES.AWAITING_PROVIDER_RATING:
      return await handleProviderRatingSelection(phone, waName, message, sessionData);

    case STATES.AWAITING_PROVIDER_RATING_FINE:
      return await handleProviderRatingFine(phone, waName, message, sessionData);

    case STATES.AWAITING_PROVIDER_RATING_COMMENT:
      return await handleProviderRatingComment(phone, waName, message, sessionData);

    default:
      return await handleUnknownState(phone, waName);
  }
};

// ──────────────────────────────────────────────
// Registration Flow
// ──────────────────────────────────────────────

/**
 * Start provider registration flow
 */
const startProviderRegistration = async (phone, waName) => {
  // Check if already registered as provider
  const existingUser = await findUserByPhone(phone);
  if (existingUser && existingUser.role === 'provider') {
    await whatsapp.sendTextMessage(
      phone,
      `✅ You're already registered as a provider!\n\nType "menu" to see your options.`
    );
    return;
  }

  // If user is a customer, they can still register as provider
  // (they'll need to complete the registration flow)
  if (existingUser && existingUser.role === 'customer') {
    await whatsapp.sendTextMessage(
      phone,
      `👋 Hello ${existingUser.name}! You're currently registered as a customer.\n\nLet's register you as a provider. What's your name? (You can use a different name or the same: ${existingUser.name})`
    );
    await sessionManager.setSession(phone, STATES.AWAITING_PROVIDER_NAME, {
      waName,
      existingUserId: existingUser.id,
      isCustomerUpgrade: true,
    });
    return;
  }

  await whatsapp.sendTextMessage(
    phone,
    `👋 Welcome to *Handy Provider Registration*!\n\nLet's get you set up. First, what's your name?`
  );

  await sessionManager.setSession(phone, STATES.AWAITING_PROVIDER_NAME, {
    waName,
  });
};

/**
 * Handle new provider (not registered yet)
 */
const handleNewProvider = async (phone, waName) => {
  await whatsapp.sendTextMessage(
    phone,
    `👋 Hello! To register as a service provider, type:\n\n*"register provider"*\n\nOr send "help" for more information.`
  );
};

/**
 * Handle provider name input
 */
const handleProviderName = async (phone, waName, message, sessionData) => {
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

  const updatedData = { ...sessionData, name };

  await whatsapp.sendTextMessage(
    phone,
    `✅ Great, ${name}!\n\nWhat services do you offer? Select all that apply:`
  );

  // Send service categories as interactive list
  await whatsapp.sendInteractiveList(
    phone,
    'Select Services',
    'Choose the services you provide. You can select multiple.',
    'Powered by Handy',
    'Select Services',
    getServiceListSections()
  );

  await sessionManager.setSession(phone, STATES.AWAITING_SERVICE_TYPES, updatedData);
};

/**
 * Handle service types selection
 */
const handleServiceTypesSelection = async (phone, waName, message, sessionData) => {
  let selectedServiceId = null;

  if (message.type === 'interactive') {
    const content = extractInteractiveContent(message);
    if (content?.type === 'list_reply') {
      selectedServiceId = extractServiceId(content.id);
    }
  }

  if (!selectedServiceId) {
    await whatsapp.sendTextMessage(
      phone,
      `🤔 Please select a service from the list above.`
    );
    return;
  }

  // Store selected service (for now, single selection — can be extended to multi-select)
  const selectedServices = sessionData.selectedServices || [];
  if (!selectedServices.includes(selectedServiceId)) {
    selectedServices.push(selectedServiceId);
  }

  const updatedData = { ...sessionData, selectedServices };

  // Ask if they want to add more services or continue
  const serviceNames = selectedServices.map((id) => {
    const cat = SERVICE_CATEGORIES.find((c) => c.id === id);
    return cat ? cat.title : id;
  }).join(', ');

  await whatsapp.sendTextMessage(
    phone,
    `✅ Selected: ${serviceNames}\n\nWould you like to add another service?`
  );

  await whatsapp.sendInteractiveButtons(phone, 'Choose an option:', [
    { id: 'btn_add_more', title: '➕ Add More' },
    { id: 'btn_continue', title: '✅ Continue' },
  ]);

  await sessionManager.setSession(phone, STATES.AWAITING_SERVICE_TYPES, updatedData);
};

/**
 * Handle button replies during service selection
 */
const handleServiceTypesButtons = async (phone, buttonId, sessionData) => {
  if (buttonId === 'btn_add_more') {
    await whatsapp.sendInteractiveList(
      phone,
      'Select Services',
      'Choose additional services you provide.',
      'Powered by Handy',
      'Select Services',
      getServiceListSections()
    );
    return;
  }

  if (buttonId === 'btn_continue') {
    if (!sessionData.selectedServices || sessionData.selectedServices.length === 0) {
      await whatsapp.sendTextMessage(phone, `Please select at least one service.`);
      return;
    }

    await whatsapp.sendTextMessage(
      phone,
      `📝 Write a short bio about your experience (max 200 characters):`
    );

    await sessionManager.setSession(phone, STATES.AWAITING_BIO, sessionData);
  }
};

/**
 * Handle bio input
 */
const handleBioInput = async (phone, waName, message, sessionData) => {
  if (message.type !== 'text') {
    await whatsapp.sendTextMessage(phone, `📝 Please type your bio.`);
    return;
  }

  const bio = message.text?.body?.trim();

  if (!bio || bio.length < 10) {
    await whatsapp.sendTextMessage(phone, `📝 Please enter a bio with at least 10 characters.`);
    return;
  }

  if (bio.length > 200) {
    await whatsapp.sendTextMessage(phone, `📝 Bio is too long (max 200 characters). Please shorten it.`);
    return;
  }

  // ── Create or update provider user and profile ──
  let userId;
  const providerId = crypto.randomUUID();

  try {
    // Check if user already exists (customer upgrading to provider)
    if (sessionData.existingUserId && sessionData.isCustomerUpgrade) {
      userId = sessionData.existingUserId;
      // Update existing user to provider role
      await db('users')
        .where('id', userId)
        .update({
          name: sessionData.name,
          role: 'provider',
          whatsapp_name: waName || null,
          updated_at: new Date(),
        });
      console.log(`[ProviderHandler] Customer ${userId} upgraded to provider`);
    } else {
      // Create new user
      userId = crypto.randomUUID();
      await db('users').insert({
        id: userId,
        name: sessionData.name,
        phone: phone,
        role: 'provider',
        whatsapp_name: waName || null,
        rating_average: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    // Create provider profile
    await db('providers').insert({
      id: providerId,
      user_id: userId,
      service_types: JSON.stringify(sessionData.selectedServices),
      is_online: false,
      lat: 0, // Default location — can be updated later
      lng: 0,
      rating_average: 0,
      total_jobs: 0,
      bio: bio,
      portfolio_images: '[]',
      created_at: new Date(),
      updated_at: new Date(),
    });

    console.log(`[ProviderHandler] Provider registered: ${sessionData.name} (${phone}) — Provider ID: ${providerId}`);
  } catch (error) {
    console.error('[ProviderHandler] Error creating provider:', error.message);
    await whatsapp.sendTextMessage(phone, `❌ Something went wrong. Please try again.`);
    return;
  }

  // ── Send confirmation ──
  const serviceNames = sessionData.selectedServices.map((id) => {
    const cat = SERVICE_CATEGORIES.find((c) => c.id === id);
    return cat ? cat.title : id;
  }).join(', ');

  let confirmMsg = `✅ *Provider Profile Created!*\n\n`;
  confirmMsg += `👤 Name: ${sessionData.name}\n`;
  confirmMsg += `🛠 Services: ${serviceNames}\n`;
  confirmMsg += `📝 Bio: ${bio}\n\n`;
  confirmMsg += `You're now visible to customers! Toggle your availability below.`;

  await whatsapp.sendTextMessage(phone, confirmMsg);

  await whatsapp.sendInteractiveButtons(phone, 'What would you like to do?', [
    { id: 'btn_go_online', title: '🟢 Go Online' },
    { id: 'btn_go_offline', title: '🔴 Go Offline' },
    { id: 'btn_settings', title: '⚙️ Settings' },
  ]);

  await sessionManager.setSession(phone, STATES.REGISTERED, {
    userId,
    providerId,
    name: sessionData.name,
  });
};

// ──────────────────────────────────────────────
// Idle State & Commands
// ──────────────────────────────────────────────

/**
 * Show provider dashboard with commands
 */
const showProviderDashboard = async (phone, sessionData) => {
  const provider = await db('providers')
    .join('users', 'providers.user_id', '=', 'users.id')
    .where('providers.id', sessionData.providerId)
    .select('providers.is_online', 'users.name')
    .first();

  const status = provider?.is_online ? '🟢 Online' : '🔴 Offline';

  await whatsapp.sendTextMessage(
    phone,
    `👤 *Provider Dashboard*\n\nStatus: ${status}\n\nAvailable commands:\n\n🟢 "go online" — Make yourself available\n🔴 "go offline" — Go offline\n📋 "my requests" — View your requests\n📊 "my stats" — View your statistics\n⚙️ "settings" — Update your profile\n🛒 "customer mode" — Use as customer\n❓ "help" — Show help`
  );

  await sessionManager.setSession(phone, STATES.IDLE, sessionData);
};

/**
 * Handle idle state (provider is registered and online/offline)
 */
const handleIdleState = async (phone, waName, message, sessionData) => {
  if (message.type === 'interactive') {
    const content = extractInteractiveContent(message);
    if (content?.type === 'button_reply') {
      return await handleProviderButtons(phone, content.id, sessionData);
    }
  }

  const text = extractText(message);

  // Command detection
  if (text === 'go online' || text === 'online') {
    return await toggleAvailability(phone, true, sessionData);
  }
  if (text === 'go offline' || text === 'offline') {
    return await toggleAvailability(phone, false, sessionData);
  }
  if (text === 'my requests' || text === 'requests') {
    return await showMyRequests(phone, sessionData);
  }
  if (text === 'my stats' || text === 'stats') {
    return await showMyStats(phone, sessionData);
  }
  if (text === 'settings') {
    return await showSettings(phone, sessionData);
  }
  if (text === 'customer mode' || text === 'modo cliente' || text === 'soy cliente') {
    // Switch to customer mode
    await sessionManager.clearSession(phone);
    const { handleCustomerMessage } = require('./customerHandler');
    const dummyMessage = { type: 'text', text: { body: 'menu' } };
    return await handleCustomerMessage(phone, waName, dummyMessage);
  }

  // Default response - show menu with options
  return await handleProviderMenu(phone, waName);
};

/**
 * Handle provider button actions
 */
const handleProviderButtons = async (phone, buttonId, sessionData) => {
  switch (buttonId) {
    case 'btn_go_online':
      return await toggleAvailability(phone, true, sessionData);

    case 'btn_go_offline':
      return await toggleAvailability(phone, false, sessionData);

    case 'btn_settings':
      return await showSettings(phone, sessionData);

    case 'btn_add_more':
    case 'btn_continue':
      return await handleServiceTypesButtons(phone, buttonId, sessionData);

    case 'btn_accept_request':
      return await acceptRequest(phone, sessionData);

    case 'btn_decline_request':
      return await declineRequest(phone, sessionData);

    case 'btn_chat_customer':
      return await startChatFromProvider(phone, sessionData);

    case 'btn_provider_dashboard':
      return await showProviderDashboard(phone, sessionData);

    case 'btn_customer_mode':
      // Clear session and route to customer handler
      await sessionManager.clearSession(phone);
      const { handleCustomerMessage } = require('./customerHandler');
      // Create a dummy message to trigger customer welcome
      const dummyMessage = { type: 'text', text: { body: 'menu' } };
      return await handleCustomerMessage(phone, sessionData?.name || '', dummyMessage);

    case 'btn_help':
      return await handleHelp(phone);

    default:
      await whatsapp.sendTextMessage(phone, `🤔 Unknown action. Type "help" for available commands.`);
  }
};

/**
 * Toggle provider availability
 */
const toggleAvailability = async (phone, isOnline, sessionData) => {
  const providerId = sessionData.providerId;
  if (!providerId) {
    await whatsapp.sendTextMessage(phone, `❌ Provider profile not found.`);
    return;
  }

  try {
    await db('providers')
      .where('id', providerId)
      .update({
        is_online: isOnline,
        updated_at: new Date(),
      });

    const status = isOnline ? '🟢 online' : '🔴 offline';
    await whatsapp.sendTextMessage(
      phone,
      `${isOnline ? '🟢' : '🔴'} You're now ${status} and ${isOnline ? 'visible to customers' : 'hidden from customers'}.`
    );

    await sessionManager.setSession(phone, STATES.IDLE, sessionData);
  } catch (error) {
    console.error('[ProviderHandler] Error updating availability:', error.message);
    await whatsapp.sendTextMessage(phone, `❌ Something went wrong. Please try again.`);
  }
};

/**
 * Show provider's active/pending requests
 */
const showMyRequests = async (phone, sessionData) => {
  const providerId = sessionData.providerId;
  if (!providerId) {
    await whatsapp.sendTextMessage(phone, `❌ Provider profile not found.`);
    return;
  }

  try {
    const requests = await db('service_requests')
      .where('provider_id', providerId)
      .orderBy('created_at', 'desc')
      .limit(10);

    if (requests.length === 0) {
      await whatsapp.sendTextMessage(phone, `📭 You don't have any requests yet.\n\nMake sure you're online to receive requests!`);
      return;
    }

    let msg = `📋 *Your Requests:*\n\n`;
    for (const req of requests) {
      const emoji = getStatusEmoji(req.status);
      const customer = await db('users').where('id', req.customer_id).first();
      const customerName = customer ? customer.name : 'Unknown';

      msg += `${emoji} *${req.service_type.toUpperCase()}*\n`;
      msg += `   Customer: ${customerName}\n`;
      msg += `   Status: ${req.status.replace('_', ' ')}\n`;
      if (req.address) msg += `   📍 ${req.address}\n`;
      msg += `   📅 ${new Date(req.created_at).toLocaleDateString()}\n\n`;
    }

    await whatsapp.sendTextMessage(phone, msg);
  } catch (error) {
    console.error('[ProviderHandler] Error fetching requests:', error.message);
    await whatsapp.sendTextMessage(phone, `❌ Something went wrong. Please try again.`);
  }
};

/**
 * Show provider statistics
 */
const showMyStats = async (phone, sessionData) => {
  const providerId = sessionData.providerId;
  if (!providerId) {
    await whatsapp.sendTextMessage(phone, `❌ Provider profile not found.`);
    return;
  }

  try {
    const provider = await db('providers').where('id', providerId).first();
    if (!provider) {
      await whatsapp.sendTextMessage(phone, `❌ Provider profile not found.`);
      return;
    }

    const completedJobs = await db('service_requests')
      .where('provider_id', providerId)
      .where('status', 'completed')
      .count('* as count')
      .first();

    const rating = Number(provider.rating_average).toFixed(1);
    const totalJobs = provider.total_jobs || 0;
    const completedCount = completedJobs?.count || 0;

    let msg = `📊 *Your Statistics:*\n\n`;
    msg += `⭐ Rating: ${rating}/5.0\n`;
    msg += `📋 Total Jobs: ${totalJobs}\n`;
    msg += `✅ Completed: ${completedCount}\n`;
    msg += `${provider.is_online ? '🟢' : '🔴'} Status: ${provider.is_online ? 'Online' : 'Offline'}\n`;

    await whatsapp.sendTextMessage(phone, msg);
  } catch (error) {
    console.error('[ProviderHandler] Error fetching stats:', error.message);
    await whatsapp.sendTextMessage(phone, `❌ Something went wrong. Please try again.`);
  }
};

/**
 * Show settings menu
 */
const showSettings = async (phone, sessionData) => {
  await whatsapp.sendTextMessage(
    phone,
    `⚙️ *Settings*\n\nSettings update coming soon!\n\nFor now, you can:\n• Toggle availability (go online/offline)\n• View your stats (my stats)\n• View requests (my requests)`
  );
};

// ──────────────────────────────────────────────
// Request Handling
// ──────────────────────────────────────────────

/**
 * Notify provider of a new request (called from customerHandler or notification service)
 */
const notifyProviderOfRequest = async (requestId, providerId, customerName, serviceType, address, description) => {
  try {
    const provider = await db('providers')
      .join('users', 'providers.user_id', '=', 'users.id')
      .where('providers.id', providerId)
      .select('users.phone', 'users.name')
      .first();

    if (!provider) {
      console.error(`[ProviderHandler] Provider not found: ${providerId}`);
      return;
    }

    const providerPhone = provider.phone;

    // Create assignment record
    const assignmentId = crypto.randomUUID();
    await db('assignments').insert({
      id: assignmentId,
      request_id: requestId,
      provider_id: providerId,
      status: 'pending',
      created_at: new Date(),
    });

    // Send notification
    let msg = `🔔 *New Service Request!*\n\n`;
    msg += `🛠 Service: ${serviceType}\n`;
    msg += `👤 Customer: ${customerName}\n`;
    msg += `📍 Address: ${address}\n`;
    if (description) {
      msg += `📝 Description: ${description}\n`;
    }
    msg += `\n⏱ Respond within 5 minutes`;

    await whatsapp.sendInteractiveButtons(providerPhone, msg, [
      { id: 'btn_accept_request', title: '✅ Accept' },
      { id: 'btn_decline_request', title: '❌ Decline' },
    ]);

    // Get session and update state
    const session = await sessionManager.getSession(providerPhone);
    const sessionData = session?.data || {};
    sessionData.requestId = requestId;
    sessionData.assignmentId = assignmentId;
    sessionData.customerName = customerName;

    await sessionManager.setSession(providerPhone, STATES.AWAITING_REQUEST_RESPONSE, sessionData);

    // Set timeout (5 minutes = 300000 ms)
    setTimeout(async () => {
      await handleRequestTimeout(requestId, providerId, providerPhone);
    }, 5 * 60 * 1000);

    console.log(`[ProviderHandler] Request notification sent to provider ${providerPhone}`);
  } catch (error) {
    console.error('[ProviderHandler] Error notifying provider:', error.message);
  }
};

/**
 * Handle provider's response to a request (Accept/Decline)
 */
const handleRequestResponse = async (phone, waName, message, sessionData) => {
  if (message.type === 'interactive') {
    const content = extractInteractiveContent(message);
    if (content?.type === 'button_reply') {
      if (content.id === 'btn_accept_request') {
        return await acceptRequest(phone, sessionData);
      }
      if (content.id === 'btn_decline_request') {
        return await declineRequest(phone, sessionData);
      }
    }
  }

  // Text-based accept/decline
  const text = extractText(message);
  if (text === 'accept' || text === 'yes') {
    return await acceptRequest(phone, sessionData);
  }
  if (text === 'decline' || text === 'no') {
    return await declineRequest(phone, sessionData);
  }

  await whatsapp.sendTextMessage(
    phone,
    `🤔 Please tap Accept or Decline on the request notification, or type "accept" or "decline".`
  );
};

/**
 * Accept a service request
 */
const acceptRequest = async (phone, sessionData) => {
  const requestId = sessionData.requestId;
  const assignmentId = sessionData.assignmentId;
  const providerId = sessionData.providerId;

  if (!requestId || !assignmentId) {
    await whatsapp.sendTextMessage(phone, `❌ Request not found.`);
    return;
  }

  try {
    // Update service request
    await db('service_requests')
      .where('id', requestId)
      .update({
        status: 'provider_assigned',
        updated_at: new Date(),
      });

    // Update assignment
    await db('assignments')
      .where('id', assignmentId)
      .update({
        status: 'accepted',
        accepted_at: new Date(),
      });

    // Get request details
    const request = await db('service_requests').where('id', requestId).first();
    const customer = await db('users').where('id', request.customer_id).first();

    // Notify customer
    if (customer) {
      const provider = await db('providers')
        .join('users', 'providers.user_id', '=', 'users.id')
        .where('providers.id', providerId)
        .select('users.name')
        .first();

      const providerName = provider ? provider.name : 'Your provider';

      await whatsapp.sendTextMessage(
        customer.phone,
        `✅ Great news! ${providerName} has accepted your request!\n\nThey'll be in touch shortly. You can now chat directly.`
      );

      await whatsapp.sendInteractiveButtons(customer.phone, 'What would you like to do?', [
        { id: 'btn_start_chat', title: '💬 Start Chat' },
      ]);
    }

    // Notify provider
    await whatsapp.sendTextMessage(
      phone,
      `✅ You accepted the request from ${sessionData.customerName || 'the customer'}.\n\n📍 Address: ${request.address}\n${request.description ? `📝 Description: ${request.description}\n` : ''}`
    );

    await whatsapp.sendInteractiveButtons(phone, 'What would you like to do?', [
      { id: 'btn_chat_customer', title: '💬 Chat with Customer' },
    ]);

    await sessionManager.setSession(phone, STATES.IDLE, sessionData);

    console.log(`[ProviderHandler] Request ${requestId} accepted by provider`);
  } catch (error) {
    console.error('[ProviderHandler] Error accepting request:', error.message);
    await whatsapp.sendTextMessage(phone, `❌ Something went wrong. Please try again.`);
  }
};

/**
 * Decline a service request
 */
const declineRequest = async (phone, sessionData) => {
  const requestId = sessionData.requestId;
  const assignmentId = sessionData.assignmentId;

  if (!requestId || !assignmentId) {
    await whatsapp.sendTextMessage(phone, `❌ Request not found.`);
    return;
  }

  try {
    // Update assignment
    await db('assignments')
      .where('id', assignmentId)
      .update({
        status: 'rejected',
      });

    // Get request details
    const request = await db('service_requests').where('id', requestId).first();
    const customer = await db('users').where('id', request.customer_id).first();

    // Notify customer
    if (customer) {
      await whatsapp.sendTextMessage(
        customer.phone,
        `😕 The provider is currently unavailable.\n\nWould you like to try another provider?`
      );

      await whatsapp.sendInteractiveButtons(customer.phone, 'Choose an option:', [
        { id: 'btn_see_other_providers', title: '🔄 See Other Providers' },
        { id: 'btn_cancel_request', title: '❌ Cancel Request' },
      ]);
    }

    // Notify provider
    await whatsapp.sendTextMessage(phone, `❌ You declined the request from ${sessionData.customerName || 'the customer'}.\n\nYou're still online and will receive new requests.`);

    await sessionManager.setSession(phone, STATES.IDLE, sessionData);

    console.log(`[ProviderHandler] Request ${requestId} declined by provider`);
  } catch (error) {
    console.error('[ProviderHandler] Error declining request:', error.message);
    await whatsapp.sendTextMessage(phone, `❌ Something went wrong. Please try again.`);
  }
};

/**
 * Handle request timeout (5 minutes passed without response)
 */
const handleRequestTimeout = async (requestId, providerId, providerPhone) => {
  try {
    // Check if request was already handled
    const assignment = await db('assignments')
      .where('request_id', requestId)
      .where('provider_id', providerId)
      .first();

    if (!assignment || assignment.status !== 'pending') {
      return; // Already handled
    }

    // Update assignment and request
    await db('assignments')
      .where('id', assignment.id)
      .update({ status: 'cancelled' });

    await db('service_requests')
      .where('id', requestId)
      .update({
        status: 'cancelled',
        updated_at: new Date(),
      });

    // Notify provider
    await whatsapp.sendTextMessage(
      providerPhone,
      `⏱ Request expired. You didn't respond in time.`
    );

    // Notify customer
    const request = await db('service_requests').where('id', requestId).first();
    if (request) {
      const customer = await db('users').where('id', request.customer_id).first();
      if (customer) {
        await whatsapp.sendTextMessage(
          customer.phone,
          `😕 The provider didn't respond in time.\n\nWould you like to try another provider?`
        );

        await whatsapp.sendInteractiveButtons(customer.phone, 'Choose an option:', [
          { id: 'btn_see_other_providers', title: '🔄 See Other Providers' },
          { id: 'btn_cancel_request', title: '❌ Cancel Request' },
        ]);
      }
    }

    console.log(`[ProviderHandler] Request ${requestId} timed out`);
  } catch (error) {
    console.error('[ProviderHandler] Error handling timeout:', error.message);
  }
};

// ──────────────────────────────────────────────
// Milestone 6: Provider Rating Flow
// ──────────────────────────────────────────────

/**
 * Handle the provider's initial rating category selection (rating the customer).
 * Buttons: [⭐ 1-2 Poor] [⭐⭐⭐ 3 OK] [⭐⭐⭐⭐⭐ 4-5 Great]
 */
const handleProviderRatingSelection = async (phone, waName, message, sessionData) => {
  if (message.type === 'interactive') {
    const content = extractInteractiveContent(message);
    if (content?.type === 'button_reply') {
      switch (content.id) {
        case 'prating_poor':
          await whatsapp.sendInteractiveButtons(phone, '⭐ How many stars?', [
            { id: 'pstar_1', title: '⭐ 1 Star' },
            { id: 'pstar_2', title: '⭐⭐ 2 Stars' },
          ]);
          await sessionManager.setSession(phone, STATES.AWAITING_PROVIDER_RATING_FINE, {
            ...sessionData,
            ratingCategory: 'poor',
          });
          return;

        case 'prating_ok':
          await whatsapp.sendTextMessage(
            phone,
            `📝 Would you like to leave a comment about the customer? (Send *"skip"* to skip)`
          );
          await sessionManager.setSession(phone, STATES.AWAITING_PROVIDER_RATING_COMMENT, {
            ...sessionData,
            stars: 3,
          });
          return;

        case 'prating_great':
          await whatsapp.sendInteractiveButtons(phone, '⭐ How many stars?', [
            { id: 'pstar_4', title: '⭐⭐⭐⭐ 4 Stars' },
            { id: 'pstar_5', title: '⭐⭐⭐⭐⭐ 5 Stars' },
          ]);
          await sessionManager.setSession(phone, STATES.AWAITING_PROVIDER_RATING_FINE, {
            ...sessionData,
            ratingCategory: 'great',
          });
          return;

        case 'prating_skip':
          // Skip provider rating entirely
          await whatsapp.sendTextMessage(phone, `✅ Rating skipped. Thank you!`);
          await completeRequestLifecycle(phone, sessionData);
          return;
      }
    }
  }

  // Unrecognized input — resend buttons
  await whatsapp.sendTextMessage(
    phone,
    `🤔 Please tap one of the rating buttons, or type "skip" to skip rating.`
  );
  await whatsapp.sendInteractiveButtons(phone, 'Rate the customer:', [
    { id: 'prating_poor', title: '⭐ 1-2 Poor' },
    { id: 'prating_ok', title: '⭐⭐⭐ 3 OK' },
    { id: 'prating_great', title: '⭐⭐⭐⭐⭐ 4-5 Great' },
  ]);
};

/**
 * Handle fine-grained star selection for provider rating (1 vs 2, or 4 vs 5).
 */
const handleProviderRatingFine = async (phone, waName, message, sessionData) => {
  if (message.type === 'interactive') {
    const content = extractInteractiveContent(message);
    if (content?.type === 'button_reply') {
      const starMap = {
        pstar_1: 1,
        pstar_2: 2,
        pstar_4: 4,
        pstar_5: 5,
      };
      const stars = starMap[content.id];
      if (stars) {
        await whatsapp.sendTextMessage(
          phone,
          `📝 Would you like to leave a comment about the customer? (Send *"skip"* to skip)`
        );
        await sessionManager.setSession(phone, STATES.AWAITING_PROVIDER_RATING_COMMENT, {
          ...sessionData,
          stars,
        });
        return;
      }
    }
  }

  // Resend appropriate buttons
  const isPoor = sessionData.ratingCategory === 'poor';
  if (isPoor) {
    await whatsapp.sendInteractiveButtons(phone, '⭐ How many stars?', [
      { id: 'pstar_1', title: '⭐ 1 Star' },
      { id: 'pstar_2', title: '⭐⭐ 2 Stars' },
    ]);
  } else {
    await whatsapp.sendInteractiveButtons(phone, '⭐ How many stars?', [
      { id: 'pstar_4', title: '⭐⭐⭐⭐ 4 Stars' },
      { id: 'pstar_5', title: '⭐⭐⭐⭐⭐ 5 Stars' },
    ]);
  }
};

/**
 * Handle comment input for provider rating.
 */
const handleProviderRatingComment = async (phone, waName, message, sessionData) => {
  // Handle "skip" text command as alternative
  const text = extractText(message);
  if (text === 'skip') {
    return await saveProviderRating(phone, sessionData, '');
  }

  if (message.type !== 'text') {
    await whatsapp.sendTextMessage(phone, `📝 Please type a comment or send "skip" to skip.`);
    return;
  }

  const comment = message.text?.body?.trim() || '';
  return await saveProviderRating(phone, sessionData, comment);
};

/**
 * Save the provider's rating of the customer and complete the lifecycle.
 */
const saveProviderRating = async (phone, sessionData, comment) => {
  const stars = sessionData.stars;
  const requestId = sessionData.requestId;
  const providerUserId = sessionData.providerUserId;
  const customerId = sessionData.customerId;
  const customerName = sessionData.customerName;

  try {
    // Insert rating (provider → customer)
    await db('ratings').insert({
      id: crypto.randomUUID(),
      request_id: requestId,
      rater_id: providerUserId,
      ratee_id: customerId,
      stars: stars,
      comment: comment,
      created_at: new Date(),
    });

    console.log(`[ProviderHandler] Provider rating saved: ${stars} stars for customer ${customerId}`);

    // Update customer's rating_average
    await updateCustomerRatingAverage(customerId);

    // Send confirmation
    const starString = '⭐'.repeat(stars);
    let confirmMsg = `✅ *Thank you for your review!*\n\n`;
    confirmMsg += `${starString} (${stars}/5) for ${customerName || 'the customer'}\n`;
    if (comment) {
      confirmMsg += `💬 "${comment}"\n`;
    }

    await whatsapp.sendTextMessage(phone, confirmMsg);

    // Complete the request lifecycle
    await completeRequestLifecycle(phone, sessionData);

  } catch (error) {
    console.error('[ProviderHandler] Error saving provider rating:', error.message);
    await whatsapp.sendTextMessage(phone, `❌ Something went wrong saving your review. Please try again.`);
  }
};

/**
 * Recalculate and update the customer's rating_average.
 */
const updateCustomerRatingAverage = async (customerId) => {
  try {
    const result = await db('ratings')
      .where('ratee_id', customerId)
      .avg('stars as avg_rating')
      .first();

    const avgRating = result?.avg_rating ? Number(result.avg_rating).toFixed(2) : 0;

    await db('users')
      .where('id', customerId)
      .update({
        rating_average: avgRating,
        updated_at: new Date(),
      });

    console.log(`[ProviderHandler] Customer ${customerId} rating updated: ${avgRating}`);
  } catch (error) {
    console.error('[ProviderHandler] Error updating customer rating average:', error.message);
  }
};

/**
 * Complete the request lifecycle: clear sessions, return provider to IDLE.
 */
const completeRequestLifecycle = async (phone, sessionData) => {
  try {
    // Ensure request status is 'completed'
    if (sessionData.requestId) {
      await db('service_requests')
        .where('id', sessionData.requestId)
        .update({
          status: 'completed',
          updated_at: new Date(),
        });
    }

    // Return provider to IDLE with their profile info
    await whatsapp.sendInteractiveButtons(phone, 'What would you like to do next?', [
      { id: 'btn_go_online', title: '🟢 Go Online' },
      { id: 'btn_provider_dashboard', title: '👤 Dashboard' },
    ]);

    await sessionManager.setSession(phone, STATES.IDLE, {
      userId: sessionData.providerUserId,
      providerId: sessionData.providerId,
      name: sessionData.providerName,
    });

    console.log(`[ProviderHandler] Request lifecycle completed for provider ${phone}`);
  } catch (error) {
    console.error('[ProviderHandler] Error completing request lifecycle:', error.message);
  }
};

// ──────────────────────────────────────────────
// Global command handlers
// ──────────────────────────────────────────────

/**
 * Show provider menu (when provider sends "menu" or starts conversation)
 */
const handleProviderMenu = async (phone, waName) => {
  const existingUser = await findUserByPhone(phone);
  if (existingUser && existingUser.role === 'provider') {
    const provider = await db('providers')
      .where('user_id', existingUser.id)
      .first();

    if (provider) {
      await whatsapp.sendTextMessage(
        phone,
        `👋 Welcome back, ${existingUser.name}!\n\nYou're registered as a *Provider*.\n\nWhat would you like to do?`
      );

      await whatsapp.sendInteractiveButtons(phone, 'Choose an option:', [
        { id: 'btn_provider_dashboard', title: '👤 Provider Mode' },
        { id: 'btn_customer_mode', title: '🛒 Customer Mode' },
        { id: 'btn_help', title: '❓ Help' },
      ]);

      await sessionManager.setSession(phone, STATES.IDLE, {
        userId: existingUser.id,
        providerId: provider.id,
        name: existingUser.name,
      });
      return;
    }
  }

  await whatsapp.sendTextMessage(
    phone,
    `👋 Hello! To register as a provider, type:\n\n*"register provider"*`
  );
};

/**
 * Show main menu
 */
const handleMenu = async (phone, waName) => {
  return await handleProviderMenu(phone, waName);
};

/**
 * Show help text
 */
const handleHelp = async (phone) => {
  await whatsapp.sendTextMessage(
    phone,
    `❓ *Provider Help*\n\nAvailable commands:\n\n` +
    `📝 *"register provider"* — Start provider registration\n` +
    `🟢 *"go online"* — Make yourself available\n` +
    `🔴 *"go offline"* — Go offline\n` +
    `📋 *"my requests"* — View your requests\n` +
    `📊 *"my stats"* — View your statistics\n` +
    `⚙️ *"settings"* — Update your profile\n` +
    `❓ *"help"* — Show this help message\n\n` +
    `When you receive a request, tap Accept or Decline within 5 minutes.`
  );
};

/**
 * Start chat session from provider side (after accepting request).
 */
const startChatFromProvider = async (phone, sessionData) => {
  const requestId = sessionData.requestId;
  if (!requestId) {
    await whatsapp.sendTextMessage(phone, `❌ No active request found.`);
    return;
  }

  try {
    // Get request details
    const request = await db('service_requests').where('id', requestId).first();
    if (!request || request.status !== 'provider_assigned') {
      await whatsapp.sendTextMessage(
        phone,
        `❌ Chat is not available. The request must be accepted first.`
      );
      return;
    }

    // Get customer details
    const customer = await db('users').where('id', request.customer_id).first();
    if (!customer) {
      await whatsapp.sendTextMessage(phone, `❌ Customer not found.`);
      return;
    }

    const providerName = sessionData.name || 'Provider';
    const customerName = customer.name;

    // Start chat session
    await startChatSession(
      requestId,
      customer.phone,
      phone,
      customerName,
      providerName
    );

    // Update session state
    await sessionManager.setSession(phone, STATES.CHAT_ACTIVE, {
      ...sessionData,
      requestId,
      customerPhone: customer.phone,
      customerName,
    });

    console.log(`[ProviderHandler] Chat started by provider ${phone}`);
  } catch (error) {
    console.error('[ProviderHandler] Error starting chat:', error.message);
    await whatsapp.sendTextMessage(phone, `❌ Something went wrong starting the chat. Please try again.`);
  }
};

/**
 * Handle messages when provider is in active chat.
 */
const handleProviderChatActive = async (phone, waName, message, sessionData) => {
  const text = extractText(message);

  // Get chat session to access requestId
  const chatSession = await getChatSession(phone);
  
  // Handle "end chat" command
  if (text === 'end chat' || text === 'cerrar chat') {
    const requestId = chatSession?.requestId || sessionData.requestId;
    if (requestId) {
      const result = await endChatSession(requestId, phone);
      if (result.success) {
        await sessionManager.setSession(phone, STATES.IDLE, {
          ...sessionData,
          providerId: sessionData.providerId,
          name: sessionData.name,
        });
        return;
      } else {
        await whatsapp.sendTextMessage(phone, `❌ Error ending chat: ${result.error || 'Unknown error'}`);
      }
    } else {
      await whatsapp.sendTextMessage(phone, `❌ No active chat session found.`);
      await sessionManager.setSession(phone, STATES.IDLE, sessionData);
    }
    return;
  }

  // Handle "complete" command
  if (text === 'complete' || text === 'completar') {
    const requestId = chatSession?.requestId || sessionData.requestId;
    if (requestId) {
      const result = await markServiceComplete(requestId, phone);
      if (result.success) {
        await sessionManager.setSession(phone, STATES.IDLE, {
          ...sessionData,
          providerId: sessionData.providerId,
          name: sessionData.name,
        });
        return;
      } else {
        await whatsapp.sendTextMessage(phone, `❌ Error marking complete: ${result.error || 'Unknown error'}`);
      }
    } else {
      await whatsapp.sendTextMessage(phone, `❌ No active request found.`);
    }
    return;
  }

  // Check if chat session still exists
  if (!chatSession) {
    await whatsapp.sendTextMessage(
      phone,
      `💬 Chat session has ended.\n\nType "menu" to return to your dashboard.`
    );
    await sessionManager.setSession(phone, STATES.IDLE, {
      ...sessionData,
      providerId: sessionData.providerId,
      name: sessionData.name,
    });
    return;
  }

  // Messages are relayed by webhookController before reaching here
  // This handler is mainly for commands and edge cases
  // If we reach here, it means the message wasn't relayed (maybe unsupported type or error)
  await whatsapp.sendTextMessage(
    phone,
    `💬 You're in an active chat with ${chatSession.customerName}.\n\nSend messages normally and they'll be forwarded.\n\nType "complete" to mark service as done, or "end chat" to close.`
  );
};

/**
 * Handle unknown/unexpected state
 */
const handleUnknownState = async (phone, waName) => {
  await sessionManager.clearSession(phone);
  return await handleNewProvider(phone, waName);
};

// ──────────────────────────────────────────────
// Helper functions
// ──────────────────────────────────────────────

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
 * Extract service id from a list reply id (e.g. "service_plumbing" → "plumbing")
 */
const extractServiceId = (listReplyId) => {
  if (!listReplyId || !listReplyId.startsWith('service_')) return null;
  return listReplyId.replace('service_', '');
};

/**
 * Find a user by phone number
 */
const findUserByPhone = async (phone) => {
  try {
    const user = await db('users').where({ phone }).first();
    return user || null;
  } catch (error) {
    console.error('[ProviderHandler] Error finding user:', error.message);
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
  handleProviderMessage,
  notifyProviderOfRequest,
  STATES,
};

