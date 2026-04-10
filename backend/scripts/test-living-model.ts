/**
 * Test script for the Provider Living Model.
 * Seeds realistic data for one provider, computes the model,
 * and prints the exact prompt section the LLM would receive.
 *
 * Usage: npx ts-node scripts/test-living-model.ts
 */
import { PrismaClient, PaymentMethod } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_PROVIDER_PHONE = '+5215512345001'; // Carlos Mendoza

async function main() {
  const user = await prisma.user.findUnique({
    where: { phone: TEST_PROVIDER_PHONE },
    include: { providerProfile: true },
  });

  if (!user?.providerProfile) {
    console.error('Test provider not found');
    return;
  }

  const providerId = user.providerProfile.id;
  console.log(`\n=== Seeding test data for ${user.name} (${providerId}) ===\n`);

  // Clean previous test data
  await prisma.income.deleteMany({ where: { providerId } });
  await prisma.expense.deleteMany({ where: { providerId } });
  await prisma.appointment.deleteMany({ where: { providerId } });

  const now = new Date();
  const cdmxOffset = -6 * 60 * 60 * 1000;

  function daysAgo(n: number, hour = 10): Date {
    const d = new Date(now.getTime() + cdmxOffset);
    d.setDate(d.getDate() - n);
    d.setHours(hour, 0, 0, 0);
    return new Date(d.getTime() - cdmxOffset);
  }

  function daysFromNow(n: number, hour = 10): Date {
    const d = new Date(now.getTime() + cdmxOffset);
    d.setDate(d.getDate() + n);
    d.setHours(hour, 0, 0, 0);
    return new Date(d.getTime() - cdmxOffset);
  }

  // --- Seed Incomes (last 30 days) ---
  const incomes = [
    { amount: 1200, desc: 'Reparación de fuga', client: 'Sr. Ramírez', method: PaymentMethod.CASH, daysAgo: 2, day: 5 },
    { amount: 800, desc: 'Revisión de tubería', client: 'Sra. López', method: PaymentMethod.CASH, daysAgo: 3, day: 4 },
    { amount: 1500, desc: 'Instalación de calentador', client: 'Sr. Ramírez', method: PaymentMethod.TRANSFER, daysAgo: 5, day: 5 },
    { amount: 600, desc: 'Destape de caño', client: 'Don Pedro', method: PaymentMethod.CASH, daysAgo: 7, day: 3 },
    { amount: 2000, desc: 'Instalación completa baño', client: 'Sra. López', method: PaymentMethod.TRANSFER, daysAgo: 8, day: 4 },
    { amount: 900, desc: 'Reparación de llave', client: 'Ing. Martínez', method: PaymentMethod.CASH, daysAgo: 10, day: 5 },
    { amount: 1100, desc: 'Cambio de válvula', client: 'Sr. Ramírez', method: PaymentMethod.CASH, daysAgo: 12, day: 5 },
    { amount: 750, desc: 'Revisión general', client: 'Sra. García', method: PaymentMethod.CASH, daysAgo: 14, day: 1 },
    { amount: 1800, desc: 'Instalación tinaco', client: 'Don Pedro', method: PaymentMethod.CASH, daysAgo: 16, day: 3 },
    { amount: 500, desc: 'Destape', client: 'Sra. López', method: PaymentMethod.CASH, daysAgo: 18, day: 4 },
    { amount: 1300, desc: 'Fuga en cocina', client: 'Ing. Martínez', method: PaymentMethod.TRANSFER, daysAgo: 20, day: 5 },
    { amount: 950, desc: 'Reparación regadera', client: 'Sra. García', method: PaymentMethod.CASH, daysAgo: 22, day: 1 },
    { amount: 1600, desc: 'Cambio de tubería', client: 'Sr. Ramírez', method: PaymentMethod.CASH, daysAgo: 25, day: 5 },
    { amount: 700, desc: 'Revisión', client: 'Don Pedro', method: PaymentMethod.CASH, daysAgo: 28, day: 1 },
  ];

  for (const inc of incomes) {
    await prisma.income.create({
      data: {
        providerId,
        amount: inc.amount,
        description: inc.desc,
        clientName: inc.client,
        paymentMethod: inc.method,
        date: daysAgo(inc.daysAgo),
      },
    });
  }
  console.log(`✅ Seeded ${incomes.length} incomes`);

  // --- Seed Expenses ---
  const expenses = [
    { amount: 350, cat: 'Material', desc: 'Tubería PVC', daysAgo: 3 },
    { amount: 200, cat: 'Transporte', desc: 'Gasolina', daysAgo: 5 },
    { amount: 150, cat: 'Herramienta', desc: 'Llave stilson', daysAgo: 10 },
    { amount: 500, cat: 'Material', desc: 'Calentador refacciones', daysAgo: 12 },
    { amount: 180, cat: 'Transporte', desc: 'Gasolina', daysAgo: 15 },
    { amount: 300, cat: 'Material', desc: 'Conexiones y codos', daysAgo: 20 },
  ];

  for (const exp of expenses) {
    await prisma.expense.create({
      data: {
        providerId,
        amount: exp.amount,
        category: exp.cat,
        description: exp.desc,
        date: daysAgo(exp.daysAgo),
      },
    });
  }
  console.log(`✅ Seeded ${expenses.length} expenses`);

  // --- Seed Appointments ---
  const appointments = [
    { client: 'Sr. Ramírez', desc: 'Revisar fuga cocina', daysFromNow: 1, hour: 10 },
    { client: 'Sra. López', desc: 'Instalación lavabo', daysFromNow: 2, hour: 14 },
    { client: 'Ing. Martínez', desc: 'Cotización remodelación', daysFromNow: 4, hour: 9 },
    { client: 'Don Pedro', desc: 'Mantenimiento tinaco', daysFromNow: 8, hour: 11 },
  ];

  for (const apt of appointments) {
    await prisma.appointment.create({
      data: {
        providerId,
        clientName: apt.client,
        description: apt.desc,
        scheduledAt: daysFromNow(apt.daysFromNow, apt.hour),
        status: 'PENDING',
      },
    });
  }
  console.log(`✅ Seeded ${appointments.length} appointments`);

  // --- Seed Learned Facts ---
  await prisma.workspaceProfile.upsert({
    where: { providerId },
    create: {
      providerId,
      services: [
        { name: 'Plomería general', price: 800, unit: 'visita' },
        { name: 'Instalación de calentador', price: 1500, unit: 'visita' },
      ],
      schedule: {
        days: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'],
        timeStart: '08:00',
        timeEnd: '17:00',
      },
      learnedFacts: [
        'Tiene una camioneta Ford blanca modelo 2018',
        'Su ayudante se llama Luis, trabaja con él los lunes y jueves',
        'Trabaja principalmente en la zona poniente de Juárez',
        'Prefiere cobrar en efectivo, acepta transferencia solo con clientes recurrentes',
        'Compra material en Ferretería La Barata cerca de su casa',
      ],
    },
    update: {
      services: [
        { name: 'Plomería general', price: 800, unit: 'visita' },
        { name: 'Instalación de calentador', price: 1500, unit: 'visita' },
      ],
      schedule: {
        days: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'],
        timeStart: '08:00',
        timeEnd: '17:00',
      },
      learnedFacts: [
        'Tiene una camioneta Ford blanca modelo 2018',
        'Su ayudante se llama Luis, trabaja con él los lunes y jueves',
        'Trabaja principalmente en la zona poniente de Juárez',
        'Prefiere cobrar en efectivo, acepta transferencia solo con clientes recurrentes',
        'Compra material en Ferretería La Barata cerca de su casa',
      ],
    },
  });
  console.log('✅ Seeded workspace profile + learned facts');

  // === Now compute the Provider Model ===
  console.log('\n=== Computing Provider Model ===\n');

  // Reproduce the service logic inline (since we can't easily boot NestJS here)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const allIncomes = await prisma.income.findMany({
    where: { providerId, date: { gte: thirtyDaysAgo } },
    select: { amount: true, date: true, clientName: true },
  });

  const allExpenses = await prisma.expense.findMany({
    where: { providerId, date: { gte: monthStart } },
    select: { amount: true },
  });

  const allAppointments = await prisma.appointment.findMany({
    where: { providerId },
    select: { scheduledAt: true, status: true, clientName: true },
  });

  const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  // Financial
  let thisWeek = 0, lastWeek = 0, thisMonth = 0;
  const dayTotals = new Map<number, number>();
  const clientMap = new Map<string, { jobs: number; total: number }>();

  for (const inc of allIncomes) {
    const amt = Number(inc.amount);
    const d = new Date(inc.date);
    const dow = d.getDay();
    dayTotals.set(dow, (dayTotals.get(dow) || 0) + amt);
    if (d >= weekStart) thisWeek += amt;
    else if (d >= lastWeekStart) lastWeek += amt;
    if (d >= monthStart) thisMonth += amt;

    if (inc.clientName) {
      const name = inc.clientName.trim();
      const ex = clientMap.get(name) || { jobs: 0, total: 0 };
      ex.jobs++;
      ex.total += amt;
      clientMap.set(name, ex);
    }
  }

  const total30d = allIncomes.reduce((s, i) => s + Number(i.amount), 0);
  const avgWeekly = Math.round(total30d / (30 / 7));
  const avgTicket = Math.round(total30d / allIncomes.length);
  const expenseTotal = allExpenses.reduce((s, e) => s + Number(e.amount), 0);

  let bestDay = '';
  let bestDayAmt = 0;
  for (const [day, total] of dayTotals) {
    if (total > bestDayAmt) { bestDayAmt = total; bestDay = DAY_NAMES[day]; }
  }

  const topClients = Array.from(clientMap.entries())
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.jobs - a.jobs);

  const uniqueClients = clientMap.size;
  const repeatClients = Array.from(clientMap.values()).filter(c => c.jobs > 1).length;

  console.log('--- FINANCIAL ---');
  console.log(`Ingreso semanal promedio: $${avgWeekly.toLocaleString()}`);
  console.log(`Ticket promedio: $${avgTicket.toLocaleString()}`);
  console.log(`Mejor día: ${bestDay}`);
  console.log(`Esta semana: $${thisWeek.toLocaleString()}`);
  console.log(`Semana pasada: $${lastWeek.toLocaleString()}`);
  console.log(`Este mes ingresos: $${thisMonth.toLocaleString()}`);
  console.log(`Este mes gastos: $${expenseTotal.toLocaleString()}`);
  console.log(`Neto: $${(thisMonth - expenseTotal).toLocaleString()}`);

  console.log('\n--- CLIENTS ---');
  for (const c of topClients) {
    console.log(`  ${c.name}: ${c.jobs} trabajos, $${c.total.toLocaleString()}`);
  }
  console.log(`Únicos (30d): ${uniqueClients}, Repiten: ${repeatClients} (${Math.round(repeatClients / uniqueClients * 100)}%)`);

  console.log('\n--- SCHEDULE ---');
  const upcomingApts = allAppointments.filter(a => new Date(a.scheduledAt) > now);
  console.log(`Citas futuras: ${upcomingApts.length}`);
  for (const a of upcomingApts) {
    console.log(`  ${a.clientName} — ${new Date(a.scheduledAt).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`);
  }

  // === Print the EXACT prompt section ===
  console.log('\n\n========================================');
  console.log('PROMPT SECTION (what the LLM would see):');
  console.log('========================================\n');

  const promptLines: string[] = [];

  promptLines.push('## Perfil de trabajo del proveedor actual');
  promptLines.push('- Servicios: Plomería general: $800 por visita, Instalación de calentador: $1500 por visita');
  promptLines.push('- Disponibilidad: lunes, martes, miércoles, jueves, viernes, 08:00 - 17:00');

  promptLines.push('');
  promptLines.push('## Patrones de negocio (calculados de sus datos)');
  promptLines.push(`- Ingreso semanal promedio: $${avgWeekly.toLocaleString()}`);
  promptLines.push(`- Ticket promedio por trabajo: $${avgTicket.toLocaleString()}`);
  promptLines.push(`- Mejor día (más ingresos): ${bestDay}`);
  if (thisWeek > 0 || lastWeek > 0) {
    promptLines.push(`- Esta semana: $${thisWeek.toLocaleString()} (semana pasada: $${lastWeek.toLocaleString()})`);
  }
  if (thisMonth > 0 || expenseTotal > 0) {
    promptLines.push(`- Balance del mes: $${thisMonth.toLocaleString()} ingresos - $${expenseTotal.toLocaleString()} gastos = $${(thisMonth - expenseTotal).toLocaleString()} neto`);
  }
  if (topClients.length > 0) {
    const cl = topClients.map(c => `${c.name} (${c.jobs} trabajos, $${c.total.toLocaleString()})`).join(', ');
    promptLines.push(`- Clientes frecuentes (30 días): ${cl}`);
  }
  if (uniqueClients > 2) {
    promptLines.push(`- Tasa de clientes que repiten: ${Math.round(repeatClients / uniqueClients * 100)}%`);
  }
  promptLines.push(`- Citas esta semana: ${upcomingApts.filter(a => new Date(a.scheduledAt) < new Date(weekStart.getTime() + 7*24*60*60*1000)).length}`);

  promptLines.push('');
  promptLines.push('## Lo que sabes de este proveedor');
  promptLines.push('Datos aprendidos de conversaciones anteriores. Úsalos para personalizar tus respuestas:');
  promptLines.push('- Tiene una camioneta Ford blanca modelo 2018');
  promptLines.push('- Su ayudante se llama Luis, trabaja con él los lunes y jueves');
  promptLines.push('- Trabaja principalmente en la zona poniente de Juárez');
  promptLines.push('- Prefiere cobrar en efectivo, acepta transferencia solo con clientes recurrentes');
  promptLines.push('- Compra material en Ferretería La Barata cerca de su casa');

  console.log(promptLines.join('\n'));

  console.log('\n\n✅ Test complete. Data seeded for Carlos Mendoza.');
  console.log('You can now test via WhatsApp with phone: +5215512345001');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
