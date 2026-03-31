import { PrismaClient } from '@prisma/client';

/**
 * ─── Handy Demo Seed ────────────────────────────────────────
 * Creates realistic data for Zoom demos.
 * Run: npx ts-node prisma/seed-demo.ts
 */

const prisma = new PrismaClient();

// ─── Realistic CDMX addresses ────────────────────────────────
const CDMX_ADDRESSES = [
  'Av. Álvaro Obregón 286, Col. Roma Norte, Cuauhtémoc, CDMX',
  'Calle Orizaba 150, Col. Roma Norte, Cuauhtémoc, CDMX',
  'Av. Insurgentes Sur 3500, Col. Peña Pobre, Tlalpan, CDMX',
  'Calle Tonalá 49, Col. Roma Norte, Cuauhtémoc, CDMX',
  'Av. Presidente Masaryk 360, Col. Polanco, Miguel Hidalgo, CDMX',
  'Calle Durango 241, Col. Roma Norte, Cuauhtémoc, CDMX',
  'Av. Revolución 1387, Col. Campestre, Álvaro Obregón, CDMX',
  'Calle Amsterdam 25, Col. Condesa, Cuauhtémoc, CDMX',
  'Av. Patriotismo 800, Col. Mixcoac, Benito Juárez, CDMX',
  'Calle Mazatlán 138, Col. Condesa, Cuauhtémoc, CDMX',
  'Av. Coyoacán 1536, Col. Del Valle Centro, Benito Juárez, CDMX',
  'Calle Tamaulipas 55, Col. Condesa, Cuauhtémoc, CDMX',
  'Av. Universidad 1851, Col. Oxtopulco, Coyoacán, CDMX',
  'Calle Puebla 285, Col. Roma Norte, Cuauhtémoc, CDMX',
  'Av. Juárez 76, Centro Histórico, Cuauhtémoc, CDMX',
  'Calle Colima 267, Col. Roma Norte, Cuauhtémoc, CDMX',
  'Av. Reforma 505, Col. Cuauhtémoc, Cuauhtémoc, CDMX',
  'Calle Frontera 140, Col. Roma Norte, Cuauhtémoc, CDMX',
  'Av. Sonora 180, Col. Hipódromo, Cuauhtémoc, CDMX',
  'Calle Veracruz 87, Col. Condesa, Cuauhtémoc, CDMX',
];

