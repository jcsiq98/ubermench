exports.up = async function(knex) {
  // Users table
  await knex.schema.createTable('users', (table) => {
    table.string('id').primary();
    table.string('name').notNullable();
    table.string('email').unique().notNullable();
    table.string('phone').notNullable();
    table.string('password').notNullable();
    table.enum('role', ['customer', 'provider']).notNullable();
    table.decimal('rating_average', 3, 2).defaultTo(0.00);
    table.string('profile_image_url').defaultTo('');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index(['email']);
    table.index(['role']);
  });

  // Providers table
  await knex.schema.createTable('providers', (table) => {
    table.string('id').primary();
    table.string('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.text('service_types').notNullable().defaultTo('[]');
    table.boolean('is_online').defaultTo(false);
    table.decimal('lat', 10, 8).notNullable();
    table.decimal('lng', 11, 8).notNullable();
    table.decimal('rating_average', 3, 2).defaultTo(0.00);
    table.integer('total_jobs').defaultTo(0);
    table.text('bio').defaultTo('');
    table.text('portfolio_images').defaultTo('[]');
    table.timestamp('last_seen_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index(['is_online']);
    table.index(['lat', 'lng']);
  });

  // Service requests table
  await knex.schema.createTable('service_requests', (table) => {
    table.string('id').primary();
    table.string('customer_id').references('id').inTable('users').onDelete('CASCADE');
    table.enum('service_type', ['plumbing', 'electrical', 'cleaning', 'gardening', 'repair', 'other']).notNullable();
    table.enum('status', ['created', 'searching', 'provider_assigned', 'provider_arriving', 'in_progress', 'completed', 'cancelled', 'paid']).defaultTo('created');
    table.decimal('origin_lat', 10, 8).notNullable();
    table.decimal('origin_lng', 11, 8).notNullable();
    table.string('address').notNullable();
    table.text('description').defaultTo('');
    table.decimal('price_estimate', 10, 2).defaultTo(0.00);
    table.string('provider_id').references('id').inTable('providers').onDelete('SET NULL');
    table.timestamp('accepted_at');
    table.timestamp('completed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index(['customer_id']);
    table.index(['provider_id']);
    table.index(['status']);
    table.index(['service_type']);
    table.index(['origin_lat', 'origin_lng']);
  });

  // Assignments table
  await knex.schema.createTable('assignments', (table) => {
    table.string('id').primary();
    table.string('request_id').references('id').inTable('service_requests').onDelete('CASCADE');
    table.string('provider_id').references('id').inTable('providers').onDelete('CASCADE');
    table.enum('status', ['pending', 'accepted', 'rejected', 'cancelled']).defaultTo('pending');
    table.timestamp('accepted_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index(['request_id']);
    table.index(['provider_id']);
    table.index(['status']);
  });

  // Payments table
  await knex.schema.createTable('payments', (table) => {
    table.string('id').primary();
    table.string('request_id').references('id').inTable('service_requests').onDelete('CASCADE');
    table.decimal('amount', 10, 2).notNullable();
    table.enum('status', ['pending', 'completed', 'failed', 'refunded']).defaultTo('pending');
    table.string('payment_method').notNullable();
    table.string('stripe_payment_intent_id');
    table.text('payment_details');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index(['request_id']);
    table.index(['status']);
  });

  // Ratings table
  await knex.schema.createTable('ratings', (table) => {
    table.string('id').primary();
    table.string('request_id').references('id').inTable('service_requests').onDelete('CASCADE');
    table.string('rater_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('ratee_id').references('id').inTable('users').onDelete('CASCADE');
    table.integer('stars').notNullable();
    table.text('comment').defaultTo('');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index(['request_id']);
    table.index(['rater_id']);
    table.index(['ratee_id']);
  });

  // Messages table
  await knex.schema.createTable('messages', (table) => {
    table.string('id').primary();
    table.string('request_id').references('id').inTable('service_requests').onDelete('CASCADE');
    table.string('sender_id').references('id').inTable('users').onDelete('CASCADE');
    table.text('content').notNullable();
    table.enum('type', ['text', 'image', 'location']).defaultTo('text');
    table.boolean('is_read').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index(['request_id']);
    table.index(['sender_id']);
    table.index(['created_at']);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('messages');
  await knex.schema.dropTableIfExists('ratings');
  await knex.schema.dropTableIfExists('payments');
  await knex.schema.dropTableIfExists('assignments');
  await knex.schema.dropTableIfExists('service_requests');
  await knex.schema.dropTableIfExists('providers');
  await knex.schema.dropTableIfExists('users');
};


