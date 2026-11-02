const { Client } = require('pg');

const c = new Client({
  connectionString: 'postgres://postgres:GreenDms2026@127.0.0.1:5432/greendms',
  connectTimeoutMS: 5000,
});

c.connect()
  .then(() => c.query('CREATE EXTENSION IF NOT EXISTS postgis'))
  .then(() => console.log('postgis: OK'))
  .then(() => c.query('CREATE EXTENSION IF NOT EXISTS pgcrypto'))
  .then(() => console.log('pgcrypto: OK'))
  .then(() => c.query('CREATE EXTENSION IF NOT EXISTS pg_trgm'))
  .then(() => console.log('pg_trgm: OK'))
  .then(() => c.query('CREATE EXTENSION IF NOT EXISTS btree_gist'))
  .then(() => console.log('btree_gist: OK'))
  .then(() => c.end())
  .catch(e => { console.error('ERROR:', e.message); process.exit(1); });
