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

  // ── If not registered and not starting registration, prompt ──
  if (!isRegisteredProvider && state === STATES.NEW) {
    return await handleNewProvider(phone, waName);
  }

  // ── State machine ──
  switch (state) {
    case STATES.NEW:
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
  // Check if already registered
  const existingUser = await findUserByPhone(phone);
  if (existingUser && existingUser.role === 'provider') {
    await whatsapp.sendTextMessage(
      phone,
      `✅ You're already registered as a provider!\n\nType "menu" to see your options.`
    );
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

  // ── Create provider user and profile ──
  const userId = crypto.randomUUID();
  const providerId = crypto.randomUUID();

  try {
    // Create user
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

  // Default response
  await whatsapp.sendTextMessage(
    phone,
    `👋 Hello! Use these commands:\n\n` +
    `🟢 *"go online"* — Make yourself available\n` +
    `🔴 *"go offline"* — Go offline\n` +
    `📋 *"my requests"* — View your requests\n` +
    `📊 *"my stats"* — View your statistics\n` +
    `⚙️ *"settings"* — Update your profile\n` +
    `❓ *"help"* — Show help`
  );
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
// Global command handlers
// ──────────────────────────────────────────────

/**
 * Show main menu
 */
const handleMenu = async (phone, waName) => {
  const existingUser = await findUserByPhone(phone);
  if (existingUser && existingUser.role === 'provider') {
    const provider = await db('providers')
      .where('user_id', existingUser.id)
      .first();

    if (provider) {
      await whatsapp.sendTextMessage(
        phone,
        `👋 Welcome back, ${existingUser.name}!\n\nUse these commands:\n\n🟢 "go online" — Make yourself available\n🔴 "go offline" — Go offline\n📋 "my requests" — View your requests\n📊 "my stats" — View your statistics\n⚙️ "settings" — Update your profile`
      );

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

  // Handle "end chat" command
  if (text === 'end chat' || text === 'cerrar chat') {
    const requestId = sessionData.requestId;
    if (requestId) {
      await endChatSession(requestId, phone);
      await sessionManager.setSession(phone, STATES.IDLE, sessionData);
    }
    return;
  }

  // Handle "complete" command
  if (text === 'complete' || text === 'completar') {
    const requestId = sessionData.requestId;
    if (requestId) {
      await markServiceComplete(requestId, phone);
      await sessionManager.setSession(phone, STATES.IDLE, sessionData);
    }
    return;
  }

  // Check if chat session still exists
  const chatSession = await getChatSession(phone);
  if (!chatSession) {
    await whatsapp.sendTextMessage(
      phone,
      `💬 Chat session has ended.\n\nType "menu" to return to your dashboard.`
    );
    await sessionManager.setSession(phone, STATES.IDLE, sessionData);
    return;
  }

  // Messages are relayed by webhookController before reaching here
  // This handler is mainly for commands and edge cases
  await whatsapp.sendTextMessage(
    phone,
    `💬 You're in an active chat. Send messages normally and they'll be forwarded to the customer.\n\nType "complete" to mark service as done, or "end chat" to close the conversation.`
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