// ─── Booking descriptions ─────────────────────────────────────
const BOOKING_DESCRIPTIONS: Record<string, string[]> = {
  plumbing: [
    'Se rompió la tubería del baño y hay una fuga de agua bastante fuerte.',
    'El lavabo de la cocina está tapado, el agua no drena desde hace 2 días.',
    'Necesito instalar un calentador de agua nuevo. Tengo el equipo, necesito la mano de obra.',
    'Fuga de agua en la llave de la regadera, gotea constantemente.',
    'El WC no deja de correr agua. Creo que es la válvula interna.',
    'Quiero remodelar mi baño completo, necesito cotización de plomería.',
    'Instalación de filtro de agua para toda la casa.',
    'Se atascó el drenaje del patio y huele muy mal.',
  ],
  electrical: [
    'Se fue la luz en todo el departamento, creo que se botó un pastilla del breaker.',
    'Necesito instalar 4 contactos nuevos en la sala y el comedor.',
    'Las luces del baño parpadean, creo que hay un corto circuito.',
    'Quiero instalar iluminación LED en toda la cocina.',
    'El ventilador de techo no enciende, creo que es un problema del cableado.',
    'Necesito actualizar el tablero eléctrico del departamento, es muy viejo.',
    'Instalación de timbre eléctrico con cámara.',
    'Cortocircuito en la recámara principal, no funciona ningún enchufe.',
  ],
  cleaning: [
    'Limpieza profunda del departamento (2 recámaras, 1 baño). Es post-mudanza.',
    'Limpieza de oficina de 80m², 3 veces por semana. Busco servicio recurrente.',
    'Limpieza después de una fiesta. Departamento de 3 recámaras.',
    'Quiero limpieza profunda con lavado de alfombras y tapetes.',
    'Limpieza de terraza y ventanales en un piso 8.',
    'Desinfección completa del departamento. Recién me recuperé de una enfermedad.',
    'Limpieza pre-entrega del departamento. Me mudo el sábado.',
    'Limpieza profunda de cocina: campana, horno, refrigerador por dentro.',
  ],
  gardening: [
    'Necesito mantenimiento del jardín: poda de setos, corte de pasto y riego.',
    'Quiero diseñar una terraza con plantas en macetas para un departamento.',
    'Control de plagas en mis plantas de interior. Tienen una plaga blanca.',
    'Instalación de sistema de riego por goteo en jardín de 30m².',
    'Poda de 2 árboles grandes en el jardín. Necesitan ser recortados urgente.',
    'Quiero crear un huerto urbano en mi azotea.',
    'Mantenimiento mensual de jardín comunitario en un condominio.',
    'Trasplante de 6 plantas grandes que necesito cambiar de maceta.',
  ],
  painting: [
    'Pintar 2 recámaras y la sala (aprox 60m²). Tengo la pintura.',
    'Necesito impermeabilizar la azotea. Tiene varias filtraciones.',
    'Pintura exterior de la fachada de la casa (2 niveles).',
    'Quiero un mural decorativo en la recámara de mi hija.',
    'Pintar el interior del departamento completo. Son 85m².',
    'Restaurar y pintar un mueble de madera antiguo.',
    'Aplicar textura decorativa en la pared de la sala.',
    'Pintar y renovar la herrería del balcón.',
  ],
  locksmith: [
    'Me quedé fuera de mi departamento. Necesito que abran la puerta urgente.',
    'Quiero cambiar todas las cerraduras del departamento por unas de seguridad.',
    'Perdí las llaves del carro y necesito un duplicado.',
    'Instalar cerradura inteligente en la puerta principal.',
    'La cerradura de la puerta de vidrio está trabada, no abre con llave.',
    'Necesito copias de llaves de seguridad (las que dicen "no duplicar").',
  ],
  repair: [
    'La puerta del baño no cierra bien, necesita ajuste.',
    'Se rompió una bisagra del closet y la puerta está caída.',
    'Necesito armar e instalar 3 muebles de IKEA.',
    'El piso laminado se está levantando en varias partes.',
    'Reparar un marco de ventana de aluminio que está flojo.',
    'Instalar repisas y organizadores en la recámara.',
    'Se rompió una perilla y necesito cambiarla.',
    'Arreglar el rodamiento de una puerta corrediza.',
  ],
  moving: [
    'Mudanza de departamento a departamento (mismo edificio, diferente piso).',
    'Mudanza de una casa de 3 recámaras a un departamento en la Condesa.',
    'Solo necesito mover un refrigerador y una lavadora al tercer piso sin elevador.',
    'Mudanza completa: embalaje, transporte y desembalaje.',
    'Mover una sala (3 piezas) y un comedor del almacén a mi nuevo depto.',
    'Mudanza de oficina: 8 escritorios, sillas y equipo de cómputo.',
  ],
};

