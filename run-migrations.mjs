import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import pg from 'pg';

// Manual .env parser (no dotenv dependency)
function loadEnv(path) {
  try {
    const content = readFileSync(path, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (e) {
    console.error('Could not read .env:', e.message);
  }
}

loadEnv('./.env');

const dbUrl = process.env.LOVABLE_DB_MIGRATION_URL;
if (!dbUrl || dbUrl.includes('FILL_ME_IN')) {
  console.error('❌ LOVABLE_DB_MIGRATION_URL not set or still FILL_ME_IN');
  process.exit(1);
}

const migrationsDir = './supabase/migrations';
const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log(`\n📦 Found ${files.length} migration files\n`);

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('✅ Connected to Supabase DB\n');

  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations_applied (
      filename text PRIMARY KEY,
      applied_at timestamptz DEFAULT now()
    );
  `);

  const { rows: applied } = await client.query(
    'SELECT filename FROM _migrations_applied'
  );
  const appliedSet = new Set(applied.map(r => r.filename));

  let success = 0, skipped = 0, failed = 0;

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`⏭  SKIP  ${file}`);
      skipped++;
      continue;
    }
    try {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query(
        'INSERT INTO _migrations_applied (filename) VALUES ($1)',
        [file]
      );
      console.log(`✅ OK    ${file}`);
      success++;
    } catch (err) {
      console.error(`❌ FAIL  ${file}`);
      console.error(`   ${err.message}`);
      failed++;
      break;
    }
  }

  console.log('\n════════════════════════════════');
  console.log(`✅ Applied: ${success}`);
  console.log(`⏭  Skipped: ${skipped}`);
  console.log(`❌ Failed:  ${failed}`);
  console.log('════════════════════════════════\n');
} catch (err) {
  console.error('❌ Connection/Setup error:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
