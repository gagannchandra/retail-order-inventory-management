'use strict';

const { query }        = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');

// ─── Full Inventory List ──────────────────────────────────────
exports.list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, low_stock, out_of_stock, category } = req.query;
  const offset = (Math.max(1, +page) - 1) * Math.min(100, +limit);

  let where  = ['p.is_active = 1'];
  let params = [];

  if (low_stock)    { where.push('i.quantity_available <= i.reorder_point AND i.quantity_available > 0'); }
  if (out_of_stock) { where.push('i.quantity_available = 0'); }
  if (category)     { where.push('p.category_id = ?'); params.push(category); }

  const whereClause = where.join(' AND ');

  const [[{ total }]] = await query(
    `SELECT COUNT(*) AS total FROM products p
     JOIN inventory i ON p.id = i.product_id WHERE ${whereClause}`, params
  );

  const [rows] = await query(
    `SELECT p.id AS product_id, p.sku, p.name, p.unit,
            c.name AS category,
            i.quantity_on_hand, i.quantity_reserved, i.quantity_available,
            i.reorder_point, i.reorder_quantity, i.warehouse_location, i.last_restock_at,
            CASE WHEN i.quantity_available = 0 THEN 'OUT_OF_STOCK'
                 WHEN i.quantity_available <= i.reorder_point THEN 'LOW_STOCK'
                 ELSE 'IN_STOCK' END AS stock_status
       FROM products p
       JOIN categories c ON p.category_id = c.id
       JOIN inventory i  ON p.id = i.product_id
      WHERE ${whereClause}
      ORDER BY stock_status ASC, p.name ASC
      LIMIT ? OFFSET ?`,
    [...params, +limit, offset]
  );

  res.json({
    success: true,
    data   : rows,
    meta   : { total: +total, page: +page, limit: +limit, pages: Math.ceil(+total / +limit) },
  });
});

// ─── Transaction History ──────────────────────────────────────
exports.transactions = asyncHandler(async (req, res) => {
  const { product_id, type, page = 1, limit = 30 } = req.query;
  const offset = (Math.max(1, +page) - 1) * Math.min(100, +limit);

  let where  = ['1=1'];
  let params = [];

  if (product_id) { where.push('t.product_id = ?'); params.push(product_id); }
  if (type)       { where.push('t.type = ?');        params.push(type); }

  const whereClause = where.join(' AND ');

  const [[{ total }]] = await query(
    `SELECT COUNT(*) AS total FROM inventory_transactions t WHERE ${whereClause}`, params
  );

  const [rows] = await query(
    `SELECT t.*, p.name AS product_name, p.sku,
            CONCAT(u.first_name,' ',u.last_name) AS performed_by
       FROM inventory_transactions t
       JOIN products p ON t.product_id = p.id
       JOIN users u    ON t.user_id    = u.id
      WHERE ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, +limit, offset]
  );

  res.json({
    success: true,
    data   : rows,
    meta   : { total: +total, page: +page, limit: +limit },
  });
});

// ─── Low Stock Alerts ─────────────────────────────────────────
exports.alerts = asyncHandler(async (req, res) => {
  const [rows] = await query(
    `SELECT p.id, p.sku, p.name, s.name AS supplier, s.email AS supplier_email,
            i.quantity_available, i.reorder_point, i.reorder_quantity
       FROM products p
       JOIN inventory i      ON p.id = i.product_id
       LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.is_active = 1 AND i.quantity_available <= i.reorder_point
      ORDER BY i.quantity_available ASC`
  );
  res.json({ success: true, data: rows, count: rows.length });
});