// ─── Review comments (extended and more varied) ────────────
const REVIEW_POOL: { score: number; comments: string[] }[] = [
  {
    score: 5,
    comments: [
      'Excelente trabajo, muy profesional y puntual. 100% recomendado.',
      '¡Increíble servicio! Llegó a tiempo, hizo el trabajo rápido y dejó todo limpio.',
      'Mejor profesional que he contratado. Muy amable y su trabajo es impecable.',
      'Super recomendado. Resolvió mi problema en menos de una hora.',
      'Trabajo de primera calidad. Ya lo tengo guardado en mis contactos.',
      'Muy satisfecho con el resultado. Definitivamente lo volvería a contratar.',
      'El precio fue muy justo para la calidad del trabajo. Excelente.',
      'De los mejores en su ramo. Sabe lo que hace y lo demuestra.',
      'Desde que lo contraté la primera vez, ya no busco a nadie más. Es el mejor.',
      'Me dio garantía de su trabajo. Muy profesional, totalmente recomendado.',
      'Llegó incluso antes de la hora. Trabajo impecable, 10/10.',
      'La verdad superó mis expectativas. Trabajo limpio y rápido.',
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
      'Hizo lo que necesitaba. Buena calidad aunque no la más rápida.',
      'Recomendable. El acabado quedó bien y el precio fue razonable.',
      'Trabajo bien hecho. La única queja es que no traía todas las herramientas.',
    ],
  },
  {
    score: 3,
    comments: [
      'El trabajo quedó bien, pero tardó más de lo que dijo.',
      'Servicio aceptable. Nada extraordinario pero cumplió.',
      'Regular. Tuvo que volver al día siguiente porque le faltó material.',
      'Cumplió pero no superó las expectativas. El precio estuvo bien.',
      'A medias. Hizo parte del trabajo bien pero otra parte quedó floja.',
    ],
  },
  {
    score: 2,
    comments: [
      'Llegó 2 horas tarde y el trabajo no quedó como esperaba.',
      'No quedé muy satisfecho. Tuvo que venir a arreglar lo que hizo.',
      'Dijo que terminaba en 2 horas y tardó 5. No recomiendo.',
    ],
  },
  {
    score: 1,
    comments: [
      'Mala experiencia. No recomiendo. Nunca volvería a contratar.',
      'Canceló sin avisar 3 veces antes de venir. Pésimo.',
    ],
  },
];

// Rating distribution: realistic, weighted toward good ratings
const RATING_DISTRIBUTION = [5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 3, 3, 3, 2, 2, 1];

// ─── Chat messages for demo ─────────────────────────────────
const DEMO_CHAT_MESSAGES = [
  { sender: 'CUSTOMER', content: 'Hola, ¿puede venir hoy en la tarde?' },
  { sender: 'PROVIDER', content: 'Claro, ¿le funciona a las 3pm?', channel: 'WHATSAPP' },
  { sender: 'CUSTOMER', content: 'Perfecto, le mando la dirección exacta' },
  { sender: 'CUSTOMER', content: 'Es en la Roma Norte, Orizaba 150, depto 302' },
  { sender: 'PROVIDER', content: 'Listo, ahí nos vemos. ¿Tiene estacionamiento?', channel: 'WHATSAPP' },
  { sender: 'CUSTOMER', content: 'Sí, puede estacionarse en la calle sin problema' },
  { sender: 'PROVIDER', content: '👍 Ya voy en camino', channel: 'WHATSAPP' },
  { sender: 'CUSTOMER', content: '¡Gracias! Lo espero' },
];

