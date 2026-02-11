const crypto = require('crypto');

/**
 * Seed: Milestone 3 — Demo providers, customers, and reviews.
 *
 * Creates:
 *  - 5 provider users + their provider profiles
 *  - 5 customer users (for seeding reviews)
 *  - 18 reviews spread across all providers (≥ 3 per provider)
 */
exports.seed = async function (knex) {
  // ── Clear tables in FK-safe order ──────────────────────
  await knex('ratings').del();
  await knex('messages').del();
  await knex('assignments').del();
  await knex('service_requests').del();
  await knex('whatsapp_messages_log').del();
  await knex('whatsapp_sessions').del();
  await knex('providers').del();
  await knex('users').del();

  // ── Provider users ─────────────────────────────────────
  const providerUsers = [
    { id: crypto.randomUUID(), name: 'Jane Provider',      phone: '+5215512345001', role: 'provider', rating_average: 4.80 },
    { id: crypto.randomUUID(), name: 'Mike Electrician',    phone: '+5215512345002', role: 'provider', rating_average: 4.70 },
    { id: crypto.randomUUID(), name: 'Sofia Cleaning Pro',  phone: '+5215512345003', role: 'provider', rating_average: 4.90 },
    { id: crypto.randomUUID(), name: 'Carlos Gardener',     phone: '+5215512345004', role: 'provider', rating_average: 4.50 },
    { id: crypto.randomUUID(), name: 'Ana Repair Expert',   phone: '+5215512345005', role: 'provider', rating_average: 4.60 },
  ];

  // ── Customer users (for seeding reviews) ───────────────
  const customerUsers = [
    { id: crypto.randomUUID(), name: 'Maria Garcia',     phone: '+5215599900001', role: 'customer', rating_average: 0 },
    { id: crypto.randomUUID(), name: 'Juan Rodriguez',   phone: '+5215599900002', role: 'customer', rating_average: 0 },
    { id: crypto.randomUUID(), name: 'Ana Lopez',        phone: '+5215599900003', role: 'customer', rating_average: 0 },
    { id: crypto.randomUUID(), name: 'Pedro Martinez',   phone: '+5215599900004', role: 'customer', rating_average: 0 },
    { id: crypto.randomUUID(), name: 'Laura Sanchez',    phone: '+5215599900005', role: 'customer', rating_average: 0 },
  ];

  // Insert all users
  const allUsers = [...providerUsers, ...customerUsers];
  for (const u of allUsers) {
    await knex('users').insert({
      id: u.id,
      name: u.name,
      phone: u.phone,
      role: u.role,
      rating_average: u.rating_average,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  // ── Provider profiles ──────────────────────────────────
  const providers = [
    {
      id: crypto.randomUUID(),
      user_id: providerUsers[0].id,
      service_types: JSON.stringify(['plumbing', 'cleaning']),
      is_online: true,
      lat: 19.4326,
      lng: -99.1332,
      rating_average: 4.80,
      total_jobs: 150,
      bio: 'Professional plumber with 10 years of experience. Specializing in residential plumbing and deep cleaning services.',
    },
    {
      id: crypto.randomUUID(),
      user_id: providerUsers[1].id,
      service_types: JSON.stringify(['electrical']),
      is_online: true,
      lat: 19.4200,
      lng: -99.1500,
      rating_average: 4.70,
      total_jobs: 89,
      bio: 'Licensed electrician specializing in residential and commercial wiring. Fast and reliable service.',
    },
    {
      id: crypto.randomUUID(),
      user_id: providerUsers[2].id,
      service_types: JSON.stringify(['cleaning', 'other']),
      is_online: true,
      lat: 19.4400,
      lng: -99.1200,
      rating_average: 4.90,
      total_jobs: 210,
      bio: 'Premium cleaning service with eco-friendly products. Home, office, and post-construction cleanup.',
    },
    {
      id: crypto.randomUUID(),
      user_id: providerUsers[3].id,
      service_types: JSON.stringify(['gardening', 'repair']),
      is_online: true,
      lat: 19.4100,
      lng: -99.1600,
      rating_average: 4.50,
      total_jobs: 67,
      bio: 'Expert gardener and handyman. Lawn care, landscaping, tree trimming, and general home repairs.',
    },
    {
      id: crypto.randomUUID(),
      user_id: providerUsers[4].id,
      service_types: JSON.stringify(['repair', 'plumbing', 'electrical']),
      is_online: true,
      lat: 19.4500,
      lng: -99.1100,
      rating_average: 4.60,
      total_jobs: 120,
      bio: "All-around repair specialist. If it's broken, I can fix it! Furniture, appliances, plumbing, and basic electrical.",
    },
  ];

  for (const p of providers) {
    await knex('providers').insert({
      id: p.id,
      user_id: p.user_id,
      service_types: p.service_types,
      is_online: p.is_online,
      lat: p.lat,
      lng: p.lng,
      rating_average: p.rating_average,
      total_jobs: p.total_jobs,
      bio: p.bio,
      portfolio_images: '[]',
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  // ── Ratings / Reviews (≥ 3 per provider) ───────────────
  const reviews = [
    // Jane Provider — plumbing / cleaning (4 reviews)
    { ratee: providerUsers[0].id, rater: customerUsers[0].id, stars: 5, comment: 'Excellent work, fixed my sink in 30 minutes!' },
    { ratee: providerUsers[0].id, rater: customerUsers[1].id, stars: 4, comment: 'Good service, arrived on time.' },
    { ratee: providerUsers[0].id, rater: customerUsers[2].id, stars: 5, comment: 'Very professional and clean work.' },
    { ratee: providerUsers[0].id, rater: customerUsers[3].id, stars: 5, comment: 'Best plumber in town! Highly recommended.' },

    // Mike Electrician (3 reviews)
    { ratee: providerUsers[1].id, rater: customerUsers[0].id, stars: 5, comment: 'Fixed all my outlets perfectly. Very knowledgeable.' },
    { ratee: providerUsers[1].id, rater: customerUsers[2].id, stars: 4, comment: 'Good work, but took a bit longer than expected.' },
    { ratee: providerUsers[1].id, rater: customerUsers[4].id, stars: 5, comment: 'Excellent electrician! Rewired my entire kitchen.' },

    // Sofia Cleaning Pro (4 reviews)
    { ratee: providerUsers[2].id, rater: customerUsers[0].id, stars: 5, comment: 'My house has never been this clean! Amazing job.' },
    { ratee: providerUsers[2].id, rater: customerUsers[1].id, stars: 5, comment: 'Super thorough and uses eco-friendly products.' },
    { ratee: providerUsers[2].id, rater: customerUsers[3].id, stars: 5, comment: 'Best cleaning service ever. Absolutely spotless!' },
    { ratee: providerUsers[2].id, rater: customerUsers[4].id, stars: 4, comment: 'Very good cleaning, will book again.' },

    // Carlos Gardener (3 reviews)
    { ratee: providerUsers[3].id, rater: customerUsers[1].id, stars: 5, comment: 'Transformed my garden! Looks beautiful now.' },
    { ratee: providerUsers[3].id, rater: customerUsers[2].id, stars: 4, comment: 'Good landscaping work, fair price.' },
    { ratee: providerUsers[3].id, rater: customerUsers[4].id, stars: 4, comment: 'Reliable gardener, shows up on time.' },

    // Ana Repair Expert (4 reviews)
    { ratee: providerUsers[4].id, rater: customerUsers[0].id, stars: 5, comment: 'Fixed my washing machine like new!' },
    { ratee: providerUsers[4].id, rater: customerUsers[1].id, stars: 4, comment: 'Good handywoman, fixed several things in one visit.' },
    { ratee: providerUsers[4].id, rater: customerUsers[3].id, stars: 5, comment: 'Very skilled, repaired my antique furniture carefully.' },
    { ratee: providerUsers[4].id, rater: customerUsers[4].id, stars: 5, comment: 'Fast and efficient. Solved my problem in no time!' },
  ];

  for (const r of reviews) {
    await knex('ratings').insert({
      id: crypto.randomUUID(),
      request_id: null,
      rater_id: r.rater,
      ratee_id: r.ratee,
      stars: r.stars,
      comment: r.comment,
      created_at: new Date(),
    });
  }

  console.log('[Seed 002] Demo data seeded: 10 users, 5 providers, 18 reviews');
};

