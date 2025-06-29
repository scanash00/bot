import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', () => {
  // console.error('Postgres Pool Error:', err);
});

export default pool;