async function main() {
  console.log('🌱 Seeding demo database...');
  console.log('');

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

  console.log(`✅ ${categories.length} categorías de servicio`);

  // ── Provider Users + Profiles ──
  // Using randomuser.me-style photos and professional-looking avatars
  const providers = [
    {
      name: 'Carlos Mendoza Pérez',
      phone: '+5215512345001',
      avatarUrl: 'https://api.dicebear.com/9.x/lorelei/svg?seed=carlos&backgroundColor=6366f1',
      bio: 'Plomero profesional con 15 años de experiencia. Especialista en reparación de tuberías, destape de drenaje y mantenimiento de cisternas. Certificado por CONAGUA. Atención a domicilio en toda la CDMX.',
      serviceTypes: ['plumbing'],
      ratingAvg: 4.8,
      ratingCount: 47,
      totalJobs: 52,
      verified: true,
      lat: 19.4168,
      lng: -99.1565,
    },
    {
      name: 'Roberto Hernández García',
      phone: '+5215512345002',
      avatarUrl: 'https://api.dicebear.com/9.x/lorelei/svg?seed=roberto&backgroundColor=4f46e5',
      bio: 'Electricista certificado con más de 20 años de experiencia. Instalaciones residenciales y comerciales, reparación de cortos circuitos y modernización de tableros eléctricos. Miembro del Colegio de Ingenieros Electricistas.',
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
      avatarUrl: 'https://api.dicebear.com/9.x/lorelei/svg?seed=maria&backgroundColor=a855f7',
      bio: 'Servicio de limpieza profesional para hogares y oficinas. Cuento con equipo propio y productos ecológicos certificados. Limpieza profunda, regular y post-construcción. Más de 100 hogares satisfechos.',
      serviceTypes: ['cleaning'],
      ratingAvg: 4.7,
      ratingCount: 89,
      totalJobs: 102,
      verified: true,
      lat: 19.4195,
      lng: -99.1526,
    },
    {
      name: 'José Antonio García Luna',
      phone: '+5215512345004',
      avatarUrl: 'https://api.dicebear.com/9.x/lorelei/svg?seed=jose&backgroundColor=22c55e',
      bio: 'Jardinero con pasión por las plantas. Diseño de jardines, mantenimiento de áreas verdes, sistemas de riego y poda profesional. Graduado del INIFAP en agroecología. Creo que todo hogar merece un espacio verde.',
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
      avatarUrl: 'https://api.dicebear.com/9.x/lorelei/svg?seed=fernando&backgroundColor=f59e0b',
      bio: 'Pintor profesional con 12 años de experiencia. Interiores, exteriores, impermeabilización y acabados decorativos. Uso pintura Comex y Berel de la mejor calidad. Trabajo limpio y garantizado.',
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
      avatarUrl: 'https://api.dicebear.com/9.x/lorelei/svg?seed=ricardo&backgroundColor=ef4444',
      bio: 'Cerrajero disponible 24/7. Apertura de puertas, autos y cajas fuertes. Cambio de chapas y cerraduras de seguridad. Servicio de emergencia en menos de 30 minutos en la zona Roma-Condesa.',
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
      avatarUrl: 'https://api.dicebear.com/9.x/lorelei/svg?seed=miguel&backgroundColor=0ea5e9',
      bio: 'Todólogo del hogar con 18 años de experiencia. Plomería, electricidad, carpintería y reparaciones en general. ¡Si algo se descompone, yo lo arreglo! Llevo mi propia herramienta y materiales básicos.',
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
      avatarUrl: 'https://api.dicebear.com/9.x/lorelei/svg?seed=luis&backgroundColor=8b5cf6',
      bio: 'Servicio de mudanzas con camioneta propia (3.5 toneladas). Embalaje profesional, transporte seguro y montaje/desmontaje de muebles. Experiencia en mudanzas delicadas: pianos, obras de arte y equipos frágiles.',
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
      avatarUrl: 'https://api.dicebear.com/9.x/lorelei/svg?seed=patricia&backgroundColor=ec4899',
      bio: 'Especialista en limpieza profunda y desinfección con certificación en protocolos sanitarios. Experiencia en limpieza post-construcción, post-mudanza y mantenimiento de oficinas corporativas. Mi equipo y yo garantizamos resultados.',
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
      avatarUrl: 'https://api.dicebear.com/9.x/lorelei/svg?seed=alejandro&backgroundColor=14b8a6',
      bio: 'Electricista y plomero con doble certificación. Dos oficios en una sola visita: ahorra tiempo y dinero. Instalaciones nuevas, reparaciones y remodelaciones. Más de 400 trabajos completados con éxito.',
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
      avatarUrl: 'https://api.dicebear.com/9.x/lorelei/svg?seed=sofia&backgroundColor=f97316',
      bio: 'Pintora artística y decorativa. Murales personalizados, acabados texturizados, técnicas venecianas y restauración de superficies. Dale vida y personalidad a tus espacios. Portfolio disponible en Instagram.',
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
      avatarUrl: 'https://api.dicebear.com/9.x/lorelei/svg?seed=eduardo&backgroundColor=84cc16',
      bio: 'Jardinero profesional y paisajista con formación en diseño de exteriores. Mantenimiento de jardines, diseño de terrazas verdes, huertos urbanos y control de plagas orgánico. Tu jardín es mi obra de arte.',
      serviceTypes: ['gardening'],
      ratingAvg: 4.5,
      ratingCount: 26,
      totalJobs: 30,
      verified: true,
      lat: 19.438,
      lng: -99.149,
    },
  ];

  const providerRecords: {
    userId: string;
    profileId: string;
    name: string;
    serviceTypes: string[];
  }[] = [];

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

    providerRecords.push({
      userId: user.id,
      profileId: profile.id,
      name: p.name,
      serviceTypes: p.serviceTypes,
    });
  }

  console.log(`✅ ${providers.length} proveedores con perfiles`);

  // ── Sample Customers ──
  const customers = [
    { phone: '+5215500000001', name: 'Ana Martínez García' },
    { phone: '+5215500000002', name: 'Laura Gómez Herrera' },
    { phone: '+5215500000003', name: 'Diego Fernández López' },
    { phone: '+5215500000004', name: 'Valentina Cruz Moreno' },
    { phone: '+5215500000005', name: 'Santiago Ríos Delgado' },
    { phone: '+5215500000006', name: 'Camila Herrera Vega' },
    { phone: '+5215500000007', name: 'Mateo Vargas Ramos' },
    { phone: '+5215500000008', name: 'Isabella Moreno Soto' },
    { phone: '+5215500000009', name: 'Daniel Rojas Medina' },
    { phone: '+5215500000010', name: 'Gabriela Flores Jiménez' },
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
        avatarUrl: `https://api.dicebear.com/9.x/lorelei/svg?seed=${c.name.split(' ')[0].toLowerCase()}-customer`,
        ratingAverage: 4.5 + Math.random() * 0.5,
        ratingCount: Math.floor(Math.random() * 10) + 1,
      },
    });
    customerRecords.push({ userId: user.id, name: c.name });
  }

  console.log(`✅ ${customers.length} clientes demo`);

  // ── Clean existing demo data ──
  await prisma.message.deleteMany({});
  await prisma.rating.deleteMany({});
  await prisma.booking.deleteMany({});

  // ── Create bookings with reviews and chat messages ──
  const categoryMap = new Map(categories.map((c) => [c.slug, c]));

  let bookingCount = 0;
  let reviewCount = 0;
  let messageCount = 0;

  for (const provider of providerRecords) {
    // Create 4-8 completed bookings with reviews per provider
    const numBookings = 4 + Math.floor(Math.random() * 5);

    for (let i = 0; i < numBookings; i++) {
      const customer = customerRecords[i % customerRecords.length];
      const score = RATING_DISTRIBUTION[Math.floor(Math.random() * RATING_DISTRIBUTION.length)];
      const scoreComments = REVIEW_POOL.find((r) => r.score === score)!.comments;
      const comment = scoreComments[Math.floor(Math.random() * scoreComments.length)];
      const categorySlug = provider.serviceTypes[0];
      const category = categoryMap.get(categorySlug) || categories[0];
      const address = CDMX_ADDRESSES[Math.floor(Math.random() * CDMX_ADDRESSES.length)];
      const descriptions = BOOKING_DESCRIPTIONS[categorySlug] || BOOKING_DESCRIPTIONS['repair'];
      const description = descriptions[Math.floor(Math.random() * descriptions.length)];

      const daysAgo = Math.floor(Math.random() * 180) + 1;
      const bookingDate = new Date();
      bookingDate.setDate(bookingDate.getDate() - daysAgo);

      const booking = await prisma.booking.create({
        data: {
          customerId: customer.userId,
          providerId: provider.profileId,
          categoryId: category.id,
          status: 'RATED',
          description,
          address,
          locationLat: 19.4168 + (Math.random() - 0.5) * 0.04,
          locationLng: -99.1565 + (Math.random() - 0.5) * 0.04,
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
          comment: Math.random() > 0.1 ? comment : null,
          createdAt: bookingDate,
        },
      });

      bookingCount++;
      reviewCount++;
    }
  }

  console.log(`✅ ${bookingCount} bookings completados con ${reviewCount} reviews`);

  // ── Create some "active" bookings for the demo ──
  // These will show as current bookings when demoing
  const activeStatuses: ('PENDING' | 'ACCEPTED' | 'PROVIDER_ARRIVING' | 'IN_PROGRESS')[] = [
    'ACCEPTED',
    'PROVIDER_ARRIVING',
    'IN_PROGRESS',
    'PENDING',
  ];

  // Create 4 active bookings with different statuses
  for (let i = 0; i < 4; i++) {
    const customer = customerRecords[0]; // Use first customer for demo
    const provider = providerRecords[i % providerRecords.length];
    const categorySlug = provider.serviceTypes[0];
    const category = categoryMap.get(categorySlug) || categories[0];
    const address = CDMX_ADDRESSES[i];
    const descriptions = BOOKING_DESCRIPTIONS[categorySlug] || BOOKING_DESCRIPTIONS['repair'];
    const description = descriptions[Math.floor(Math.random() * descriptions.length)];
    const status = activeStatuses[i];

    const hoursAgo = 1 + Math.floor(Math.random() * 24);
    const bookingDate = new Date();
    bookingDate.setHours(bookingDate.getHours() - hoursAgo);

    const booking = await prisma.booking.create({
      data: {
        customerId: customer.userId,
        providerId: provider.profileId,
        categoryId: category.id,
        status,
        description,
        address,
        locationLat: 19.4168 + (Math.random() - 0.5) * 0.02,
        locationLng: -99.1565 + (Math.random() - 0.5) * 0.02,
        createdAt: bookingDate,
      },
    });

    // Add sample chat messages to the IN_PROGRESS booking
    if (status === 'IN_PROGRESS' || status === 'ACCEPTED') {
      const baseTime = new Date(bookingDate);
      for (let m = 0; m < DEMO_CHAT_MESSAGES.length; m++) {
        const msg = DEMO_CHAT_MESSAGES[m];
        baseTime.setMinutes(baseTime.getMinutes() + 2 + Math.floor(Math.random() * 5));
        await prisma.message.create({
          data: {
            bookingId: booking.id,
            senderId: msg.sender === 'CUSTOMER' ? customer.userId : provider.userId,
            senderType: msg.sender as 'CUSTOMER' | 'PROVIDER',
            content: msg.content,
            channel: msg.channel === 'WHATSAPP' ? 'WHATSAPP' : 'APP',
            createdAt: new Date(baseTime),
          },
        });
        messageCount++;
      }
    }

    bookingCount++;
  }

  console.log(`✅ 4 bookings activos para demo`);
  console.log(`✅ ${messageCount} mensajes de chat de demo`);

  // ── Summary ──
  console.log('');
  console.log('🎉 ¡Seed de demo completado!');
  console.log('');
  console.log('📱 Para probar la app:');
  console.log('   → Login como cliente: +5215500000001 (Ana Martínez)');
  console.log('   → Tiene 4 bookings activos y múltiples completados');
  console.log('');
  console.log('📞 Proveedores demo (para WhatsApp):');
  for (const p of providers.slice(0, 3)) {
    console.log(`   → ${p.name}: ${p.phone}`);
  }
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

