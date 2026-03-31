import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Service Categories ──
  const categories = await Promise.all([
    prisma.serviceCategory.upsert({
      where: { slug: 'plumbing' },
      update: {},
      create: {
        name: 'Plomería',
        slug: 'plumbing',
        icon: '🔧',
        description: 'Reparación de tuberías, grifos, drenaje y más',
        sortOrder: 1,
      },
    }),
    prisma.serviceCategory.upsert({
      where: { slug: 'electrical' },
      update: {},
      create: {
        name: 'Electricidad',
        slug: 'electrical',
        icon: '⚡',
        description: 'Instalaciones eléctricas, apagones, cortocircuitos',
        sortOrder: 2,
      },
    }),
    prisma.serviceCategory.upsert({
      where: { slug: 'cleaning' },
      update: {},
      create: {
        name: 'Limpieza',
        slug: 'cleaning',
        icon: '🧹',
        description: 'Limpieza de hogar, oficina, post-construcción',
        sortOrder: 3,
      },
    }),
    prisma.serviceCategory.upsert({
      where: { slug: 'gardening' },
      update: {},
      create: {
        name: 'Jardinería',
        slug: 'gardening',
        icon: '🌿',
        description: 'Corte de pasto, poda, diseño de jardines',
        sortOrder: 4,
      },
    }),
    prisma.serviceCategory.upsert({
      where: { slug: 'painting' },
      update: {},
      create: {
        name: 'Pintura',
        slug: 'painting',
        icon: '🎨',
        description: 'Pintura interior, exterior, impermeabilización',
        sortOrder: 5,
      },
    }),
    prisma.serviceCategory.upsert({
      where: { slug: 'locksmith' },
      update: {},
      create: {
        name: 'Cerrajería',
        slug: 'locksmith',
        icon: '🔑',
        description: 'Apertura de puertas, cambio de chapas, duplicado de llaves',
        sortOrder: 6,
      },
    }),
    prisma.serviceCategory.upsert({
      where: { slug: 'repair' },
      update: {},
      create: {
        name: 'Reparaciones',
        slug: 'repair',
        icon: '🔨',
        description: 'Reparaciones generales del hogar',
        sortOrder: 7,
      },
    }),
    prisma.serviceCategory.upsert({
      where: { slug: 'moving' },
      update: {},
      create: {
        name: 'Mudanzas',
        slug: 'moving',
        icon: '📦',
        description: 'Mudanzas locales, embalaje, transporte',
        sortOrder: 8,
      },
    }),
  ]);

  console.log(`✅ ${categories.length} service categories created`);

  // ── Admin User ──
  const adminUser = await prisma.user.upsert({
    where: { phone: '+5215500000000' },
    update: { role: 'ADMIN', name: 'Admin Handy' },
    create: {
      phone: '+5215500000000',
      name: 'Admin Handy',
      role: 'ADMIN',
      email: 'admin@handy.mx',
    },
  });
  console.log(`✅ Admin user created: ${adminUser.phone} (${adminUser.id})`);

  // ── Provider Users + Profiles ──
  const providers = [
    {
      name: 'Carlos Mendoza',
      phone: '+5215512345001',
      avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Carlos',
      bio: 'Plomero profesional con 15 años de experiencia. Especialista en reparación de tuberías, destape de drenaje y mantenimiento de cisternas. Atención a domicilio en toda la CDMX.',
      serviceTypes: ['plumbing'],
      ratingAvg: 4.8,
      ratingCount: 47,
      totalJobs: 52,
      verified: true,
      lat: 19.4326,
      lng: -99.1332,
    },
    {
      name: 'Roberto Hernández',
      phone: '+5215512345002',
      avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Roberto',
      bio: 'Electricista certificado con más de 20 años de experiencia. Instalaciones residenciales y comerciales, reparación de cortos circuitos y modernización de tableros eléctricos.',
      serviceTypes: ['electrical'],
      ratingAvg: 4.9,
      ratingCount: 63,
      totalJobs: 71,
      verified: true,
      lat: 19.4284,
      lng: -99.1276,
    },
    {
      name: 'María Guadalupe López',
      phone: '+5215512345003',
      avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Maria',
      bio: 'Servicio de limpieza profesional para hogares y oficinas. Cuento con equipo propio y productos ecológicos. Limpieza profunda, regular y post-construcción.',
      serviceTypes: ['cleaning'],
      ratingAvg: 4.7,
      ratingCount: 89,
      totalJobs: 102,
      verified: true,
      lat: 19.4195,
      lng: -99.1526,
    },
    {
      name: 'José Antonio García',
      phone: '+5215512345004',
      avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Jose',
      bio: 'Jardinero con pasión por las plantas y la naturaleza. Diseño de jardines, mantenimiento de áreas verdes, sistemas de riego y poda de árboles.',
      serviceTypes: ['gardening'],
      ratingAvg: 4.6,
      ratingCount: 34,
      totalJobs: 38,
      verified: false,
      lat: 19.435,
      lng: -99.145,
    },
    {
      name: 'Fernando Ruiz Ortega',
      phone: '+5215512345005',
      avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Fernando',
      bio: 'Pintor profesional con 12 años de experiencia. Interiores, exteriores, impermeabilización y acabados decorativos. Trabajo limpio y garantizado.',
      serviceTypes: ['painting'],
      ratingAvg: 4.5,
      ratingCount: 28,
      totalJobs: 31,
      verified: true,
      lat: 19.425,
      lng: -99.168,
    },
    {
      name: 'Ricardo Torres Luna',
      phone: '+5215512345006',
      avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Ricardo',
      bio: 'Cerrajero disponible las 24 horas, los 7 días de la semana. Apertura de puertas, autos y cajas fuertes. Cambio de chapas y cerraduras de seguridad.',
      serviceTypes: ['locksmith'],
      ratingAvg: 4.4,
      ratingCount: 22,
      totalJobs: 25,
      verified: true,
      lat: 19.418,
      lng: -99.141,
    },
    {
      name: 'Miguel Ángel Vásquez',
      phone: '+5215512345007',
      avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Miguel',
      bio: 'Todólogo del hogar con 18 años de experiencia. Plomería, electricidad, carpintería y reparaciones en general. ¡Si algo se descompone, yo lo arreglo!',
      serviceTypes: ['repair', 'plumbing', 'electrical'],
      ratingAvg: 4.3,
      ratingCount: 56,
      totalJobs: 64,
      verified: false,
      lat: 19.44,
      lng: -99.12,
    },
    {
      name: 'Luis Enrique Morales',
      phone: '+5215512345008',
      avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Luis',
      bio: 'Servicio de mudanzas con camioneta propia. Embalaje profesional, transporte seguro y montaje/desmontaje de muebles. Mudanzas locales y foráneas.',
      serviceTypes: ['moving'],
      ratingAvg: 4.7,
      ratingCount: 41,
      totalJobs: 45,
      verified: true,
      lat: 19.41,
      lng: -99.155,
    },
    {
      name: 'Patricia Sánchez Romero',
      phone: '+5215512345009',
      avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Patricia',
      bio: 'Especialista en limpieza profunda y desinfección. Experiencia en limpieza post-construcción, post-mudanza y mantenimiento de oficinas corporativas.',
      serviceTypes: ['cleaning'],
      ratingAvg: 4.9,
      ratingCount: 73,
      totalJobs: 80,
      verified: true,
      lat: 19.422,
      lng: -99.138,
    },
    {
      name: 'Alejandro Díaz Herrera',
      phone: '+5215512345010',
      avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Alejandro',
      bio: 'Electricista y plomero con doble certificación. Dos oficios en una sola visita: ahorra tiempo y dinero. Instalaciones nuevas y reparaciones.',
      serviceTypes: ['electrical', 'plumbing'],
      ratingAvg: 4.6,
      ratingCount: 37,
      totalJobs: 42,
      verified: true,
      lat: 19.431,
      lng: -99.16,
    },
    {
      name: 'Sofía Ramírez Guerrero',
      phone: '+5215512345011',
      avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Sofia',
      bio: 'Pintora artística y decorativa. Murales, acabados texturizados, técnicas venezianas y restauración de superficies. Dale vida a tus espacios.',
      serviceTypes: ['painting'],
      ratingAvg: 4.8,
      ratingCount: 19,
      totalJobs: 22,
      verified: true,
      lat: 19.427,
      lng: -99.171,
    },
    {
      name: 'Eduardo Castillo Méndez',
      phone: '+5215512345012',
      avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Eduardo',
      bio: 'Jardinero profesional y paisajista. Mantenimiento de jardines, diseño de terrazas verdes, huertos urbanos y control de plagas.',
      serviceTypes: ['gardening'],
      ratingAvg: 4.5,
      ratingCount: 26,
      totalJobs: 30,
      verified: true,
      lat: 19.438,
      lng: -99.149,
    },
  ];

  const providerRecords: { userId: string; profileId: string; name: string }[] = [];

  for (const p of providers) {
    const user = await prisma.user.upsert({
      where: { phone: p.phone },
      update: {
        name: p.name,
        role: 'PROVIDER',
        avatarUrl: p.avatarUrl,
        ratingAverage: p.ratingAvg,
        ratingCount: p.ratingCount,
      },
      create: {
        phone: p.phone,
        name: p.name,
        avatarUrl: p.avatarUrl,
        role: 'PROVIDER',
        ratingAverage: p.ratingAvg,
        ratingCount: p.ratingCount,
      },
    });

    const profile = await prisma.providerProfile.upsert({
      where: { userId: user.id },
      update: {
        bio: p.bio,
        serviceTypes: p.serviceTypes,
        totalJobs: p.totalJobs,
        isVerified: p.verified,
        locationLat: p.lat,
        locationLng: p.lng,
        coverageRadius: 10,
      },
      create: {
        userId: user.id,
        bio: p.bio,
        serviceTypes: p.serviceTypes,
        totalJobs: p.totalJobs,
        isVerified: p.verified,
        locationLat: p.lat,
        locationLng: p.lng,
        coverageRadius: 10,
      },
    });

    providerRecords.push({ userId: user.id, profileId: profile.id, name: p.name });
  }

  console.log(`✅ ${providers.length} providers created with profiles`);

  // ── Service Zones ──
  // Zones for major cities across Mexico — new cities will be auto-created
  // by ZonesService when providers register via WhatsApp onboarding
  const zonesData = [
    // ── CDMX ──
    { name: 'Condesa', city: 'Ciudad de México', state: 'CDMX', lat: 19.4115, lng: -99.1733 },
    { name: 'Roma Norte', city: 'Ciudad de México', state: 'CDMX', lat: 19.4195, lng: -99.1596 },
    { name: 'Roma Sur', city: 'Ciudad de México', state: 'CDMX', lat: 19.4100, lng: -99.1600 },
    { name: 'Polanco', city: 'Ciudad de México', state: 'CDMX', lat: 19.4333, lng: -99.1980 },
    { name: 'Del Valle', city: 'Ciudad de México', state: 'CDMX', lat: 19.3880, lng: -99.1690 },
    { name: 'Narvarte', city: 'Ciudad de México', state: 'CDMX', lat: 19.3950, lng: -99.1560 },
    { name: 'Coyoacán', city: 'Ciudad de México', state: 'CDMX', lat: 19.3500, lng: -99.1620 },
    { name: 'Centro Histórico', city: 'Ciudad de México', state: 'CDMX', lat: 19.4326, lng: -99.1332 },
    { name: 'Juárez', city: 'Ciudad de México', state: 'CDMX', lat: 19.4270, lng: -99.1620 },
    { name: 'Cuauhtémoc', city: 'Ciudad de México', state: 'CDMX', lat: 19.4380, lng: -99.1530 },
    { name: 'Santa Fe', city: 'Ciudad de México', state: 'CDMX', lat: 19.3590, lng: -99.2760 },
    { name: 'Tlalpan', city: 'Ciudad de México', state: 'CDMX', lat: 19.2870, lng: -99.1680 },
    { name: 'Xochimilco', city: 'Ciudad de México', state: 'CDMX', lat: 19.2610, lng: -99.1040 },
    { name: 'Napoles', city: 'Ciudad de México', state: 'CDMX', lat: 19.3930, lng: -99.1760 },
    { name: 'Escandón', city: 'Ciudad de México', state: 'CDMX', lat: 19.4030, lng: -99.1800 },

    // ── Monterrey ──
    { name: 'San Pedro Garza García', city: 'Monterrey', state: 'Nuevo León', lat: 25.6580, lng: -100.4030 },
    { name: 'Valle', city: 'Monterrey', state: 'Nuevo León', lat: 25.6330, lng: -100.2820 },
    { name: 'Cumbres', city: 'Monterrey', state: 'Nuevo León', lat: 25.7470, lng: -100.3960 },
    { name: 'Centro Monterrey', city: 'Monterrey', state: 'Nuevo León', lat: 25.6714, lng: -100.3090 },
    { name: 'Contry', city: 'Monterrey', state: 'Nuevo León', lat: 25.6400, lng: -100.3160 },

    // ── Guadalajara ──
    { name: 'Chapultepec', city: 'Guadalajara', state: 'Jalisco', lat: 20.6730, lng: -103.3800 },
    { name: 'Providencia', city: 'Guadalajara', state: 'Jalisco', lat: 20.6910, lng: -103.3920 },
    { name: 'Americana', city: 'Guadalajara', state: 'Jalisco', lat: 20.6760, lng: -103.3700 },
    { name: 'Centro Guadalajara', city: 'Guadalajara', state: 'Jalisco', lat: 20.6765, lng: -103.3474 },
    { name: 'Zapopan Centro', city: 'Guadalajara', state: 'Jalisco', lat: 20.7167, lng: -103.3890 },

    // ── Ciudad Juárez ──
    { name: 'Pronaf', city: 'Ciudad Juárez', state: 'Chihuahua', lat: 31.7380, lng: -106.4510 },
    { name: 'Centro', city: 'Ciudad Juárez', state: 'Chihuahua', lat: 31.7400, lng: -106.4870 },
    { name: 'Las Misiones', city: 'Ciudad Juárez', state: 'Chihuahua', lat: 31.6540, lng: -106.3870 },
    { name: 'Partido Romero', city: 'Ciudad Juárez', state: 'Chihuahua', lat: 31.7100, lng: -106.4600 },
    { name: 'Campestre', city: 'Ciudad Juárez', state: 'Chihuahua', lat: 31.7250, lng: -106.4200 },
    { name: 'Zona Pronaf', city: 'Ciudad Juárez', state: 'Chihuahua', lat: 31.7370, lng: -106.4480 },
    { name: 'Gomez Morin', city: 'Ciudad Juárez', state: 'Chihuahua', lat: 31.6930, lng: -106.4240 },
    { name: 'Salvarcar', city: 'Ciudad Juárez', state: 'Chihuahua', lat: 31.6380, lng: -106.3700 },
    { name: 'Independencia', city: 'Ciudad Juárez', state: 'Chihuahua', lat: 31.7200, lng: -106.4750 },
    { name: 'Parajes del Sur', city: 'Ciudad Juárez', state: 'Chihuahua', lat: 31.6200, lng: -106.4100 },

    // ── Puebla ──
    { name: 'Centro Histórico', city: 'Puebla', state: 'Puebla', lat: 19.0414, lng: -98.2063 },
    { name: 'Angelópolis', city: 'Puebla', state: 'Puebla', lat: 19.0150, lng: -98.2370 },
    { name: 'La Paz', city: 'Puebla', state: 'Puebla', lat: 19.0480, lng: -98.1980 },
    { name: 'Huexotitla', city: 'Puebla', state: 'Puebla', lat: 19.0350, lng: -98.2250 },
    { name: 'Cholula', city: 'Puebla', state: 'Puebla', lat: 19.0630, lng: -98.3030 },

    // ── Tijuana ──
    { name: 'Zona Río', city: 'Tijuana', state: 'Baja California', lat: 32.5270, lng: -117.0370 },
    { name: 'Playas de Tijuana', city: 'Tijuana', state: 'Baja California', lat: 32.5310, lng: -117.1230 },
    { name: 'Centro', city: 'Tijuana', state: 'Baja California', lat: 32.5340, lng: -117.0190 },
    { name: 'Otay', city: 'Tijuana', state: 'Baja California', lat: 32.5490, lng: -116.9650 },
    { name: 'Chapultepec', city: 'Tijuana', state: 'Baja California', lat: 32.5130, lng: -117.0420 },

    // ── Mérida ──
    { name: 'Centro', city: 'Mérida', state: 'Yucatán', lat: 20.9700, lng: -89.6230 },
    { name: 'Altabrisa', city: 'Mérida', state: 'Yucatán', lat: 21.0080, lng: -89.5880 },
    { name: 'Montejo', city: 'Mérida', state: 'Yucatán', lat: 20.9950, lng: -89.6130 },
    { name: 'García Ginerés', city: 'Mérida', state: 'Yucatán', lat: 20.9800, lng: -89.6350 },
    { name: 'Chuburná', city: 'Mérida', state: 'Yucatán', lat: 20.9880, lng: -89.6080 },

    // ── Querétaro ──
    { name: 'Centro Histórico', city: 'Querétaro', state: 'Querétaro', lat: 20.5930, lng: -100.3890 },
    { name: 'Juriquilla', city: 'Querétaro', state: 'Querétaro', lat: 20.7100, lng: -100.4520 },
    { name: 'El Refugio', city: 'Querétaro', state: 'Querétaro', lat: 20.6280, lng: -100.3440 },
    { name: 'Milenio III', city: 'Querétaro', state: 'Querétaro', lat: 20.5680, lng: -100.4150 },
    { name: 'Zibatá', city: 'Querétaro', state: 'Querétaro', lat: 20.7300, lng: -100.3960 },

    // ── Cancún ──
    { name: 'Zona Hotelera', city: 'Cancún', state: 'Quintana Roo', lat: 21.1310, lng: -86.7620 },
    { name: 'Centro', city: 'Cancún', state: 'Quintana Roo', lat: 21.1619, lng: -86.8515 },
    { name: 'Puerto Cancún', city: 'Cancún', state: 'Quintana Roo', lat: 21.1680, lng: -86.8170 },
    { name: 'Supermanzana 50', city: 'Cancún', state: 'Quintana Roo', lat: 21.1480, lng: -86.8420 },

    // ── León ──
    { name: 'Centro', city: 'León', state: 'Guanajuato', lat: 21.1220, lng: -101.6820 },
    { name: 'Zona Piel', city: 'León', state: 'Guanajuato', lat: 21.1100, lng: -101.6500 },
    { name: 'Gran Jardín', city: 'León', state: 'Guanajuato', lat: 21.1530, lng: -101.7020 },
    { name: 'La Martinica', city: 'León', state: 'Guanajuato', lat: 21.1400, lng: -101.6700 },

    // ── Chihuahua ──
    { name: 'Centro', city: 'Chihuahua', state: 'Chihuahua', lat: 28.6353, lng: -106.0889 },
    { name: 'San Felipe', city: 'Chihuahua', state: 'Chihuahua', lat: 28.6400, lng: -106.0750 },
    { name: 'Campestre', city: 'Chihuahua', state: 'Chihuahua', lat: 28.6150, lng: -106.0950 },
    { name: 'Quintas del Sol', city: 'Chihuahua', state: 'Chihuahua', lat: 28.6700, lng: -106.1300 },

    // ── Aguascalientes ──
    { name: 'Centro', city: 'Aguascalientes', state: 'Aguascalientes', lat: 21.8818, lng: -102.2916 },
    { name: 'Jardines de la Asunción', city: 'Aguascalientes', state: 'Aguascalientes', lat: 21.8980, lng: -102.2800 },
    { name: 'Pulgas Pandas', city: 'Aguascalientes', state: 'Aguascalientes', lat: 21.8700, lng: -102.3000 },

    // ── San Luis Potosí ──
    { name: 'Centro Histórico', city: 'San Luis Potosí', state: 'San Luis Potosí', lat: 22.1495, lng: -100.9737 },
    { name: 'Lomas', city: 'San Luis Potosí', state: 'San Luis Potosí', lat: 22.1600, lng: -100.9900 },
    { name: 'Industrial Aviación', city: 'San Luis Potosí', state: 'San Luis Potosí', lat: 22.1350, lng: -100.9600 },

    // ── Hermosillo ──
    { name: 'Centro', city: 'Hermosillo', state: 'Sonora', lat: 29.0729, lng: -110.9559 },
    { name: 'Pitic', city: 'Hermosillo', state: 'Sonora', lat: 29.0850, lng: -110.9700 },
    { name: 'Villa Satélite', city: 'Hermosillo', state: 'Sonora', lat: 29.0600, lng: -110.9400 },

    // ── Mexicali ──
    { name: 'Centro Cívico', city: 'Mexicali', state: 'Baja California', lat: 32.6510, lng: -115.4680 },
    { name: 'Nuevo Mexicali', city: 'Mexicali', state: 'Baja California', lat: 32.6300, lng: -115.4200 },
    { name: 'Calafia', city: 'Mexicali', state: 'Baja California', lat: 32.6400, lng: -115.4500 },

    // ── Saltillo ──
    { name: 'Centro', city: 'Saltillo', state: 'Coahuila', lat: 25.4209, lng: -100.9925 },
    { name: 'Valle Real', city: 'Saltillo', state: 'Coahuila', lat: 25.4050, lng: -101.0100 },

    // ── Torreón ──
    { name: 'Centro', city: 'Torreón', state: 'Coahuila', lat: 25.5428, lng: -103.4068 },
    { name: 'Las Quintas', city: 'Torreón', state: 'Coahuila', lat: 25.5200, lng: -103.4200 },

    // ── Culiacán ──
    { name: 'Centro', city: 'Culiacán', state: 'Sinaloa', lat: 24.7994, lng: -107.3939 },
    { name: 'Tres Ríos', city: 'Culiacán', state: 'Sinaloa', lat: 24.7880, lng: -107.4100 },

    // ── Morelia ──
    { name: 'Centro Histórico', city: 'Morelia', state: 'Michoacán', lat: 19.7026, lng: -101.1920 },
    { name: 'Tres Marías', city: 'Morelia', state: 'Michoacán', lat: 19.7150, lng: -101.2050 },

    // ── Veracruz ──
    { name: 'Centro', city: 'Veracruz', state: 'Veracruz', lat: 19.1738, lng: -96.1342 },
    { name: 'Boca del Río', city: 'Veracruz', state: 'Veracruz', lat: 19.1050, lng: -96.1070 },

    // ── Reynosa ──
    { name: 'Centro', city: 'Reynosa', state: 'Tamaulipas', lat: 26.0808, lng: -98.2883 },
    { name: 'Las Fuentes', city: 'Reynosa', state: 'Tamaulipas', lat: 26.0700, lng: -98.3000 },

    // ── Tampico ──
    { name: 'Centro', city: 'Tampico', state: 'Tamaulipas', lat: 22.2331, lng: -97.8611 },
    { name: 'Altamira', city: 'Tampico', state: 'Tamaulipas', lat: 22.3930, lng: -97.9430 },
  ];

  const zoneRecords: { id: string; name: string; city: string }[] = [];

  for (const z of zonesData) {
    const zone = await prisma.serviceZone.upsert({
      where: { name_city: { name: z.name, city: z.city } },
      update: { lat: z.lat, lng: z.lng, state: z.state },
      create: {
        name: z.name,
        city: z.city,
        state: z.state,
        country: 'MX',
        lat: z.lat,
        lng: z.lng,
      },
    });
    zoneRecords.push({ id: zone.id, name: zone.name, city: zone.city });
  }

  console.log(`✅ ${zoneRecords.length} service zones created`);

  // ── Assign zones to providers ──
  // All seed providers are in CDMX — assign 2-4 CDMX zones each
  const cdmxZones = zoneRecords.filter(z => z.city === 'Ciudad de México');
  const providerZoneAssignments: Record<string, string[]> = {
    'Carlos Mendoza': ['Centro Histórico', 'Cuauhtémoc', 'Juárez'],
    'Roberto Hernández': ['Roma Norte', 'Condesa', 'Juárez', 'Cuauhtémoc'],
    'María Guadalupe López': ['Roma Norte', 'Roma Sur', 'Condesa', 'Narvarte'],
    'José Antonio García': ['Polanco', 'Condesa', 'Escandón'],
    'Fernando Ruiz Ortega': ['Del Valle', 'Narvarte', 'Napoles', 'Escandón'],
    'Ricardo Torres Luna': ['Centro Histórico', 'Roma Norte', 'Juárez', 'Cuauhtémoc'],
    'Miguel Ángel Vásquez': ['Polanco', 'Santa Fe', 'Condesa'],
    'Luis Enrique Morales': ['Del Valle', 'Coyoacán', 'Tlalpan', 'Narvarte'],
    'Patricia Sánchez Romero': ['Roma Norte', 'Roma Sur', 'Del Valle', 'Condesa'],
    'Alejandro Díaz Herrera': ['Centro Histórico', 'Cuauhtémoc', 'Roma Norte', 'Juárez'],
    'Sofía Ramírez Guerrero': ['Polanco', 'Condesa', 'Escandón', 'Napoles'],
    'Eduardo Castillo Méndez': ['Coyoacán', 'Del Valle', 'Tlalpan', 'Xochimilco'],
  };

  // Clear existing assignments
  await prisma.providerServiceZone.deleteMany({});

  let zoneAssignCount = 0;
  for (const provider of providerRecords) {
    const zoneNames = providerZoneAssignments[provider.name] || ['Centro Histórico', 'Roma Norte'];
    for (const zoneName of zoneNames) {
      const zone = cdmxZones.find(z => z.name === zoneName);
      if (zone) {
        await prisma.providerServiceZone.create({
          data: {
            providerId: provider.profileId,
            zoneId: zone.id,
          },
        });
        zoneAssignCount++;
      }
    }
  }

  console.log(`✅ ${zoneAssignCount} provider-zone assignments created`);

  // ── Sample Customers ──
  const customers = [
    { phone: '+5215500000001', name: 'Ana Martínez' },
    { phone: '+5215500000002', name: 'Laura Gómez' },
    { phone: '+5215500000003', name: 'Diego Fernández' },
    { phone: '+5215500000004', name: 'Valentina Cruz' },
    { phone: '+5215500000005', name: 'Santiago Ríos' },
    { phone: '+5215500000006', name: 'Camila Herrera' },
    { phone: '+5215500000007', name: 'Mateo Vargas' },
    { phone: '+5215500000008', name: 'Isabella Moreno' },
  ];

  const customerRecords: { userId: string; name: string }[] = [];

  for (const c of customers) {
    const user = await prisma.user.upsert({
      where: { phone: c.phone },
      update: { name: c.name },
      create: {
        phone: c.phone,
        name: c.name,
        role: 'CUSTOMER',
        ratingAverage: 4.5 + Math.random() * 0.5,
        ratingCount: Math.floor(Math.random() * 10) + 1,
      },
    });
    customerRecords.push({ userId: user.id, name: c.name });
  }

  console.log(`✅ ${customers.length} sample customers created`);

  // ── Sample Ratings & Reviews ──
  // Create realistic reviews with varied ratings
  const reviewComments: { score: number; comments: string[] }[] = [
    {
      score: 5,
      comments: [
        'Excelente trabajo, muy profesional y puntual. 100% recomendado.',
        '¡Increíble servicio! Llegó a tiempo, hizo el trabajo rápido y dejó todo limpio.',
        'Mejor profesional que he contratado. Muy amable y su trabajo es impecable.',
        'Super recomendado. Resolvió mi problema en menos de una hora.',
        'Trabajo de primera calidad. Ya lo tengo guardado en mis contactos.',
        'Muy satisfecho con el resultado. Definitivamente lo volvería a contratar.',
      ],
    },
    {
      score: 4,
      comments: [
        'Buen trabajo en general. Llegó un poco tarde pero el resultado fue bueno.',
        'Muy profesional, buen precio. Solo tardó un poco más de lo esperado.',
        'Contento con el servicio. Buena comunicación y trabajo de calidad.',
        'Resolvió el problema correctamente. Buen trato y precio justo.',
        'Buen servicio, solo le faltó limpiar un poco al terminar.',
      ],
    },
    {
      score: 3,
      comments: [
        'El trabajo quedó bien, pero tardó más de lo que dijo.',
        'Servicio aceptable. Nada extraordinario pero cumplió.',
        'Regular. Tuvo que volver al día siguiente porque le faltó material.',
      ],
    },
    {
      score: 2,
      comments: [
        'Llegó 2 horas tarde y el trabajo no quedó como esperaba.',
        'No quedé muy satisfecho. Tuvo que venir a arreglar lo que hizo.',
      ],
    },
    {
      score: 1,
      comments: [
        'Mala experiencia. No recomiendo. Nunca volvería a contratar.',
      ],
    },
  ];

  // Distribution: 40% 5-stars, 30% 4-stars, 15% 3-stars, 10% 2-stars, 5% 1-star
  const ratingDistribution = [5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 3, 3, 3, 2, 2, 1];

  let reviewCount = 0;

  // Delete existing ratings first to avoid unique constraint issues
  await prisma.rating.deleteMany({});
  await prisma.booking.deleteMany({});

  for (const provider of providerRecords) {
    // Create 3-8 reviews per provider
    const numReviews = 3 + Math.floor(Math.random() * 6);

    for (let i = 0; i < numReviews; i++) {
      // Pick a random customer
      const customer = customerRecords[i % customerRecords.length];

      // Pick a realistic rating score
      const score = ratingDistribution[Math.floor(Math.random() * ratingDistribution.length)];

      // Pick a matching comment
      const scoreComments = reviewComments.find((r) => r.score === score)!.comments;
      const comment = scoreComments[Math.floor(Math.random() * scoreComments.length)];

      // Create a completed booking for this review
      const categorySlug = (providers.find(p => p.name === provider.name)?.serviceTypes[0]) || 'repair';
      const category = categories.find(c => c.slug === categorySlug) || categories[0];

      const daysAgo = Math.floor(Math.random() * 180) + 1; // Random date within last 6 months
      const bookingDate = new Date();
      bookingDate.setDate(bookingDate.getDate() - daysAgo);

      const booking = await prisma.booking.create({
        data: {
          customerId: customer.userId,
          providerId: provider.profileId,
          categoryId: category.id,
          status: 'RATED',
          description: 'Servicio completado',
          address: 'Col. Roma Norte, CDMX',
          completedAt: bookingDate,
          createdAt: bookingDate,
        },
      });

      await prisma.rating.create({
        data: {
          bookingId: booking.id,
          fromUserId: customer.userId,
          toUserId: provider.userId,
          score,
          comment: Math.random() > 0.15 ? comment : null, // 15% of reviews have no comment
          createdAt: bookingDate,
        },
      });

      reviewCount++;
    }
  }

  console.log(`✅ ${reviewCount} reviews created with realistic distribution`);
  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
