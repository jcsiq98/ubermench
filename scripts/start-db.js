/**
 * Starts an embedded PostgreSQL for local development.
 * Run: node scripts/start-db.js
 * Keeps running until you Ctrl+C.
 */
const fs = require('fs');
const path = require('path');
const EmbeddedPostgres = require('embedded-postgres').default;

const DATA_DIR = './tmp-pg-data';
const PID_FILE = path.join(DATA_DIR, 'postmaster.pid');
const PG_VERSION_FILE = path.join(DATA_DIR, 'PG_VERSION');

// Clean up stale PID file from a previous unclean shutdown
if (fs.existsSync(PID_FILE)) {
  console.log('⚠️  Found stale postmaster.pid — removing it...');
  fs.unlinkSync(PID_FILE);
}

const alreadyInitialised = fs.existsSync(PG_VERSION_FILE);

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'handy',
  password: 'handy123',
  port: 5433,
  persistent: true,
});

(async () => {
  try {
    if (alreadyInitialised) {
      console.log('🐘 PostgreSQL data directory already exists — skipping init.');
    } else {
      console.log('🐘 Initialising embedded PostgreSQL...');
      await pg.initialise();
    }

    console.log('🚀 Starting PostgreSQL on port 5433...');
    await pg.start();

    // Try creating database (may already exist)
    try {
      await pg.createDatabase('handy_dev');
      console.log('📦 Database "handy_dev" created');
    } catch {
      console.log('📦 Database "handy_dev" already exists');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ PostgreSQL is running!');
    console.log('📎 DATABASE_URL=postgresql://handy:handy123@localhost:5433/handy_dev');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Press Ctrl+C to stop.\n');

    // Keep process alive
    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping PostgreSQL...');
      await pg.stop();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      await pg.stop();
      process.exit(0);
    });
  } catch (e) {
    console.error('❌ Failed to start PostgreSQL:', e?.message || e);
    if (e?.stack) console.error(e.stack);
    process.exit(1);
  }
})();
