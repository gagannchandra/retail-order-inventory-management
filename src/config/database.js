'use strict';

const mysql = require('mysql2/promise');
require('dotenv').config();

// ─── Connection Pool ──────────────────────────────────────────
const pool = mysql.createPool({
  host              : process.env.DB_HOST     || 'localhost',
  port              : parseInt(process.env.DB_PORT) || 3306,
  user              : process.env.DB_USER     || 'root',
  password          : process.env.DB_PASSWORD || '',
  database          : process.env.DB_NAME     || 'retail_ims',
  waitForConnections: true,
  connectionLimit   : parseInt(process.env.DB_POOL_SIZE) || 10,
  queueLimit        : 0,
  connectTimeout    : parseInt(process.env.DB_CONNECT_TIMEOUT) || 60000,
  timezone          : '+05:30',
  charset           : 'utf8mb4',
  dateStrings       : false,
});

// ─── Query Helper ─────────────────────────────────────────────
/**
 * Execute a parameterised query and return [rows, fields].
 * @param {string} sql
 * @param {Array}  params
 * @returns {Promise<[Array, Array]>}
 */
const query = async (sql, params = []) => {
  const [rows, fields] = await pool.execute(sql, params);
  return [rows, fields];
};

// ─── Transaction Helper ───────────────────────────────────────
/**
 * Run multiple operations inside a single transaction.
 * @param {Function} callback  receives a connection object
 * @returns {Promise<*>}       whatever callback returns
 */
const withTransaction = async (callback) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── Health Check ─────────────────────────────────────────────
const ping = async () => {
  const [rows] = await query('SELECT 1 AS ok');
  return rows[0].ok === 1;
};

module.exports = { pool, query, withTransaction, ping };
