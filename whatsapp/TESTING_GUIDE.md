# 🧪 Guía de Testing — WhatsApp Ubermench

Guía práctica paso a paso para probar el sistema completo desde WhatsApp.

---

## 📱 **Configuración Inicial**

### Tu Número
- **Tu número**: `526565884840` (Jose)
- **Estado actual**: Registrado como Customer

### Números de Prueba Disponibles
- **Providers**: `+5215512345001` (Jane), `+5215512345002` (Mike), etc.
- **Customers**: `+5215599900001` (Maria), `+5215599900002` (Juan), etc.

---

## 🎯 **Escenario 1: Probar como CUSTOMER (Cliente)**

### Paso 1: Iniciar como Cliente
1. **Envía desde tu WhatsApp** (`526565884840`):
   ```
   hola
   ```
   o simplemente cualquier mensaje

2. **Deberías recibir**:
   ```
   👋 Welcome to *Handy*!
   
   We connect you with trusted local service providers.
   
   What can we help you with today?
   ```
   + Lista interactiva de servicios

### Paso 2: Seleccionar un Servicio
1. **Toca** en la lista: `🔧 Plumbing` (o cualquier servicio)

2. **Deberías recibir**:
   ```
   ✅ Great choice! You selected: 🔧 Plumbing
   
   🔍 Searching for available providers...
   ```
   + Lista de proveedores disponibles

### Paso 3: Ver Detalle de un Proveedor
1. **Toca** un proveedor de la lista (ej: "⭐4.8 — Jane Provider")

2. **Deberías recibir**:
   - Tarjeta con nombre, rating, bio, reviews
   - Botones: `✅ Book Provider` | `🔙 Back to List` | `❌ Cancel`

### Paso 4: Reservar un Servicio
1. **Toca** `✅ Book Provider`

2. **Te pedirá ubicación**:
   ```
   📍 Please share your location or type your address where you need the service.
   ```

3. **Envía tu ubicación** (comparte desde WhatsApp) o escribe:
   ```
   Calle Principal 123, Ciudad
   ```

4. **Te pedirá descripción**:
   ```
   📝 Briefly describe what you need (or send *"skip"* to continue):
   ```

5. **Escribe**:
   ```
   Fuga en la cocina
   ```
   o `skip` para omitir

6. **Deberías recibir confirmación**:
   ```
   ✅ Request Created!
   
   🛠 Service: 🔧 Plumbing
   👤 Provider: Jane Provider
   📍 Address: Calle Principal 123
   📝 Description: Fuga en la cocina
   
   We're notifying the provider now. You'll receive a confirmation shortly!
   ```

---

## 🎯 **Escenario 2: Probar como PROVIDER (Proveedor)**

### Paso 1: Registrarse como Proveedor
1. **Envía desde tu WhatsApp**:
   ```
   register provider
   ```

2. **Deberías recibir**:
   ```
   👋 Hello Jose! You're currently registered as a customer.
   
   Let's register you as a provider. What's your name? (You can use a different name or the same: Jose)
   ```

3. **Escribe tu nombre**:
   ```
   Jose Provider
   ```

4. **Te mostrará lista de servicios**:
   ```
   ✅ Great, Jose Provider!
   
   What services do you offer? Select all that apply:
   ```
   + Lista interactiva de servicios

### Paso 2: Seleccionar Múltiples Servicios
1. **Toca** un servicio (ej: `🔧 Plumbing`)

2. **Deberías recibir**:
   ```
   ✅ Selected: 🔧 Plumbing
   
   Would you like to add another service?
   ```
   + Botones: `➕ Add More` | `✅ Continue`

3. **Toca** `➕ Add More`

4. **Selecciona otro servicio** (ej: `🧹 Cleaning`)

5. **Repite** hasta tener todos los servicios que quieras

6. **Cuando termines, toca** `✅ Continue`

