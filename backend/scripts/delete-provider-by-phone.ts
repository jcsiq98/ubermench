import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Script para eliminar un proveedor (y su aplicación) por número de teléfono
 * 
 * Uso: npx ts-node scripts/delete-provider-by-phone.ts <phone>
 * Ejemplo: npx ts-node scripts/delete-provider-by-phone.ts +5215512345001
 */
async function main() {
  const phone = process.argv[2];

  if (!phone) {
    console.error('❌ Error: Debes proporcionar un número de teléfono');
    console.log('Uso: npx ts-node scripts/delete-provider-by-phone.ts <phone>');
    console.log('Ejemplo: npx ts-node scripts/delete-provider-by-phone.ts +5215512345001');
    process.exit(1);
  }

  console.log(`🔍 Buscando proveedor con número: ${phone}`);

  // Normalizar el número (agregar + si no lo tiene)
  const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;

  try {
    // 1. Buscar el usuario
    const user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
      include: {
        providerProfile: true,
      },
    });

    if (!user) {
      console.log(`⚠️  No se encontró usuario con número ${normalizedPhone}`);
      
      // Buscar en ProviderApplication
      const application = await prisma.providerApplication.findUnique({
        where: { phone: normalizedPhone },
      });

      if (application) {
        console.log(`📋 Se encontró una aplicación pendiente para este número`);
        await prisma.providerApplication.delete({
          where: { id: application.id },
        });
        console.log(`✅ Aplicación eliminada`);
      } else {
        console.log(`ℹ️  No se encontró ni usuario ni aplicación con este número`);
      }
      return;
    }

    console.log(`👤 Usuario encontrado: ${user.name || user.phone} (${user.role})`);

    if (user.role !== 'PROVIDER') {
      console.log(`⚠️  Este usuario no es un proveedor (rol: ${user.role})`);
      console.log(`¿Deseas eliminarlo de todas formas? (esto eliminará el usuario completo)`);
      return;
    }

    // 2. Eliminar ProviderApplication si existe
    const application = await prisma.providerApplication.findUnique({
      where: { phone: normalizedPhone },
    });

    if (application) {
      console.log(`📋 Eliminando aplicación de proveedor...`);
      await prisma.providerApplication.delete({
        where: { id: application.id },
      });
      console.log(`✅ Aplicación eliminada`);
    }

    // 3. Si tiene ProviderProfile, eliminar relaciones primero
    if (user.providerProfile) {
      const profileId = user.providerProfile.id;

      console.log(`🔗 Eliminando relaciones del perfil...`);

      // Eliminar ProviderServiceZone
      await prisma.providerServiceZone.deleteMany({
        where: { providerId: profileId },
      });

      // Eliminar Bookings (esto también eliminará Messages y Ratings por cascade)
      await prisma.booking.deleteMany({
        where: { providerId: profileId },
      });

      // Eliminar ProviderProfile
      await prisma.providerProfile.delete({
        where: { id: profileId },
      });

      console.log(`✅ Perfil de proveedor eliminado`);
    }

    // 4. Eliminar RefreshTokens
    await prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    // 5. Eliminar OtpCodes
    await prisma.otpCode.deleteMany({
      where: { userId: user.id },
    });

    // 6. Eliminar Ratings donde es el receptor
    await prisma.rating.deleteMany({
      where: { toUserId: user.id },
    });

    // 7. Eliminar Ratings donde es el emisor
    await prisma.rating.deleteMany({
      where: { fromUserId: user.id },
    });

    // 8. Eliminar Messages
    await prisma.message.deleteMany({
      where: { senderId: user.id },
    });

    // 9. Eliminar Bookings como cliente (si los tiene)
    await prisma.booking.deleteMany({
      where: { customerId: user.id },
    });

    // 10. Finalmente, eliminar el User
    await prisma.user.delete({
      where: { id: user.id },
    });

    console.log(`✅ Usuario y todos sus datos relacionados eliminados exitosamente`);
    console.log(`📱 Ahora puedes hacer onboarding desde tu celular con el número ${normalizedPhone}`);

  } catch (error: any) {
    console.error('❌ Error al eliminar:', error.message);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

