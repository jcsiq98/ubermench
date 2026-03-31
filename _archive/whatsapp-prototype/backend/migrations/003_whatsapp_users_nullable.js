/**
 * Migration: Make email and password nullable so WhatsApp users
 * (identified by phone number only) can be created without them.
 * Also make phone unique and add whatsapp_name column.
 */
exports.up = async function (knex) {
  // SQLite does not support ALTER COLUMN, so we rebuild the table
  const isSQLite = knex.client.config.client === 'sqlite3';

  if (isSQLite) {
    // 1. Rename old table
    await knex.schema.renameTable('users', 'users_old');

    // 2. Create new table with relaxed constraints
    await knex.raw(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        phone TEXT NOT NULL,
        password TEXT,
        role TEXT NOT NULL CHECK(role IN ('customer','provider')),
        rating_average DECIMAL(3,2) DEFAULT 0.00,
        profile_image_url TEXT DEFAULT '',
        whatsapp_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await knex.raw('CREATE INDEX IF NOT EXISTS users_email_idx ON users(email)');
    await knex.raw('CREATE INDEX IF NOT EXISTS users_phone_idx ON users(phone)');
    await knex.raw('CREATE INDEX IF NOT EXISTS users_role_idx ON users(role)');

    // 3. Copy data
    await knex.raw(`
      INSERT INTO users (id, name, email, phone, password, role, rating_average, profile_image_url, created_at, updated_at)
      SELECT id, name, email, phone, password, role, rating_average, profile_image_url, created_at, updated_at
      FROM users_old
    `);

    // 4. Drop old table
    await knex.schema.dropTable('users_old');
  } else {
    // PostgreSQL: straightforward ALTER
    await knex.schema.alterTable('users', (table) => {
      table.string('email').nullable().alter();
      table.string('password').nullable().alter();
      table.string('whatsapp_name').nullable();
      table.index(['phone']);
    });
  }
};

exports.down = async function (knex) {
  const isSQLite = knex.client.config.client === 'sqlite3';

  if (isSQLite) {
    await knex.schema.renameTable('users', 'users_new');

    await knex.schema.createTable('users', (table) => {
      table.string('id').primary();
      table.string('name').notNullable();
      table.string('email').unique().notNullable();
      table.string('phone').notNullable();
      table.string('password').notNullable();
      table.enum('role', ['customer', 'provider']).notNullable();
      table.decimal('rating_average', 3, 2).defaultTo(0.0);
      table.string('profile_image_url').defaultTo('');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index(['email']);
      table.index(['role']);
    });

    await knex.raw(`
      INSERT INTO users (id, name, email, phone, password, role, rating_average, profile_image_url, created_at, updated_at)
      SELECT id, name, email, phone, password, role, rating_average, profile_image_url, created_at, updated_at
      FROM users_new
    `);

    await knex.schema.dropTable('users_new');
  } else {
    await knex.schema.alterTable('users', (table) => {
      table.string('email').notNullable().alter();
      table.string('password').notNullable().alter();
      table.dropColumn('whatsapp_name');
      table.dropIndex(['phone']);
    });
  }
};