### Paso 3: Escribir Bio
1. **Te pedirá bio**:
   ```
   📝 Write a short bio about your experience (max 200 characters):
   ```

2. **Escribe**:
   ```
   Plomero profesional con 10 años de experiencia. Especializado en reparaciones residenciales y comerciales.
   ```

3. **Deberías recibir confirmación**:
   ```
   ✅ Provider Profile Created!
   
   👤 Name: Jose Provider
   🛠 Services: 🔧 Plumbing, 🧹 Cleaning
   📝 Bio: Plomero profesional...
   
   You're now visible to customers! Toggle your availability below.
   ```
   + Botones: `🟢 Go Online` | `🔴 Go Offline` | `⚙️ Settings`

### Paso 4: Ponerse Online
1. **Escribe**:
   ```
   go online
   ```
   o toca `🟢 Go Online`

2. **Deberías recibir**:
   ```
   🟢 You're now online and visible to customers.
   ```

---

## 💬 **Escenario 3: Probar el CHAT entre Customer y Provider**

### Requisitos Previos
- Tienes que estar registrado como **Provider** y **Online**
- Necesitas que alguien (o tú desde otro número) haga un booking contigo

### Opción A: Usar 2 Números (Recomendado)

#### Desde Número 1 (Customer):
1. Sigue el **Escenario 1** hasta completar el booking
2. Cuando el provider acepte, recibirás:
   ```
   ✅ Great news! Jose Provider has accepted your request!
   
   They'll be in touch shortly. You can now chat directly.
   ```
   + Botón: `💬 Start Chat`

3. **Toca** `💬 Start Chat`

4. **Deberías recibir**:
   ```
   💬 Chat Started
   
   You're now connected with Jose Provider. You can send messages directly!
   ```

#### Desde Número 2 (Provider - Tu número):
1. **Recibirás notificación**:
   ```
   🔔 New Service Request!
   
   🛠 Service: plumbing
   👤 Customer: [Nombre]
   📍 Address: [Dirección]
   📝 Description: [Descripción]
   
   ⏱ Respond within 5 minutes
   ```
   + Botones: `✅ Accept` | `❌ Decline`

2. **Toca** `✅ Accept`

3. **Recibirás**:
   ```
   ✅ You accepted the request from [Customer].
   
   📍 Address: [Dirección]
   📝 Description: [Descripción]
   ```
   + Botón: `💬 Chat with Customer`

4. **Toca** `💬 Chat with Customer`

5. **Deberías recibir**:
   ```
   💬 Chat Started
   
   You're now connected with [Customer]. You can send messages directly!
   ```

### Paso 5: Probar el Chat
#### Desde Customer (Número 1):
1. **Envía un mensaje**:
   ```
   Hola, ¿cuándo puedes venir?
   ```

2. **El Provider debería recibir**:
   ```
   👤 [Nombre Customer]: Hola, ¿cuándo puedes venir?
   ```

#### Desde Provider (Número 2 - Tu número):
1. **Responde**:
   ```
   Puedo ir mañana a las 2pm
   ```

2. **El Customer debería recibir**:
   ```
   👤 Jose Provider: Puedo ir mañana a las 2pm
   ```

### Paso 6: Probar "End Chat"
#### Desde Provider:
1. **Escribe**:
   ```
   end chat
   ```

2. **Ambos deberían recibir**:
   ```
   💬 Chat ended by Jose Provider.
   
   Type "menu" to return to your dashboard.
   ```

### Paso 7: Probar "Complete"
1. **Inicia el chat de nuevo** (sigue pasos anteriores)

2. **Desde Provider, escribe**:
   ```
   complete
   ```

3. **Provider recibe**:
   ```
   ✅ Service marked as completed!
   
   The customer will be asked to rate your service.
   ```

4. **Customer recibe**:
   ```
   ✅ The service has been completed!
   
   How was your experience with Jose Provider?
   ```
   (Esto lleva al flujo de rating - Milestone 6)

