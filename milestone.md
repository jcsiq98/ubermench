# Ubermench WhatsApp Edition — Project Milestones

> A WhatsApp-based "light" version of the Ubermench service marketplace, allowing customers to find and book local service providers entirely through WhatsApp, similar to [MiChamba](https://www.michamba.ai/).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Milestone 1 — Project Setup & WhatsApp Business API Foundation](#milestone-1--project-setup--whatsapp-business-api-foundation)
3. [Milestone 2 — Customer Onboarding & Service Selection Flow](#milestone-2--customer-onboarding--service-selection-flow)
4. [Milestone 3 — Provider Listing, Ratings & Selection](#milestone-3--provider-listing-ratings--selection)
5. [Milestone 4 — Provider WhatsApp Interface & Notifications](#milestone-4--provider-whatsapp-interface--notifications)
6. [Milestone 5 — Customer ↔ Provider Chat Relay](#milestone-5--customer--provider-chat-relay)
7. [Milestone 6 — Ratings, Reviews & Post-Service Flow](#milestone-6--ratings-reviews--post-service-flow)
8. [Milestone 7 — Admin Web Dashboard](#milestone-7--admin-web-dashboard)
9. [Milestone 8 — Production Hardening, Testing & Deployment](#milestone-8--production-hardening-testing--deployment)

---

## Architecture Overview

```
┌──────────────┐       HTTPS Webhook        ┌──────────────────────┐
│   WhatsApp   │ ◄─────────────────────────► │   Backend (Node.js)  │
│   Cloud API  │   (Meta Business Platform)  │   Express + Webhook  │
└──────────────┘                             │                      │
       │                                     │  ┌────────────────┐  │
       │  Messages / Interactive Lists       │  │ WhatsApp       │  │
       │  Buttons / Media                    │  │ Service Layer  │  │
       │                                     │  └────────────────┘  │
       │                                     │  ┌────────────────┐  │
       │                                     │  │ Session/State  │  │
       │                                     │  │ Manager (Redis)│  │
       │                                     │  └────────────────┘  │
       │                                     │  ┌────────────────┐  │
       │                                     │  │ Database       │  │
       │                                     │  │ (PostgreSQL)   │  │
       │                                     │  └────────────────┘  │
       │                                     └──────────────────────┘
       │
       ▼
┌──────────────┐
│  Customers & │
│  Providers   │
│  (WhatsApp)  │
└──────────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **WhatsApp Cloud API** | Meta Business Platform | Send/receive messages, interactive lists, buttons |
| **Webhook Server** | Node.js + Express | Receive and process incoming WhatsApp messages |
| **Session Manager** | Redis | Track user conversation state (FSM) |
| **Database** | PostgreSQL (SQLite for dev) | Store users, providers, requests, ratings, messages |
| **Message Sender** | Axios / node-fetch | Send outbound WhatsApp messages via Cloud API |
| **Admin Dashboard** | Simple HTML/JS or React | Monitor operations, manage providers |

### Conversation State Machine (Customer)

```
START → WELCOME → SERVICE_SELECTION → PROVIDER_LIST → PROVIDER_DETAIL → BOOKING_CONFIRM → CHAT_ACTIVE → RATING → END
```

### Conversation State Machine (Provider)

```
START → PROVIDER_WELCOME → PROVIDER_REGISTERED → IDLE → REQUEST_RECEIVED → CHAT_ACTIVE → COMPLETED → IDLE
```

---

## Milestone 1 — Project Setup & WhatsApp Business API Foundation

### Objective
Set up the project infrastructure, integrate with the WhatsApp Cloud API, and establish bidirectional communication between the backend and WhatsApp.

### Tasks

#### 1.1 — Meta Business Platform Setup
- [ ] Create a Meta Developer account (or use existing)
- [ ] Create a Meta App in the [Meta Developer Dashboard](https://developers.facebook.com/)
- [ ] Add the **WhatsApp** product to the app
- [ ] Configure a test phone number (Meta provides a free sandbox number)
- [ ] Generate a permanent access token (System User Token)
- [ ] Note the **Phone Number ID** and **WhatsApp Business Account ID**

#### 1.2 — Backend WhatsApp Module
- [ ] Create `backend/src/services/whatsappService.js` — core service for sending messages via the WhatsApp Cloud API
  - `sendTextMessage(to, text)` — send a plain text message
  - `sendInteractiveList(to, header, body, footer, sections)` — send a list picker
  - `sendInteractiveButtons(to, body, buttons)` — send reply buttons (max 3)
  - `sendImage(to, imageUrl, caption)` — send an image message
  - `markAsRead(messageId)` — mark incoming message as read
- [ ] Create `backend/src/routes/webhook.js` — webhook endpoint
  - `GET /webhook` — verification endpoint (Meta sends a challenge token)
  - `POST /webhook` — receive incoming messages and status updates
- [ ] Create `backend/src/services/sessionManager.js` — Redis-based conversation state management
  - `getSession(phoneNumber)` — retrieve current conversation state
  - `setSession(phoneNumber, state, data)` — update conversation state
  - `clearSession(phoneNumber)` — reset conversation
  - Session TTL: 24 hours
- [ ] Create `backend/src/controllers/webhookController.js` — message routing logic
  - Parse incoming message types: text, interactive reply, button reply
  - Route to appropriate handler based on session state
- [ ] Add environment variables to `.env`:
  ```
  WHATSAPP_API_URL=https://graph.facebook.com/v21.0
  WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
  WHATSAPP_ACCESS_TOKEN=your_access_token
  WHATSAPP_VERIFY_TOKEN=your_custom_verify_token
  WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id
  ```

#### 1.3 — Database Migrations for WhatsApp
- [ ] Create migration `002_whatsapp_sessions.js`:
  - `whatsapp_sessions` table: `id`, `phone_number` (unique), `user_id` (nullable FK), `role` (customer/provider), `current_state`, `state_data` (JSON), `created_at`, `updated_at`
- [ ] Create migration `003_whatsapp_messages_log.js`:
  - `whatsapp_messages_log` table: `id`, `wamid` (WhatsApp message ID), `phone_number`, `direction` (inbound/outbound), `message_type`, `content` (JSON), `status`, `created_at`

#### 1.4 — Expose Webhook via ngrok (Development)
- [ ] Install ngrok or use a similar tunneling tool
- [ ] Configure Meta webhook subscription URL: `https://<ngrok-url>/api/webhook`
- [ ] Subscribe to `messages` webhook field

#### 1.5 — Initial Commit
- [ ] Initialize git repository
- [ ] Create `.gitignore` (ensure `node_modules/`, `.env`, `dev.sqlite3`, `build/`, etc. are ignored)
- [ ] Push initial codebase to GitHub

### Manual Tests — Milestone 1

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 1.1 | Webhook Verification | Call `GET /api/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123` | Returns `test123` with status 200 |
| 1.2 | Webhook Rejects Bad Token | Call `GET /api/webhook?hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=test123` | Returns 403 Forbidden |
| 1.3 | Receive Text Message | Send "Hello" from WhatsApp test number to the bot | Server logs the incoming message with correct phone number and content |
| 1.4 | Send Text Reply | Trigger `sendTextMessage()` to the test phone number | WhatsApp test number receives the text message |
| 1.5 | Send Interactive List | Trigger `sendInteractiveList()` with 3 sample items | WhatsApp test number receives a tappable list |
| 1.6 | Send Buttons | Trigger `sendInteractiveButtons()` with 2 buttons | WhatsApp test number receives reply buttons |
| 1.7 | Session Create/Read | Send a message → check Redis for session entry | Session exists in Redis with correct phone number and initial state |
| 1.8 | Session TTL | Create a session, wait or check TTL | Session has a 24-hour TTL in Redis |
| 1.9 | Message Logging | Send and receive a message | Both inbound and outbound messages appear in `whatsapp_messages_log` table |
| 1.10 | Health Check | Call `GET /health` | Returns `{ status: "OK" }` |

### Definition of Done
- ✅ Backend can receive WhatsApp messages via webhook
- ✅ Backend can send text, interactive list, and button messages
- ✅ Sessions are created and managed in Redis
- ✅ All messages are logged to database
- ✅ Code is committed and pushed to GitHub

---

## Milestone 2 — Customer Onboarding & Service Selection Flow

### Objective
Build the complete customer-facing WhatsApp flow: from first message → welcome → service category selection.

### Tasks

#### 2.1 — Welcome Flow
- [ ] Create `backend/src/handlers/customerHandler.js`
- [ ] When a new (unknown) phone number sends any message:
  - Create a new session with state `WELCOME`
  - Send welcome message:
    ```
    👋 Welcome to Ubermench!
    
    We connect you with trusted local service providers.
    
    What can we help you with today?
    ```
  - Immediately follow with an interactive list of service categories

#### 2.2 — Service Category Selection
- [ ] Send an interactive list message with service categories:
  - 🔧 Plumbing
  - ⚡ Electrical
  - 🧹 Cleaning
  - 🌿 Gardening
  - 🔨 Repair
  - 📦 Other
- [ ] When user selects a category:
  - Update session state to `SERVICE_SELECTED`
  - Store selected service type in session data
  - Transition to provider listing (Milestone 3)

#### 2.3 — Returning User Detection
- [ ] If phone number already exists in `users` table:
  - Skip registration, greet by name
  - Show quick action buttons: "Book a Service", "My Requests", "Help"
- [ ] If phone number has an active request:
  - Show status of current request instead of main menu

#### 2.4 — Customer Registration (Minimal)
- [ ] On first interaction, after service selection, ask for name:
  ```
  Before we find you a provider, what's your name?
  ```
- [ ] Store the name, create user record with `role: 'customer'`
- [ ] Session state: `SERVICE_SELECTED` → `REGISTERED` → continue to provider list

#### 2.5 — Error Handling & Help
- [ ] If user sends an unrecognized message at any point:
  - Send helpful reply: "I didn't understand that. Here are your options:" + current context menu
- [ ] Implement "help" and "menu" keyword detection at any state
- [ ] Implement "cancel" to reset flow

### Manual Tests — Milestone 2

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 2.1 | New User Welcome | Send any message from a new phone number | Receives welcome message + service category list |
| 2.2 | Service Selection | Tap on "Plumbing" from the list | Session updated to `SERVICE_SELECTED` with `service_type: plumbing` |
| 2.3 | All Categories | Test selecting each of the 6 categories | Each selection is correctly stored in session |
| 2.4 | Name Registration | After selecting a service, respond with "Carlos" | User created in DB with name "Carlos" and role "customer" |
| 2.5 | Returning User | Send a message from a previously registered number | Receives "Welcome back, Carlos!" + quick action buttons |
| 2.6 | Active Request | Send a message while a request is in progress | Shows current request status instead of main menu |
| 2.7 | Help Command | Send "help" at any point in the flow | Receives help text + current context options |
| 2.8 | Menu Command | Send "menu" at any point | Returns to main service selection |
| 2.9 | Cancel Command | Send "cancel" during service selection | Session reset, returns to welcome |
| 2.10 | Invalid Input | Send random text during service selection (not a list reply) | Receives "I didn't understand" + re-shows the list |
| 2.11 | Database Record | Complete registration flow | User exists in `users` table with correct phone, name, role |

### Definition of Done
- ✅ New users receive welcome message and service list
- ✅ Returning users are greeted by name
- ✅ Service selection works for all 6 categories
- ✅ Customer registration captures name and phone
- ✅ Error handling works for invalid inputs
- ✅ Help/menu/cancel commands work from any state
- ✅ Code committed and pushed to GitHub

---

## Milestone 3 — Provider Listing, Ratings & Selection

### Objective
After a customer selects a service category, display a list of available providers with ratings and reviews, allow the customer to view details and select a provider.

### Tasks

#### 3.1 — Provider Query Service
- [ ] Create `backend/src/services/providerService.js`:
  - `getProvidersByServiceType(serviceType, limit)` — fetch providers matching service type, ordered by rating
  - `getProviderDetail(providerId)` — fetch full provider profile including bio, total jobs, rating
  - `getProviderReviews(providerId, limit)` — fetch recent reviews for a provider

#### 3.2 — Provider List Message
- [ ] After service selection, query available providers
- [ ] Format as WhatsApp interactive list:
  ```
  🔧 Plumbing Providers Available:
  
  Select a provider to see their profile and reviews.
  ```
  List items (max 10):
  ```
  ⭐ 4.8 — Jane Provider
  150 jobs completed | Plumbing, Cleaning
  
  ⭐ 4.7 — Mike Electrician  
  89 jobs completed | Electrical
  ```
- [ ] Update session state to `PROVIDER_LIST`

#### 3.3 — Provider Detail Card
- [ ] When customer selects a provider from the list:
  - Send a detailed message:
    ```
    👤 Jane Provider
    ⭐ Rating: 4.8/5.0 (150 jobs)
    
    📝 Bio: Professional plumber with 10 years of experience
    
    💬 Recent Reviews:
    ━━━━━━━━━━━━━━━
    ⭐⭐⭐⭐⭐ — "Excellent work, fixed my sink in 30 min!" — Maria G.
    ⭐⭐⭐⭐ — "Good service, arrived on time." — Juan R.
    ⭐⭐⭐⭐⭐ — "Very professional and clean work." — Ana L.
    ```
  - Follow with reply buttons: [ ✅ Book This Provider ] [ 🔙 Back to List ] [ ❌ Cancel ]
- [ ] Update session state to `PROVIDER_DETAIL`

#### 3.4 — Booking Confirmation
- [ ] When customer taps "Book This Provider":
  - Ask for service location/address:
    ```
    📍 Please share your location or type your address where you need the service.
    ```
  - Accept WhatsApp location sharing OR text address
- [ ] Ask for optional description:
  ```
  📝 Briefly describe what you need (or send "skip" to continue):
  ```
- [ ] Create a `service_request` record in the database with status `created`
- [ ] Send confirmation:
  ```
  ✅ Request Created!
  
  Service: Plumbing
  Provider: Jane Provider
  Address: Calle Principal 123
  
  We're notifying the provider now. You'll receive a confirmation shortly!
  ```
- [ ] Update session state to `BOOKING_CONFIRMED`

#### 3.5 — No Providers Available
- [ ] If no providers are available for selected service:
  ```
  😕 No providers available for Plumbing right now.
  
  Would you like to:
  ```
  Buttons: [ 🔄 Try Another Service ] [ 🔔 Notify Me When Available ] [ ❌ Cancel ]

#### 3.6 — Seed Demo Data
- [ ] Update `seeds/001_sample_data.js` or create `seeds/002_whatsapp_demo_providers.js`:
  - At least 5 providers across different service types
  - Each with realistic bios, ratings, and job counts
  - At least 3 reviews per provider with varied star ratings and comments
  - Providers with WhatsApp phone numbers

### Manual Tests — Milestone 3

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 3.1 | Provider List | Select "Plumbing" service | Receives interactive list with plumbing providers, sorted by rating |
| 3.2 | Provider Count | Check provider list | Shows up to 10 providers matching selected service |
| 3.3 | Provider Detail | Tap on a provider from the list | Receives detailed card with name, rating, bio, and 3 recent reviews |
| 3.4 | Review Display | View provider detail | Reviews show star rating, comment text, and reviewer name |
| 3.5 | Book Provider | Tap "Book This Provider" button | Prompted for location/address |
| 3.6 | Share Location | Share WhatsApp location | Location captured, asked for description |
| 3.7 | Text Address | Type an address like "123 Main St" | Address captured, asked for description |
| 3.8 | Skip Description | Send "skip" when asked for description | Booking created without description |
| 3.9 | Add Description | Type "Leaky faucet in kitchen" | Booking created with description |
| 3.10 | Booking Confirmation | Complete booking flow | Receives confirmation message with all details, request exists in DB |
| 3.11 | Back to List | Tap "Back to List" from provider detail | Returns to provider list for same service |
| 3.12 | No Providers | Select a service with no available providers | Receives "no providers" message with alternative options |
| 3.13 | Cancel from Detail | Tap "Cancel" from provider detail | Returns to main menu, session reset |
| 3.14 | Database Record | Complete a booking | `service_requests` table has new record with correct customer_id, service_type, provider_id, address |

### Definition of Done
- ✅ Providers are listed with ratings after service selection
- ✅ Provider detail shows bio, rating, job count, and reviews
- ✅ Customer can book a provider (with location + optional description)
- ✅ Service request is created in the database
- ✅ "No providers" scenario is handled gracefully
- ✅ Navigation (back/cancel) works correctly
- ✅ Demo seed data is populated
- ✅ Code committed and pushed to GitHub

---

## Milestone 4 — Provider WhatsApp Interface & Notifications

### Objective
Build the provider-facing WhatsApp interface: registration, receiving customer requests, accept/reject flow, and availability management.

### Tasks

#### 4.1 — Provider Registration via WhatsApp
- [ ] Create `backend/src/handlers/providerHandler.js`
- [ ] Provider onboarding flow (triggered by a special keyword like "register provider" or a unique link):
  1. Ask for name
  2. Ask for service types (multi-select or sequential):
     ```
     What services do you offer? Select all that apply:
     ```
     Interactive list: Plumbing, Electrical, Cleaning, Gardening, Repair, Other
  3. Ask for a short bio:
     ```
     Write a short bio about your experience (max 200 chars):
     ```
  4. Confirm registration:
     ```
     ✅ Provider Profile Created!
     
     Name: Jane Provider
     Services: Plumbing, Cleaning
     Bio: Professional plumber with 10 years...
     
     You're now visible to customers! Toggle your availability below.
     ```
     Buttons: [ 🟢 Go Online ] [ 🔴 Go Offline ] [ ⚙️ Settings ]

#### 4.2 — Incoming Request Notifications
- [ ] When a customer books a provider (from Milestone 3):
  - Send WhatsApp notification to the provider:
    ```
    🔔 New Service Request!
    
    Service: Plumbing
    Customer: Carlos
    Address: Calle Principal 123
    Description: Leaky faucet in kitchen
    
    ⏱ Respond within 5 minutes
    ```
    Buttons: [ ✅ Accept ] [ ❌ Decline ]
- [ ] Set a 5-minute timeout:
  - If provider doesn't respond, update request status to `cancelled` and notify customer
  - Send provider a message: "⏱ Request expired. You didn't respond in time."

#### 4.3 — Accept / Decline Flow
- [ ] **Accept**:
  - Update `service_requests.status` → `provider_assigned`
  - Update `assignments` table
  - Notify customer:
    ```
    ✅ Great news! Jane Provider has accepted your request!
    
    They'll be in touch shortly. You can now chat directly.
    ```
    Button: [ 💬 Start Chat ]
  - Notify provider:
    ```
    ✅ You accepted the request from Carlos.
    
    📍 Address: Calle Principal 123
    📝 Description: Leaky faucet in kitchen
    ```
    Button: [ 💬 Chat with Customer ]

- [ ] **Decline**:
  - Update assignment status to `rejected`
  - Notify customer:
    ```
    😕 The provider is currently unavailable. 
    Would you like to try another provider?
    ```
    Buttons: [ 🔄 See Other Providers ] [ ❌ Cancel Request ]

#### 4.4 — Provider Availability Toggle
- [ ] Provider can toggle online/offline status:
  - "go online" / "go offline" commands
  - Or via reply buttons
  - Update `providers.is_online` in database
  - Confirmation: "🟢 You're now online and visible to customers" / "🔴 You're now offline"

#### 4.5 — Provider Dashboard Commands
- [ ] "my requests" — show list of active/pending requests
- [ ] "my stats" — show rating, total jobs, earnings summary
- [ ] "settings" — update bio, service types
- [ ] "help" — show available commands

### Manual Tests — Milestone 4

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 4.1 | Provider Registration | Send "register provider" from a new number | Onboarding flow starts: asks for name |
| 4.2 | Service Type Selection | Select multiple service types during registration | All selected types stored in provider profile |
| 4.3 | Bio Entry | Enter a bio during registration | Bio stored in provider profile |
| 4.4 | Registration Complete | Complete all onboarding steps | Provider record created in DB, confirmation message received |
| 4.5 | Request Notification | Customer books this provider | Provider receives request notification with details and Accept/Decline buttons |
| 4.6 | Accept Request | Tap "Accept" on request notification | Request status updated to `provider_assigned`, customer notified, chat button appears |
| 4.7 | Decline Request | Tap "Decline" on request notification | Assignment rejected, customer offered alternatives |
| 4.8 | Request Timeout | Don't respond to request for 5 minutes | Request cancelled, both parties notified |
| 4.9 | Go Online | Send "go online" or tap Online button | Provider status set to online, confirmation received |
| 4.10 | Go Offline | Send "go offline" or tap Offline button | Provider status set to offline, confirmation received |
| 4.11 | My Requests | Send "my requests" | List of active and recent requests shown |
| 4.12 | My Stats | Send "my stats" | Rating, total jobs, and summary displayed |
| 4.13 | Help Command | Send "help" as a provider | Provider-specific help text and available commands shown |
| 4.14 | Database Integrity | Complete accept flow | `service_requests`, `assignments` tables correctly updated |

### Definition of Done
- ✅ Providers can register via WhatsApp
- ✅ Providers receive notifications for new requests
- ✅ Accept/decline flow works with proper notifications to both parties
- ✅ 5-minute timeout is enforced
- ✅ Availability toggle works
- ✅ Provider dashboard commands work
- ✅ Code committed and pushed to GitHub

---

## Milestone 5 — Customer ↔ Provider Chat Relay

### Objective
Enable direct messaging between customers and providers through WhatsApp, with the bot acting as a relay/bridge.

### Tasks

#### 5.1 — Chat Relay Architecture
- [ ] Design the relay approach:
  - Both customer and provider message the bot's WhatsApp number
  - The bot relays messages between them based on active request context
  - Messages are prefixed with sender identity:
    - Customer sees: `👤 Jane Provider: I'll be there in 20 minutes`
    - Provider sees: `👤 Carlos: Please come to the back entrance`

#### 5.2 — Chat Session Management
- [ ] Create `backend/src/services/chatService.js`:
  - `startChatSession(requestId, customerPhone, providerPhone)` — link two phone numbers for a request
  - `relayMessage(senderPhone, content, messageType)` — forward message to the other party
  - `endChatSession(requestId)` — close the chat relay
- [ ] Store active chat sessions in Redis for fast lookup:
  - Key: `chat:customer:{phone}` → `{ requestId, providerPhone, providerName }`
  - Key: `chat:provider:{phone}` → `{ requestId, customerPhone, customerName }`

#### 5.3 — Message Types Support
- [ ] Relay text messages
- [ ] Relay image messages (customer sends photo of issue, etc.)
- [ ] Relay location messages (provider shares location for arrival)
- [ ] Relay voice messages (forward the media URL)

#### 5.4 — Chat Controls
- [ ] Either party can send "end chat" to close the session
- [ ] Provider can mark service as "completed":
  ```
  ✅ Service marked as completed!
  
  The customer will be asked to rate your service.
  ```
- [ ] Customer receives:
  ```
  ✅ The service has been completed!
  
  How was your experience with Jane Provider?
  ```
  → Transitions to rating flow (Milestone 6)

#### 5.5 — Chat Message Persistence
- [ ] Store all relayed messages in `messages` table
- [ ] Include: request_id, sender_id, content, type, timestamp

#### 5.6 — Edge Cases
- [ ] Handle case where one party messages but no active chat exists
- [ ] Handle case where provider has multiple active chats (queue or reject)
- [ ] Auto-close stale chat sessions after 24 hours of inactivity

### Manual Tests — Milestone 5

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 5.1 | Start Chat | Customer taps "Start Chat" after provider accepts | Both parties receive "Chat started" message |
| 5.2 | Customer → Provider Text | Customer sends "Hi, when can you come?" | Provider receives: "👤 Carlos: Hi, when can you come?" |
| 5.3 | Provider → Customer Text | Provider sends "I'll be there in 20 min" | Customer receives: "👤 Jane Provider: I'll be there in 20 min" |
| 5.4 | Image Relay | Customer sends a photo | Provider receives the same photo with customer attribution |
| 5.5 | Location Relay | Provider shares WhatsApp location | Customer receives the location message |
| 5.6 | End Chat (Customer) | Customer sends "end chat" | Both parties notified, chat session closed |
| 5.7 | End Chat (Provider) | Provider sends "end chat" | Both parties notified, chat session closed |
| 5.8 | Mark Complete | Provider sends "complete" or taps Complete button | Service marked complete, customer prompted for rating |
| 5.9 | Message Persistence | Exchange several messages | All messages stored in `messages` table with correct request_id |
| 5.10 | No Active Chat | Send a message with no active chat session | Receives appropriate error/redirect to main menu |
| 5.11 | Stale Session | Leave chat idle for 24+ hours | Session auto-closed, both parties notified |
| 5.12 | Multiple Messages | Send 10 rapid messages in sequence | All messages relayed in order without loss |

### Definition of Done
- ✅ Messages relay bidirectionally between customer and provider
- ✅ Text, image, location, and voice messages are supported
- ✅ Chat sessions can be started and ended by either party
- ✅ Provider can mark service as completed
- ✅ All messages persisted in database
- ✅ Edge cases handled (no session, stale sessions, rapid messages)
- ✅ Code committed and pushed to GitHub

---

## Milestone 6 — Ratings, Reviews & Post-Service Flow

### Objective
After a service is completed, implement the rating and review flow for both customer and provider.

### Tasks

#### 6.1 — Customer Rating Flow
- [ ] After provider marks service as complete, send customer:
  ```
  ⭐ How would you rate Jane Provider?
  
  Tap a rating:
  ```
  Buttons: [ ⭐ 1-2 Poor ] [ ⭐⭐⭐ 3 OK ] [ ⭐⭐⭐⭐⭐ 4-5 Great ]
- [ ] After star selection, if 4-5: send interactive buttons for fine-grained selection (4 or 5)
- [ ] After star selection, ask for comment:
  ```
  📝 Would you like to leave a comment? (Send "skip" to skip)
  ```
- [ ] Save rating to `ratings` table
- [ ] Update provider's `rating_average`:
  ```sql
  UPDATE providers SET rating_average = (
    SELECT AVG(stars) FROM ratings WHERE ratee_id = provider_user_id
  )
  ```
- [ ] Send confirmation:
  ```
  ✅ Thank you for your review!
  
  Your feedback helps other customers find great providers.
  ```
  Button: [ 🏠 Back to Menu ]

#### 6.2 — Provider Rating Flow (Optional)
- [ ] After customer rates, send provider rating prompt:
  ```
  ⭐ How was working with Carlos?
  ```
  Same button flow as customer
- [ ] Save rating (provider → customer)

#### 6.3 — Review Display Integration
- [ ] Ensure new reviews appear in provider detail cards (Milestone 3.3)
- [ ] Reviews sorted by most recent
- [ ] Show reviewer's first name only (privacy)

#### 6.4 — Request Lifecycle Completion
- [ ] After rating, update `service_requests.status` → `completed`
- [ ] Clear chat sessions from Redis
- [ ] Clear booking session data
- [ ] Return both parties to main menu / idle state

### Manual Tests — Milestone 6

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 6.1 | Rating Prompt | Provider marks service complete | Customer receives rating prompt with star buttons |
| 6.2 | Rate 5 Stars | Select "4-5 Great" then "5" | Rating of 5 stored in session, asked for comment |
| 6.3 | Rate 3 Stars | Select "3 OK" | Rating of 3 stored, asked for comment |
| 6.4 | Rate 1-2 Stars | Select "1-2 Poor" then select 1 or 2 | Rating stored, asked for comment |
| 6.5 | Add Comment | Type "Great service, very professional!" | Comment stored with rating |
| 6.6 | Skip Comment | Send "skip" | Rating saved without comment |
| 6.7 | Rating Saved | Complete rating flow | Record in `ratings` table with correct stars, comment, rater_id, ratee_id, request_id |
| 6.8 | Average Updated | After new rating | Provider's `rating_average` recalculated correctly |
| 6.9 | Review Visible | After rating, check provider detail (new customer) | New review appears in provider's detail card |
| 6.10 | Provider Rates Customer | Provider completes their rating flow | Rating saved for customer |
| 6.11 | Request Complete | After all ratings done | `service_requests.status` = `completed` |
| 6.12 | Session Cleared | After flow completion | Redis sessions cleared, user returns to main menu |
| 6.13 | Back to Menu | Tap "Back to Menu" after rating | Returns to welcome / service selection |

### Definition of Done
- ✅ Customer can rate provider (1-5 stars + optional comment)
- ✅ Provider can rate customer
- ✅ Ratings are persisted and averages recalculated
- ✅ New reviews appear in provider listings
- ✅ Request lifecycle fully completed
- ✅ Sessions cleaned up after completion
- ✅ Code committed and pushed to GitHub

---

## Milestone 7 — Admin Web Dashboard

### Objective
Build a simple web-based admin dashboard to monitor and manage the platform operations.

### Tasks

#### 7.1 — Dashboard Backend API
- [ ] Create `backend/src/routes/admin.js` with protected endpoints:
  - `GET /api/admin/dashboard` — summary stats (total users, providers, active requests, revenue)
  - `GET /api/admin/users` — paginated user list with filters (role, status)
  - `GET /api/admin/providers` — provider list with ratings and online status
  - `GET /api/admin/requests` — service request list with status filters
  - `GET /api/admin/ratings` — recent ratings/reviews
  - `GET /api/admin/messages` — WhatsApp message log
  - `PUT /api/admin/providers/:id/status` — enable/disable a provider
  - `GET /api/admin/analytics` — daily/weekly request volume, revenue trends

#### 7.2 — Admin Authentication
- [ ] Admin login endpoint (`POST /api/admin/login`)
- [ ] Admin JWT middleware (separate from user auth)
- [ ] Create default admin user in seed data

#### 7.3 — Dashboard Frontend
- [ ] Create `backend/public/admin/` directory
- [ ] Build a simple single-page admin dashboard (HTML + JS + Tailwind CSS via CDN):
  - **Overview page**: Cards showing total users, providers, active requests, completed today
  - **Users page**: Searchable/filterable table of all users
  - **Providers page**: Table with name, services, rating, online status, toggle
  - **Requests page**: Table with status badges, filters by status/service type
  - **Messages page**: WhatsApp message log with search
  - **Reviews page**: Recent reviews with star display
- [ ] Serve static files from Express: `app.use('/admin', express.static('public/admin'))`

#### 7.4 — Real-time Updates (Optional)
- [ ] Use Socket.io to push live updates to the dashboard
- [ ] New request notifications
- [ ] Provider status changes

### Manual Tests — Milestone 7

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 7.1 | Admin Login | Navigate to `/admin`, enter credentials | Successfully logged in, dashboard loads |
| 7.2 | Dashboard Stats | View main dashboard | Shows correct counts for users, providers, requests |
| 7.3 | User List | Navigate to users page | All users displayed with correct roles |
| 7.4 | Provider List | Navigate to providers page | All providers shown with ratings, services, status |
| 7.5 | Filter Providers | Filter by service type | Only matching providers shown |
| 7.6 | Request List | Navigate to requests page | All requests shown with correct statuses |
| 7.7 | Filter Requests | Filter by status "completed" | Only completed requests shown |
| 7.8 | Message Log | Navigate to messages page | WhatsApp messages displayed in chronological order |
| 7.9 | Review List | Navigate to reviews page | Reviews shown with stars, comments, names |
| 7.10 | Toggle Provider | Disable a provider from dashboard | Provider marked inactive, no longer shown to customers |
| 7.11 | Unauthorized Access | Access `/api/admin/dashboard` without token | Returns 401 Unauthorized |
| 7.12 | Responsive Design | View dashboard on mobile browser | Layout is usable on small screens |

### Definition of Done
- ✅ Admin can log in securely
- ✅ Dashboard shows real-time platform statistics
- ✅ CRUD operations on users, providers, requests work
- ✅ Message log is searchable
- ✅ Provider enable/disable works
- ✅ UI is clean and functional
- ✅ Code committed and pushed to GitHub

---

## Milestone 8 — Production Hardening, Testing & Deployment

### Objective
Make the application production-ready: comprehensive error handling, security hardening, performance optimization, documentation, and deployment configuration.

### Tasks

#### 8.1 — Error Handling & Resilience
- [ ] Global error handler for unhandled webhook errors (don't crash the server)
- [ ] Retry logic for WhatsApp API calls (exponential backoff)
- [ ] Graceful handling of WhatsApp API rate limits (80 messages/second for business accounts)
- [ ] Dead letter queue for failed messages
- [ ] Circuit breaker for external API calls
- [ ] Structured logging with `winston` or `pino` (JSON format, log levels)

#### 8.2 — Security Hardening
- [ ] Validate WhatsApp webhook signature (X-Hub-Signature-256 header)
- [ ] Sanitize all user inputs before storing in database
- [ ] Rate limit webhook endpoint appropriately
- [ ] Ensure no sensitive data (tokens, passwords) is logged
- [ ] Review and tighten CORS configuration
- [ ] Add request ID tracking for debugging

#### 8.3 — Database Optimization
- [ ] Add database indexes for WhatsApp phone number lookups
- [ ] Add connection pool monitoring
- [ ] Implement database health check
- [ ] Add migration for production indexes:
  ```sql
  CREATE INDEX idx_users_phone ON users(phone);
  CREATE INDEX idx_whatsapp_sessions_phone ON whatsapp_sessions(phone_number);
  CREATE INDEX idx_ratings_ratee ON ratings(ratee_id);
  ```

#### 8.4 — Automated Tests
- [ ] Unit tests for:
  - `whatsappService.js` — message formatting
  - `sessionManager.js` — state transitions
  - `providerService.js` — provider querying and sorting
  - `chatService.js` — relay logic
- [ ] Integration tests for:
  - Webhook endpoint (mock WhatsApp payloads)
  - Customer flow end-to-end
  - Provider flow end-to-end
  - Chat relay flow
- [ ] Load testing:
  - Simulate 100 concurrent conversations
  - Measure response latency under load
- [ ] Add test scripts to `package.json`

#### 8.5 — Deployment Configuration
- [ ] Update `Dockerfile` for production:
  ```dockerfile
  FROM node:18-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --only=production
  COPY . .
  EXPOSE 5000
  CMD ["node", "src/server.js"]
  ```
- [ ] Update `docker-compose.yml` with WhatsApp service and production settings
- [ ] Create `docker-compose.prod.yml` for production overrides
- [ ] Add health check endpoints for all services
- [ ] Create deployment scripts:
  - `scripts/deploy.sh` — build, push, deploy
  - `scripts/migrate-prod.sh` — run production migrations
- [ ] Configure environment variable management (use `.env.example` as template)

#### 8.6 — Monitoring & Alerting
- [ ] Add `/health` endpoint with detailed checks (DB, Redis, WhatsApp API connectivity)
- [ ] Add `/metrics` endpoint for basic metrics:
  - Total messages sent/received
  - Active sessions count
  - Average response time
  - Error rate
- [ ] Document monitoring setup recommendations (Grafana, Datadog, etc.)

#### 8.7 — Documentation
- [ ] Update `README.md` with WhatsApp setup instructions
- [ ] Create `DEPLOYMENT.md` with step-by-step deployment guide
- [ ] Create `API.md` documenting all REST and webhook endpoints
- [ ] Add inline code comments for complex business logic
- [ ] Document environment variables with descriptions

#### 8.8 — Final Integration Test (End-to-End)
- [ ] Execute a complete user journey:
  1. New customer sends first message → welcome
  2. Customer selects Plumbing → sees providers
  3. Customer selects provider → sees detail + reviews
  4. Customer books provider with address + description
  5. Provider receives notification → accepts
  6. Customer and provider exchange messages
  7. Provider marks complete
  8. Customer rates 5 stars + comment
  9. Admin sees everything on dashboard
  10. Verify all database records are correct

### Manual Tests — Milestone 8

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 8.1 | Full E2E Customer Journey | Complete steps 1-8 from 8.8 | Entire flow works without errors |
| 8.2 | Full E2E Provider Journey | Register provider, go online, accept request, chat, complete | Entire flow works without errors |
| 8.3 | Webhook Signature Validation | Send webhook with invalid signature | Returns 401, message not processed |
| 8.4 | API Rate Limiting | Send 150 requests in 15 minutes | After 100, receive 429 Too Many Requests |
| 8.5 | Error Recovery | Kill Redis, send a message, restart Redis | Server doesn't crash, recovers gracefully |
| 8.6 | Database Recovery | Temporarily disconnect DB, reconnect | Server reconnects, queued operations complete |
| 8.7 | Health Check | Call `/health` | Returns status of DB, Redis, WhatsApp API |
| 8.8 | Docker Build | Run `docker-compose up --build` | All services start without errors |
| 8.9 | Production Config | Run with `NODE_ENV=production` | Correct security settings applied, no dev shortcuts |
| 8.10 | Unit Tests Pass | Run `npm test` | All unit tests pass |
| 8.11 | Integration Tests Pass | Run `npm run test:integration` | All integration tests pass |
| 8.12 | No Console Errors | Monitor server logs during E2E test | No unhandled errors or warnings |
| 8.13 | Admin Dashboard Access | Access admin dashboard during active operations | Real-time data visible and correct |
| 8.14 | Concurrent Users | Simulate 5 simultaneous customer conversations | All conversations handled correctly without cross-talk |
| 8.15 | Message Log Completeness | Check `whatsapp_messages_log` after E2E test | Every sent and received message is logged |

### Definition of Done
- ✅ All unit and integration tests pass
- ✅ Full end-to-end flow works without errors
- ✅ Security hardening complete (signature validation, input sanitization, rate limiting)
- ✅ Docker production build works
- ✅ Health/metrics endpoints operational
- ✅ Documentation is complete and accurate
- ✅ No known bugs or unhandled edge cases
- ✅ **Application is fully functional and ready for deployment**
- ✅ All code committed and pushed to GitHub with clean history

---

## Summary Timeline

| Milestone | Description | Key Deliverable |
|-----------|-------------|-----------------|
| **M1** | Project Setup & WhatsApp API | Bidirectional WhatsApp communication |
| **M2** | Customer Onboarding | Welcome flow + service selection |
| **M3** | Provider Listing & Booking | Provider cards + reviews + booking |
| **M4** | Provider Interface | Registration + accept/decline + availability |
| **M5** | Chat Relay | Customer ↔ Provider messaging |
| **M6** | Ratings & Reviews | Post-service rating flow |
| **M7** | Admin Dashboard | Web-based monitoring |
| **M8** | Production & Deploy | Hardened, tested, ready to ship |

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| WhatsApp API | Meta Cloud API v21.0 |
| Backend Runtime | Node.js 18+ |
| Web Framework | Express.js |
| Database | PostgreSQL (SQLite for dev) |
| Cache / Sessions | Redis |
| ORM / Query Builder | Knex.js |
| Authentication | JWT + bcrypt |
| Admin UI | HTML + Tailwind CSS + Vanilla JS |
| Containerization | Docker + Docker Compose |
| Testing | Jest + Supertest |
| Logging | Winston/Pino |

---

*Last updated: February 2026*

