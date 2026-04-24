const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

const pool = new Pool(
  connectionString
    ? {
        connectionString
      }
    : {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'system_health_hub',
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 5432
      }
);

module.exports = pool;