---

## 🔧 **Comandos Útiles**

### Para Customers:
- `menu` - Ver menú principal
- `help` - Ver ayuda
- `cancel` - Cancelar y empezar de nuevo
- `end chat` - Cerrar chat activo

### Para Providers:
- `register provider` - Registrarse como proveedor
- `go online` - Ponerse disponible
- `go offline` - Ponerse no disponible
- `my requests` - Ver tus requests
- `my stats` - Ver estadísticas
- `help` - Ver ayuda
- `end chat` - Cerrar chat activo
- `complete` - Marcar servicio como completado

---

## 🐛 **Solución de Problemas**

### Problema: "end chat" no funciona
**Solución**: 
1. Verifica que estés en un chat activo (debes haber iniciado el chat primero)
2. Asegúrate de escribir exactamente: `end chat` (sin mayúsculas)
3. Si no funciona, escribe `menu` para resetear y empezar de nuevo

### Problema: No recibo mensajes
**Solución**:
1. Verifica que el servidor esté corriendo: `curl http://localhost:5000/health`
2. Verifica que ngrok esté corriendo
3. Revisa los logs: `tail -f /tmp/whatsapp-server.log`
4. Verifica que tu número esté en la lista de permitidos en Meta Dashboard

### Problema: El chat no se inicia
**Solución**:
1. Asegúrate de que el provider haya **aceptado** el request primero
2. El customer debe tocar `💬 Start Chat` o el provider `💬 Chat with Customer`
3. Ambos deben estar en el mismo request (mismo `request_id`)

### Problema: Los mensajes no se reenvían
**Solución**:
1. Verifica que ambos estén en chat activo (deben haber recibido "Chat Started")
2. Los mensajes de texto se reenvían automáticamente
3. Si envías un comando como "menu", no se reenvía (es procesado como comando)

---

## 📊 **Verificar Estado en Base de Datos**

### Ver tus requests (como customer):
```bash
cd whatsapp/backend
sqlite3 dev.sqlite3 "SELECT id, service_type, status, address FROM service_requests WHERE customer_id = (SELECT id FROM users WHERE phone = '5216565884840');"
```

### Ver tus requests (como provider):
```bash
sqlite3 dev.sqlite3 "SELECT sr.id, sr.service_type, sr.status, u.name as customer_name FROM service_requests sr JOIN users u ON sr.customer_id = u.id WHERE sr.provider_id = (SELECT id FROM providers WHERE user_id = (SELECT id FROM users WHERE phone = '5216565884840'));"
```

### Ver sesiones de chat activas:
```bash
# Las sesiones están en Redis, pero puedes ver los mensajes:
sqlite3 dev.sqlite3 "SELECT * FROM messages ORDER BY created_at DESC LIMIT 10;"
```

---

## ✅ **Checklist Rápido de Pruebas**

- [ ] **Customer Flow**:
  - [ ] Enviar mensaje → Recibir bienvenida
  - [ ] Seleccionar servicio → Ver lista de providers
  - [ ] Ver detalle de provider → Ver reviews
  - [ ] Reservar servicio → Completar booking

- [ ] **Provider Flow**:
  - [ ] Escribir "register provider" → Iniciar registro
  - [ ] Seleccionar múltiples servicios → Todos se guardan
  - [ ] Escribir bio → Completar registro
  - [ ] "go online" → Estado actualizado

- [ ] **Chat Flow**:
  - [ ] Customer inicia chat → Ambos reciben "Chat Started"
  - [ ] Customer envía mensaje → Provider lo recibe con prefijo
  - [ ] Provider responde → Customer lo recibe con prefijo
  - [ ] "end chat" funciona → Ambos notificados
  - [ ] "complete" funciona → Transición a rating

---

**¿Problemas?** Revisa los logs: `tail -f /tmp/whatsapp-server.log`

