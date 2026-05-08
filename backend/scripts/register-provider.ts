/**
 * Register a phone number as a provider.
 *
 * Usage:
 *   npx ts-node scripts/register-provider.ts +5215512345678
 *   npx ts-node scripts/register-provider.ts +5215512345678 "Mi Nombre" plumbing,electrical
 *
 * This script:
 * 1. Creates (or updates) a user with role PROVIDER
 * 2. Creates a provider profile with selected service categories
 * 3. The provider will then appear in the app and receive WhatsApp notifications
 */

import { PrismaClient } from '@prisma/client';
import { canonicalizePhoneE164 } from '../src/common/utils/phone.utils';

const prisma = new PrismaClient();

const SERVICE_TYPES_MAP: Record<string, string> = {
  plumbing: 'Plomería 🔧',
  electrical: 'Electricidad ⚡',
  cleaning: 'Limpieza 🧹',
  gardening: 'Jardinería 🌿',
  painting: 'Pintura 🎨',
  locksmith: 'Cerrajería 🔑',
  repair: 'Reparaciones 🔨',
  moving: 'Mudanzas 📦',
};

async function main() {
  const phone = process.argv[2];
  const name = process.argv[3] || 'Proveedor Demo';
  const serviceTypesArg = process.argv[4] || 'plumbing,electrical,repair';

  if (!phone) {
    console.log('');
    console.log('🔧 Registrar Proveedor - Handy MVP');
    console.log('──────────────────────────────────────');
    console.log('');
    console.log('Uso:');
    console.log('  npx ts-node scripts/register-provider.ts <PHONE> [NAME] [SERVICES]');
    console.log('');
    console.log('Ejemplos:');
    console.log('  npx ts-node scripts/register-provider.ts +5215512345678');
    console.log('  npx ts-node scripts/register-provider.ts +5215512345678 "Juan Pérez"');
    console.log('  npx ts-node scripts/register-provider.ts +5215512345678 "Juan Pérez" plumbing,electrical');
    console.log('');
    console.log('Servicios disponibles:');
    for (const [key, label] of Object.entries(SERVICE_TYPES_MAP)) {
      console.log(`  ${key.padEnd(12)} → ${label}`);
    }
    console.log('');
    process.exit(1);
  }

  const normalizedPhone = canonicalizePhoneE164(phone);
  const serviceTypes = serviceTypesArg.split(',').map((s) => s.trim());

  // Validate service types
  for (const st of serviceTypes) {
    if (!SERVICE_TYPES_MAP[st]) {
      console.error(`❌ Servicio desconocido: "${st}"`);
      console.log(`   Servicios válidos: ${Object.keys(SERVICE_TYPES_MAP).join(', ')}`);
      process.exit(1);
    }
  }

  console.log('');
  console.log('🔧 Registrando proveedor...');
  console.log(`   📱 Teléfono: ${normalizedPhone}`);
  console.log(`   👤 Nombre: ${name}`);
  console.log(`   🛠  Servicios: ${serviceTypes.map((s) => SERVICE_TYPES_MAP[s]).join(', ')}`);
  console.log('');

  // 1. Create or update user
  const user = await prisma.user.upsert({
    where: { phone: normalizedPhone },
    update: {
      name,
      role: 'PROVIDER',
      avatarUrl: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(name)}`,
      ratingAverage: 4.8,
      ratingCount: 5,
    },
    create: {
      phone: normalizedPhone,
      name,
      role: 'PROVIDER',
      avatarUrl: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(name)}`,
      ratingAverage: 4.8,
      ratingCount: 5,
    },
  });

  console.log(`   ✅ Usuario creado/actualizado: ${user.id}`);

  // 2. Create or update provider profile
  const profile = await prisma.providerProfile.upsert({
    where: { userId: user.id },
    update: {
      bio: `Proveedor profesional de ${serviceTypes.map((s) => SERVICE_TYPES_MAP[s]).join(', ')}. Disponible para servicio a domicilio.`,
      serviceTypes,
      isVerified: true,
      isAvailable: true,
      totalJobs: 10,
      locationLat: 19.4326,
      locationLng: -99.1332,
      coverageRadius: 15,
    },
    create: {
      userId: user.id,
      bio: `Proveedor profesional de ${serviceTypes.map((s) => SERVICE_TYPES_MAP[s]).join(', ')}. Disponible para servicio a domicilio.`,
      serviceTypes,
      isVerified: true,
      isAvailable: true,
      totalJobs: 10,
      locationLat: 19.4326,
      locationLng: -99.1332,
      coverageRadius: 15,
    },
  });

  console.log(`   ✅ Perfil de proveedor: ${profile.id}`);

  // 3. Make sure the service categories exist for these types
  const categories = await prisma.serviceCategory.findMany({
    where: { slug: { in: serviceTypes } },
  });

  console.log(`   ✅ Categorías vinculadas: ${categories.map((c) => `${c.icon} ${c.name}`).join(', ')}`);

  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  🎉 ¡Proveedor registrado exitosamente!');
  console.log('══════════════════════════════════════════════');
  console.log('');
  console.log('  📋 Para probar el flujo completo:');
  console.log('');
  console.log('  1. Abre la app en el navegador (http://localhost:3001)');
  console.log(`  2. Inicia sesión con un número DIFERENTE al tuyo`);
  console.log(`     (usa cualquier número de prueba, el OTP sale en la consola del backend)`);
  console.log(`  3. Busca tu perfil "${name}" en la lista de proveedores`);
  console.log('  4. Solicita un servicio');
  console.log(`  5. Recibirás la notificación en tu WhatsApp (${normalizedPhone})`);
  console.log('  6. Acepta el trabajo desde WhatsApp');
  console.log('  7. ¡Chatea con el cliente desde WhatsApp! 💬');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

