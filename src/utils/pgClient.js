const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', () => {
  // console.error('Postgres Pool Error:', err);
});

pool.queryAsync = (text, params) => pool.query(text, params);

pool.close = () => pool.end();

module.exports = pool;
