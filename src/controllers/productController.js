'use strict';

const { v4: uuidv4 }   = require('uuid');
const { query, withTransaction } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');

// ─── List Products ────────────────────────────────────────────
exports.list = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 20,
    category, supplier, search,
    low_stock, is_active = 1,
    sort = 'name', order = 'ASC',
  } = req.query;

  const allowedSort = ['name', 'sku', 'unit_price', 'quantity_available', 'created_at'];
  const sortCol     = allowedSort.includes(sort) ? sort : 'name';
  const sortDir     = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  const offset      = (Math.max(1, +page) - 1) * Math.min(100, +limit);

  let where  = ['p.is_active = ?'];
  let params = [is_active];

  if (category) { where.push('p.category_id = ?'); params.push(category); }
  if (supplier) { where.push('p.supplier_id = ?'); params.push(supplier); }
  if (low_stock) { where.push('i.quantity_available <= i.reorder_point'); }
  if (search)   {
    where.push('MATCH(p.name, p.description) AGAINST(? IN BOOLEAN MODE)');
    params.push(`${search}*`);
  }

  const whereClause = where.join(' AND ');

  const [[{ total }]] = await query(
    `SELECT COUNT(*) AS total FROM products p
     LEFT JOIN inventory i ON p.id = i.product_id
     WHERE ${whereClause}`,
    params
  );

  const [rows] = await query(
    `SELECT p.id, p.sku, p.name, p.unit_price, p.cost_price, p.tax_rate, p.unit, p.is_active,
            c.name AS category, s.name AS supplier,
            i.quantity_on_hand, i.quantity_available, i.reorder_point, i.warehouse_location
       FROM products p
       JOIN categories c     ON p.category_id = c.id
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       LEFT JOIN inventory i ON p.id = i.product_id
      WHERE ${whereClause}
      ORDER BY p.${sortCol} ${sortDir}
      LIMIT ? OFFSET ?`,
    [...params, +limit, offset]
  );

  res.json({
    success: true,
    data   : rows,
    meta   : { total: +total, page: +page, limit: +limit, pages: Math.ceil(+total / +limit) },
  });
});

// ─── Get One ──────────────────────────────────────────────────
exports.getById = asyncHandler(async (req, res) => {
  const [rows] = await query(
    `SELECT p.*, c.name AS category, s.name AS supplier,
            i.quantity_on_hand, i.quantity_reserved, i.quantity_available,
            i.reorder_point, i.reorder_quantity, i.warehouse_location, i.last_restock_at
       FROM products p
       JOIN categories c     ON p.category_id = c.id
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.id = ?`,
    [req.params.id]
  );

  if (!rows.length) return res.status(404).json({ success: false, message: 'Product not found.' });
  res.json({ success: true, data: rows[0] });
});

// ─── Create ───────────────────────────────────────────────────
exports.create = asyncHandler(async (req, res) => {
  const {
    category_id, supplier_id, sku, name, description,
    unit_price, cost_price, tax_rate = 18, unit = 'pcs', image_url,
    quantity_on_hand = 0, reorder_point = 10, reorder_quantity = 50, warehouse_location,
  } = req.body;

  const id = uuidv4();

  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO products (id, category_id, supplier_id, sku, name, description,
                             unit_price, cost_price, tax_rate, unit, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, category_id, supplier_id || null, sku, name, description || null,
       unit_price, cost_price, tax_rate, unit, image_url || null]
    );
    await conn.execute(
      `INSERT INTO inventory (id, product_id, quantity_on_hand, reorder_point, reorder_quantity, warehouse_location)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), id, quantity_on_hand, reorder_point, reorder_quantity, warehouse_location || null]
    );
  });

  res.status(201).json({ success: true, message: 'Product created.', data: { id } });
});

// ─── Update ───────────────────────────────────────────────────
exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const allowed = ['category_id','supplier_id','name','description','unit_price','cost_price','tax_rate','unit','image_url','is_active'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));

  if (!Object.keys(updates).length) {
    return res.status(400).json({ success: false, message: 'No valid fields to update.' });
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values     = [...Object.values(updates), id];

  const [result] = await query(`UPDATE products SET ${setClauses} WHERE id = ?`, values);
  if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Product not found.' });

  res.json({ success: true, message: 'Product updated.' });
});

// ─── Delete (soft) ────────────────────────────────────────────
exports.remove = asyncHandler(async (req, res) => {
  const [result] = await query('UPDATE products SET is_active = 0 WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Product not found.' });
  res.json({ success: true, message: 'Product deactivated.' });
});

// ─── Inventory Adjustment ─────────────────────────────────────
exports.adjustInventory = asyncHandler(async (req, res) => {
  const { quantity, type = 'ADJUSTMENT', notes } = req.body;
  const productId = req.params.id;

  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE inventory SET quantity_on_hand = quantity_on_hand + ? WHERE product_id = ?`,
      [quantity, productId]
    );
    await conn.execute(
      `INSERT INTO inventory_transactions (id, product_id, user_id, type, quantity, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), productId, req.user.id, type, quantity, notes || null]
    );
  });

  res.json({ success: true, message: 'Inventory adjusted.' });
});
