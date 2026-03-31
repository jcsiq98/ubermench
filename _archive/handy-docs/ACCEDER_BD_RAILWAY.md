# 🗄️ Cómo Acceder a la Base de Datos en Railway

## Opción 1: Desde el Dashboard de Railway (Más Fácil)

### Si usas Neon (PostgreSQL):

1. **En Railway, busca el servicio de PostgreSQL/Neon**
   - Debería aparecer en tu lista de servicios
   - Busca algo como "Postgres" o "Neon"

2. **Haz clic en el servicio de base de datos**

3. **Busca la pestaña "Query" o "Console"**
   - Debería estar en el menú superior junto a "Variables", "Settings", etc.
   - O busca un botón que diga "Open Neon Console" o "Query"

4. **Si no encuentras "Query", busca "Connect" o "Data"**
   - A veces está en la sección de conexión

5. **Una vez abierto el editor SQL, pega el SQL y ejecuta**

---

## Opción 2: Usar Neon Dashboard Directo

Si Railway usa Neon, puedes acceder directamente:

1. **En Railway, en el servicio PostgreSQL/Neon:**
   - Busca la variable `DATABASE_URL` o `POSTGRES_URL`
   - O busca un botón que diga "Open in Neon" o similar

2. **Si tienes acceso al dashboard de Neon:**
   - Ve a https://console.neon.tech
   - Inicia sesión con la misma cuenta
   - Selecciona tu proyecto
   - Ve a "SQL Editor"

---

## Opción 3: Usar Railway CLI (Si lo tienes instalado)

```bash
# Conectar a la BD
railway connect postgres

# Esto abrirá psql, luego puedes ejecutar:
\i handy/backend/scripts/delete-provider-sql.sql
```

---

## Opción 4: Conectarte con un Cliente SQL (pgAdmin, DBeaver, etc.)

1. **Obtén las credenciales de conexión:**
   - En Railway → Servicio PostgreSQL → Variables
   - Busca `DATABASE_URL` o `POSTGRES_URL`
   - Debería verse algo como: `postgresql://user:password@host:port/database`

2. **Usa esas credenciales en tu cliente SQL favorito**

---

## 🎯 SQL para Ejecutar (Tu número: +526565884840)

Una vez que tengas acceso al editor SQL, ejecuta esto:

```sql
-- Ver qué hay primero
SELECT id, phone, name, role FROM users WHERE phone = '+526565884840';
SELECT id, phone, name FROM provider_applications WHERE phone = '+526565884840';

-- ELIMINAR
DELETE FROM provider_service_zones WHERE provider_id IN (
  SELECT pp.id FROM provider_profiles pp
  JOIN users u ON u.id = pp.user_id WHERE u.phone = '+526565884840'
);

DELETE FROM bookings WHERE provider_id IN (
  SELECT pp.id FROM provider_profiles pp
  JOIN users u ON u.id = pp.user_id WHERE u.phone = '+526565884840'
) OR customer_id IN (SELECT id FROM users WHERE phone = '+526565884840');

DELETE FROM messages WHERE sender_id IN (SELECT id FROM users WHERE phone = '+526565884840');
DELETE FROM ratings WHERE from_user_id IN (SELECT id FROM users WHERE phone = '+526565884840') 
  OR to_user_id IN (SELECT id FROM users WHERE phone = '+526565884840');
DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE phone = '+526565884840');
DELETE FROM otp_codes WHERE user_id IN (SELECT id FROM users WHERE phone = '+526565884840');
DELETE FROM provider_profiles WHERE user_id IN (SELECT id FROM users WHERE phone = '+526565884840');
DELETE FROM provider_applications WHERE phone = '+526565884840';
DELETE FROM users WHERE phone = '+526565884840';

-- Verificar (debe mostrar 0)
SELECT COUNT(*) as usuarios FROM users WHERE phone = '+526565884840';
SELECT COUNT(*) as aplicaciones FROM provider_applications WHERE phone = '+526565884840';
```

---

## 📸 ¿Dónde está el botón "Query"?

Si no lo encuentras, busca en estas ubicaciones:

1. **Pestañas superiores del servicio PostgreSQL:**
   - Overview
   - **Query** ← Aquí
   - Variables
   - Settings
   - Metrics

2. **O en el menú lateral:**
   - Data
   - **SQL Editor** ← Aquí
   - Connections

3. **O en la sección de conexión:**
   - Busca un botón "Open Console" o "Query Database"

---

## 💡 Tip

Si no encuentras el editor SQL, puedes:
- Hacer clic derecho en el servicio PostgreSQL → "Open in Browser"
- O buscar en la documentación de Railway/Neon para tu región

¿Puedes ver el servicio de PostgreSQL en tu lista de servicios en Railway?

