'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query }      = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const logger           = require('../config/logger');

// ─── Register ─────────────────────────────────────────────────
exports.register = asyncHandler(async (req, res) => {
  const { first_name, last_name, email, password, role_id = 3 } = req.body;

  const [existing] = await query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) {
    return res.status(409).json({ success: false, message: 'Email already registered.' });
  }

  const hash = await bcrypt.hash(password, 12);
  const id   = uuidv4();

  await query(
    `INSERT INTO users (id, role_id, first_name, last_name, email, password_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, role_id, first_name, last_name, email, hash]
  );

  logger.info('New user registered', { id, email });
  res.status(201).json({ success: true, message: 'Account created.', data: { id, email } });
});

// ─── Login ────────────────────────────────────────────────────
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const [rows] = await query(
    `SELECT u.id, u.password_hash, u.is_active, r.name AS role
       FROM users u JOIN roles r ON u.role_id = r.id
      WHERE u.email = ?`,
    [email]
  );

  if (!rows.length) {
    return res.status(401).json({ success: false, message: 'Invalid credentials.' });
  }

  const user = rows[0];
  if (!user.is_active) {
    return res.status(403).json({ success: false, message: 'Account is deactivated.' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Invalid credentials.' });
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  await query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
  logger.info('User logged in', { id: user.id });

  res.json({ success: true, data: { token, role: user.role } });
});

// ─── Get Current User ─────────────────────────────────────────
exports.me = asyncHandler(async (req, res) => {
  const [rows] = await query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.last_login,
            r.name AS role, r.permissions
       FROM users u JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?`,
    [req.user.id]
  );
  res.json({ success: true, data: rows[0] });
});

// ─── Change Password ──────────────────────────────────────────
exports.changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  const [rows] = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  const match  = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!match) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
  }

  const hash = await bcrypt.hash(new_password, 12);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
  res.json({ success: true, message: 'Password updated.' });
});
