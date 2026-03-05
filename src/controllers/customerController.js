'use strict';

const { v4: uuidv4 }   = require('uuid');
const { query }        = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');

exports.list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, tier } = req.query;
  const offset = (Math.max(1, +page) - 1) * Math.min(100, +limit);

  let where = ['1=1'], params = [];
  if (tier)   { where.push('tier = ?'); params.push(tier); }
  if (search) {
    where.push('MATCH(first_name, last_name, email) AGAINST(? IN BOOLEAN MODE)');
    params.push(`${search}*`);
  }
  const w = where.join(' AND ');
  const [[{ total }]] = await query(`SELECT COUNT(*) AS total FROM customers WHERE ${w}`, params);
  const [rows] = await query(
    `SELECT * FROM customers WHERE ${w} ORDER BY total_spent DESC LIMIT ? OFFSET ?`,
    [...params, +limit, offset]
  );
  res.json({ success: true, data: rows, meta: { total: +total, page: +page, limit: +limit } });
});

exports.getById = asyncHandler(async (req, res) => {
  const [[customer]] = await query('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

  const [orders] = await query(
    `SELECT id, order_number, status, total_amount, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10`,
    [req.params.id]
  );
  res.json({ success: true, data: { ...customer, recent_orders: orders } });
});

exports.create = asyncHandler(async (req, res) => {
  const { first_name, last_name, email, phone, address, city, state, pincode } = req.body;
  const id = uuidv4();
  await query(
    `INSERT INTO customers (id, first_name, last_name, email, phone, address, city, state, pincode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, first_name, last_name, email || null, phone || null, address || null, city || null, state || null, pincode || null]
  );
  res.status(201).json({ success: true, data: { id } });
});

exports.update = asyncHandler(async (req, res) => {
  const allowed = ['first_name','last_name','email','phone','address','city','state','pincode','tier'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  if (!Object.keys(updates).length) {
    return res.status(400).json({ success: false, message: 'No valid fields.' });
  }
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const [result]   = await query(`UPDATE customers SET ${setClauses} WHERE id = ?`, [...Object.values(updates), req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Customer not found.' });
  res.json({ success: true, message: 'Customer updated.' });
});
