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

## 🎯 **Escenario 4: Probar el FLUJO DE RATING (Milestone 6)**

> Este escenario requiere haber completado un booking con chat activo (Escenario 3).

### Requisitos Previos
- Chat activo entre Customer y Provider (Escenario 3 completado hasta Paso 5)
- O al menos un request con status `provider_assigned`

### Paso 1: Provider Marca Servicio como Completado
#### Desde Provider:
1. **Estando en un chat activo, escribe**:
   ```
   complete
   ```

2. **Provider recibe**:
   ```
   ✅ Service marked as completed!

   The customer will be asked to rate your service.
   You'll also get a chance to rate the customer afterwards.
   ```

3. **Customer recibe**:
   ```
   ✅ The service has been completed!

   ⭐ How would you rate [Provider Name]?

   Tap a rating:
   ```
   + Botones: `⭐ 1-2 Poor` | `⭐⭐⭐ 3 OK` | `⭐⭐⭐⭐⭐ 4-5 Great`

### Paso 2: Customer Califica al Provider

#### Opción A: Rating 4-5 (Great)
1. **Toca** `⭐⭐⭐⭐⭐ 4-5 Great`

2. **Recibirás selección fina**:
   ```
   ⭐ How many stars?
   ```
   + Botones: `⭐⭐⭐⭐ 4 Stars` | `⭐⭐⭐⭐⭐ 5 Stars`

3. **Toca** `⭐⭐⭐⭐⭐ 5 Stars`

4. **Te pide comentario**:
   ```
   📝 Would you like to leave a comment? (Send "skip" to skip)
   ```

5. **Escribe un comentario**:
   ```
   Excelente servicio, muy profesional!
   ```
   O escribe `skip` para omitir

6. **Recibirás confirmación**:
   ```
   ✅ Thank you for your review!

   ⭐⭐⭐⭐⭐ (5/5)
   💬 "Excelente servicio, muy profesional!"

   Your feedback helps other customers find great providers.
   ```
   + Botones: `🏠 Back to Menu` | `📄 My Requests`

#### Opción B: Rating 3 (OK)
1. **Toca** `⭐⭐⭐ 3 OK`

2. **Directo al comentario** (sin selección fina):
   ```
   📝 Would you like to leave a comment? (Send "skip" to skip)
   ```

3. **Escribe** comentario o `skip`

4. **Recibirás** la misma confirmación con 3 estrellas

#### Opción C: Rating 1-2 (Poor)
1. **Toca** `⭐ 1-2 Poor`

2. **Recibirás selección fina**:
   ```
   ⭐ How many stars?
   ```
   + Botones: `⭐ 1 Star` | `⭐⭐ 2 Stars`

3. **Selecciona** una opción

4. **Te pide comentario**, sigue igual que las otras opciones

### Paso 3: Provider Califica al Customer

> Después de que el Customer termina su rating, el Provider recibe automáticamente la solicitud de calificar al Customer.

#### Desde Provider:
1. **Recibirás**:
   ```
   ⭐ How was working with [Customer Name]?

   Tap a rating:
   ```
   + Botones: `⭐ 1-2 Poor` | `⭐⭐⭐ 3 OK` | `⭐⭐⭐⭐⭐ 4-5 Great`

2. **Toca** una opción (ej: `⭐⭐⭐⭐⭐ 4-5 Great`)

3. **Selección fina**: Elige 4 o 5 estrellas

4. **Comentario**: Escribe un comentario o `skip`

5. **Recibirás confirmación**:
   ```
   ✅ Thank you for your review!

   ⭐⭐⭐⭐⭐ (5/5) for [Customer Name]
   💬 "Buen cliente, muy puntual"
   ```
   + Botones: `🟢 Go Online` | `👤 Dashboard`

6. **También puedes escribir** `skip` en cualquier momento del rating para saltarlo completamente

### Paso 4: Verificar Datos en Base de Datos

#### Verificar que el rating se guardó:
```bash
cd whatsapp/backend
sqlite3 dev.sqlite3 "SELECT r.stars, r.comment, u1.name as rater, u2.name as ratee FROM ratings r JOIN users u1 ON r.rater_id = u1.id JOIN users u2 ON r.ratee_id = u2.id ORDER BY r.created_at DESC LIMIT 5;"
```

#### Verificar que el promedio del provider se actualizó:
```bash
sqlite3 dev.sqlite3 "SELECT u.name, p.rating_average, p.total_jobs FROM providers p JOIN users u ON p.user_id = u.id;"
```

#### Verificar que el request está completado:
```bash
sqlite3 dev.sqlite3 "SELECT id, service_type, status, completed_at FROM service_requests ORDER BY created_at DESC LIMIT 5;"
```

#### Verificar que las nuevas reviews aparecen en las tarjetas de provider:
1. Como Customer, escribe `menu`
2. Selecciona el mismo servicio
3. Selecciona el provider que calificaste
4. **Deberías ver** tu nueva review en la sección "Recent Reviews" de la tarjeta del provider

---

## 🧪 **Escenario 5: Edge Cases del Rating**

