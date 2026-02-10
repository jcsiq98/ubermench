exports.up = async function (knex) {
  // WhatsApp sessions table
  await knex.schema.createTable('whatsapp_sessions', (table) => {
    table.string('id').primary();
    table.string('phone_number').unique().notNullable();
    table.string('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.enum('role', ['customer', 'provider']).defaultTo('customer');
    table.string('current_state').defaultTo('NEW');
    table.text('state_data').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index(['phone_number']);
    table.index(['user_id']);
    table.index(['current_state']);
  });

  // WhatsApp message log table
  await knex.schema.createTable('whatsapp_messages_log', (table) => {
    table.string('id').primary();
    table.string('wamid').nullable(); // WhatsApp message ID
    table.string('phone_number').notNullable();
    table.enum('direction', ['inbound', 'outbound']).notNullable();
    table.string('message_type').notNullable(); // text, interactive, image, audio, status, etc.
    table.text('content').defaultTo('{}'); // JSON blob
    table.string('status').defaultTo('received'); // received, sent, delivered, read, failed
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['phone_number']);
    table.index(['wamid']);
    table.index(['direction']);
    table.index(['created_at']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('whatsapp_messages_log');
  await knex.schema.dropTableIfExists('whatsapp_sessions');
};

