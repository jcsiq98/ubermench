const knex = require('knex');
require('dotenv').config();

// Use SQLite for development if PostgreSQL is not available
const useSQLite = process.env.DB_TYPE === 'sqlite' || !process.env.DB_HOST;

const db = knex({
  client: useSQLite ? 'sqlite3' : 'pg',
  connection: useSQLite ? {
    filename: './dev.sqlite3'
  } : {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'servicios_uber',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    tableName: 'knex_migrations',
    directory: './migrations'
  },
  seeds: {
    directory: './seeds'
  },
  useNullAsDefault: useSQLite
});

module.exports = { db };