### 5.1 — Input inválido durante rating
1. Durante la selección de estrellas, **envía un texto** en lugar de tocar un botón
2. **Deberías recibir**:
   ```
   🤔 Please tap one of the rating buttons below, or type "cancel" to skip rating.
   ```
   + Los botones se reenvían

### 5.2 — Cancelar durante el rating (Customer)
1. Durante cualquier paso del rating, **escribe**:
   ```
   cancel
   ```
2. **El rating se cancela**, vuelves al menú principal
3. **Nota**: El provider igual recibirá su solicitud de calificar

### 5.3 — Skip del rating (Provider)
1. Cuando el provider recibe la solicitud de calificar, **escribe**:
   ```
   skip
   ```
2. **Recibirás**:
   ```
   ✅ Rating skipped. Thank you!
   ```
3. **Vuelves** al dashboard del provider con botones

### 5.4 — Flujo completo sin comentarios
1. Customer selecciona `⭐⭐⭐ 3 OK`
2. Escribe `skip` para el comentario
3. **Rating guardado** como 3 estrellas sin comentario
4. Provider recibe su solicitud de calificar
5. Provider selecciona rating y escribe `skip` para el comentario
6. **Ambos ratings guardados** sin comentarios

### 5.5 — Verificar que nuevas reviews aparecen para nuevos customers
1. Después de completar un rating, **desde otro número** (o limpiando sesión):
2. Inicia como Customer → selecciona el servicio del provider que calificaste
3. Ve el detalle del provider
4. **La nueva review debe aparecer** en la sección "Recent Reviews"

---

## 📋 **Checklist Completo Milestone 6**

- [ ] **Customer Rating Flow**:
  - [ ] Provider escribe "complete" → Customer recibe botones de rating
  - [ ] Seleccionar "4-5 Great" → Muestra botones finos (4 o 5)
  - [ ] Seleccionar "3 OK" → Va directo a comentario
  - [ ] Seleccionar "1-2 Poor" → Muestra botones finos (1 o 2)
  - [ ] Escribir comentario → Rating guardado con comentario
  - [ ] Escribir "skip" → Rating guardado sin comentario
  - [ ] Confirmación de rating recibida
  - [ ] Botones "Back to Menu" / "My Requests" funcionan

- [ ] **Provider Rating Flow**:
  - [ ] Después del rating del Customer → Provider recibe solicitud de calificar
  - [ ] Seleccionar rating → Flujo igual al del Customer
  - [ ] Escribir "skip" → Salta rating completamente
  - [ ] Confirmación recibida con botones de dashboard

- [ ] **Base de Datos**:
  - [ ] Rating del Customer → Provider se guardó en tabla `ratings`
  - [ ] Rating del Provider → Customer se guardó en tabla `ratings`
  - [ ] `rating_average` del Provider actualizado correctamente
  - [ ] `rating_average` del Customer actualizado correctamente
  - [ ] `service_requests.status` = `completed`
  - [ ] `total_jobs` del provider actualizado

- [ ] **Reviews en Tarjetas**:
  - [ ] Nueva review aparece en "Recent Reviews" del provider
  - [ ] Reviews ordenadas por más reciente primero
  - [ ] Solo se muestra primer nombre del reviewer (privacidad)

- [ ] **Edge Cases**:
  - [ ] Input inválido durante rating → Reenvía botones
  - [ ] "cancel" durante rating → Cancela y vuelve a menú
  - [ ] "help" durante rating → Muestra ayuda
  - [ ] "skip" para provider rating → Salta rating completo
  - [ ] Chat cerrado correctamente después de "complete"

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
- `skip` - Saltar rating del provider (durante flujo de calificación)

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

- [ ] **Customer Flow (M1-M3)**:
  - [ ] Enviar mensaje → Recibir bienvenida
  - [ ] Seleccionar servicio → Ver lista de providers
  - [ ] Ver detalle de provider → Ver reviews
  - [ ] Reservar servicio → Completar booking

- [ ] **Provider Flow (M4)**:
  - [ ] Escribir "register provider" → Iniciar registro
  - [ ] Seleccionar múltiples servicios → Todos se guardan
  - [ ] Escribir bio → Completar registro
  - [ ] "go online" → Estado actualizado

- [ ] **Chat Flow (M5)**:
  - [ ] Customer inicia chat → Ambos reciben "Chat Started"
  - [ ] Customer envía mensaje → Provider lo recibe con prefijo
  - [ ] Provider responde → Customer lo recibe con prefijo
  - [ ] "end chat" funciona → Ambos notificados
  - [ ] "complete" funciona → Transición a rating

- [ ] **Rating Flow (M6)**:
  - [ ] "complete" → Customer recibe botones de rating
  - [ ] Customer califica (1-5 estrellas + comentario)
  - [ ] Provider recibe solicitud de calificar
  - [ ] Provider califica (o salta con "skip")
  - [ ] Ratings guardados en BD
  - [ ] Promedios actualizados correctamente
  - [ ] Nuevas reviews visibles en tarjetas de provider

---

**¿Problemas?** Revisa los logs: `tail -f /tmp/whatsapp-server.log`

