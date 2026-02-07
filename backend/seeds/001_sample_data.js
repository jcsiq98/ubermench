exports.seed = async function(knex) {
  // Clear existing entries
  await knex('users').del();
  await knex('providers').del();

  // Insert sample users
  const users = await knex('users').insert([
    {
      name: 'John Customer',
      email: 'john@example.com',
      phone: '+1234567890',
      password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J8Kz8Kz8K', // password123
      role: 'customer',
      rating_average: 4.5,
      created_at: new Date()
    },
    {
      name: 'Jane Provider',
      email: 'jane@example.com',
      phone: '+1234567891',
      password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J8Kz8Kz8K', // password123
      role: 'provider',
      rating_average: 4.8,
      created_at: new Date()
    },
    {
      name: 'Mike Electrician',
      email: 'mike@example.com',
      phone: '+1234567892',
      password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J8Kz8Kz8K', // password123
      role: 'provider',
      rating_average: 4.7,
      created_at: new Date()
    }
  ]).returning('*');

  // Insert sample providers
  await knex('providers').insert([
    {
      user_id: users[1].id,
      service_types: JSON.stringify(['plumbing', 'cleaning']),
      is_online: true,
      lat: 40.7128,
      lng: -74.0060,
      rating_average: 4.8,
      total_jobs: 150,
      bio: 'Professional plumber with 10 years of experience',
      portfolio_images: JSON.stringify([]),
      created_at: new Date()
    },
    {
      user_id: users[2].id,
      service_types: JSON.stringify(['electrical']),
      is_online: true,
      lat: 40.7589,
      lng: -73.9851,
      rating_average: 4.7,
      total_jobs: 89,
      bio: 'Licensed electrician specializing in residential work',
      portfolio_images: JSON.stringify([]),
      created_at: new Date()
    }
  ]);
};
