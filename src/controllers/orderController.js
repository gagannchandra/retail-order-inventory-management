'use strict';

const { v4: uuidv4 }             = require('uuid');
const { query, withTransaction } = require('../config/database');
const { asyncHandler }           = require('../middleware/errorHandler');
const logger                     = require('../config/logger');

// ─── List Orders ──────────────────────────────────────────────
exports.list = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 20,
    status, payment_status, customer_id,
    date_from, date_to,
    sort = 'created_at', order = 'DESC',
  } = req.query;

  const allowedSort = ['created_at', 'total_amount', 'order_number', 'status'];
  const sortCol = allowedSort.includes(sort) ? sort : 'created_at';
  const sortDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const offset  = (Math.max(1, +page) - 1) * Math.min(100, +limit);

  let where  = ['1=1'];
  let params = [];

  if (status)         { where.push('o.status = ?');          params.push(status); }
  if (payment_status) { where.push('o.payment_status = ?');  params.push(payment_status); }
  if (customer_id)    { where.push('o.customer_id = ?');     params.push(customer_id); }
  if (date_from)      { where.push('o.created_at >= ?');     params.push(date_from); }
  if (date_to)        { where.push('o.created_at <= ?');     params.push(date_to); }

  const whereClause = where.join(' AND ');

  const [[{ total }]] = await query(
    `SELECT COUNT(*) AS total FROM orders o WHERE ${whereClause}`, params
  );

  const [rows] = await query(
    `SELECT o.id, o.order_number, o.status, o.payment_status, o.payment_method,
            o.subtotal, o.tax_amount, o.discount_amount, o.total_amount, o.created_at,
            CONCAT(c.first_name,' ',c.last_name) AS customer_name, c.email AS customer_email,
            CONCAT(u.first_name,' ',u.last_name) AS created_by,
            COUNT(oi.id) AS item_count
       FROM orders o
       JOIN customers c    ON o.customer_id = c.id
       JOIN users u        ON o.created_by  = u.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE ${whereClause}
      GROUP BY o.id
      ORDER BY o.${sortCol} ${sortDir}
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
  const [orders] = await query(
    `SELECT o.*, CONCAT(c.first_name,' ',c.last_name) AS customer_name, c.email, c.phone
       FROM orders o JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?`,
    [req.params.id]
  );
  if (!orders.length) return res.status(404).json({ success: false, message: 'Order not found.' });

  const [items] = await query(
    `SELECT oi.*, p.name AS product_name, p.sku
       FROM order_items oi JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?`,
    [req.params.id]
  );

  res.json({ success: true, data: { ...orders[0], items } });
});

// ─── Create Order ─────────────────────────────────────────────
exports.create = asyncHandler(async (req, res) => {
  const { customer_id, items, payment_method = 'CASH', shipping_address, notes, discount_amount = 0, shipping_amount = 0 } = req.body;

  if (!items?.length) {
    return res.status(400).json({ success: false, message: 'Order must contain at least one item.' });
  }

  const orderId = uuidv4();

  const result = await withTransaction(async (conn) => {
    // Generate order number
    const [[{ count }]] = await conn.execute(
      `SELECT COUNT(*) AS count FROM orders WHERE YEAR(created_at) = YEAR(NOW())`
    );
    const orderNumber = `ORD-${new Date().getFullYear()}-${String(+count + 1).padStart(5, '0')}`;

    let subtotal   = 0;
    let taxAmount  = 0;
    const lineItems = [];

    for (const item of items) {
      // Lock inventory row
      const [[inv]] = await conn.execute(
        `SELECT i.quantity_available, p.unit_price, p.tax_rate
           FROM inventory i JOIN products p ON p.id = i.product_id
          WHERE i.product_id = ? FOR UPDATE`,
        [item.product_id]
      );

      if (!inv) throw Object.assign(new Error(`Product ${item.product_id} not found.`), { statusCode: 404 });
      if (inv.quantity_available < item.quantity) {
        throw Object.assign(
          new Error(`Insufficient stock for product ${item.product_id}. Available: ${inv.quantity_available}`),
          { statusCode: 409 }
        );
      }

      const unitPrice   = item.unit_price ?? inv.unit_price;
      const discountPct = item.discount_pct ?? 0;
      const taxRate     = inv.tax_rate;
      const lineBase    = unitPrice * item.quantity * (1 - discountPct / 100);
      const lineTax     = lineBase * (taxRate / 100);
      const lineTotal   = lineBase + lineTax;

      subtotal  += lineBase;
      taxAmount += lineTax;

      lineItems.push([uuidv4(), orderId, item.product_id, item.quantity, unitPrice, taxRate, discountPct, lineTotal]);

      // Reserve inventory
      await conn.execute(
        `UPDATE inventory SET quantity_reserved = quantity_reserved + ? WHERE product_id = ?`,
        [item.quantity, item.product_id]
      );
    }

    const totalAmount = subtotal + taxAmount - discount_amount + shipping_amount;

    await conn.execute(
      `INSERT INTO orders (id, order_number, customer_id, created_by, payment_method,
                           subtotal, tax_amount, discount_amount, shipping_amount, total_amount,
                           shipping_address, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, orderNumber, customer_id, req.user.id, payment_method,
       subtotal, taxAmount, discount_amount, shipping_amount, totalAmount,
       shipping_address || null, notes || null]
    );

    for (const li of lineItems) {
      await conn.execute(
        `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, tax_rate, discount_pct, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, li
      );
    }

    // Update customer stats
    await conn.execute(
      `UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + ? WHERE id = ?`,
      [totalAmount, customer_id]
    );

    return { orderId, orderNumber, totalAmount };
  });

  logger.info('Order created', { orderId: result.orderId, orderNumber: result.orderNumber, user: req.user.id });
  res.status(201).json({ success: true, message: 'Order placed.', data: result });
});

// ─── Update Status ────────────────────────────────────────────
exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const { id }     = req.params;

  const validTransitions = {
    PENDING    : ['CONFIRMED', 'CANCELLED'],
    CONFIRMED  : ['PROCESSING', 'CANCELLED'],
    PROCESSING : ['SHIPPED', 'CANCELLED'],
    SHIPPED    : ['DELIVERED'],
    DELIVERED  : [],
    CANCELLED  : [],
    REFUNDED   : [],
  };

  const [[order]] = await query('SELECT status FROM orders WHERE id = ?', [id]);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

  if (!validTransitions[order.status]?.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot transition from ${order.status} to ${status}.`,
    });
  }

  const extra = {};
  if (status === 'SHIPPED')   extra.shipped_at   = 'NOW()';
  if (status === 'DELIVERED') extra.delivered_at = 'NOW()';

  let sql    = 'UPDATE orders SET status = ?';
  let params = [status];

  if (status === 'SHIPPED')   { sql += ', shipped_at = NOW()';   }
  if (status === 'DELIVERED') { sql += ', delivered_at = NOW()'; }

  // Release reserved inventory if cancelled
  if (status === 'CANCELLED') {
    await withTransaction(async (conn) => {
      await conn.execute(`${sql} WHERE id = ?`, [...params, id]);
      const [items] = await conn.execute('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [id]);
      for (const item of items) {
        await conn.execute(
          `UPDATE inventory SET quantity_reserved = GREATEST(0, quantity_reserved - ?) WHERE product_id = ?`,
          [item.quantity, item.product_id]
        );
      }
    });
  } else {
    await query(`${sql} WHERE id = ?`, [...params, id]);
  }

  // Deduct from on-hand when delivered
  if (status === 'DELIVERED') {
    const [items] = await query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [id]);
    await withTransaction(async (conn) => {
      for (const item of items) {
        await conn.execute(
          `UPDATE inventory
              SET quantity_on_hand  = quantity_on_hand  - ?,
                  quantity_reserved = GREATEST(0, quantity_reserved - ?)
            WHERE product_id = ?`,
          [item.quantity, item.quantity, item.product_id]
        );
        await conn.execute(
          `INSERT INTO inventory_transactions (id, product_id, user_id, type, quantity, reference_id)
           VALUES (?, ?, ?, 'SALE', ?, ?)`,
          [uuidv4(), item.product_id, req.user.id, -item.quantity, id]
        );
      }
    });
  }

  res.json({ success: true, message: `Order status updated to ${status}.` });
});

// ─── Dashboard Stats ──────────────────────────────────────────
exports.stats = asyncHandler(async (req, res) => {
  const [[revenue]] = await query(
    `SELECT
       SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total_amount ELSE 0 END)                         AS today_revenue,
       SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN total_amount ELSE 0 END)        AS week_revenue,
       SUM(CASE WHEN MONTH(created_at)=MONTH(NOW()) AND YEAR(created_at)=YEAR(NOW()) THEN total_amount ELSE 0 END) AS month_revenue,
       COUNT(CASE WHEN status = 'PENDING' THEN 1 END)    AS pending_orders,
       COUNT(CASE WHEN status = 'PROCESSING' THEN 1 END) AS processing_orders,
       COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) AS today_orders
     FROM orders`
  );

  const [[inventory]] = await query(
    `SELECT
       COUNT(*) AS total_products,
       SUM(CASE WHEN quantity_available <= reorder_point THEN 1 ELSE 0 END) AS low_stock_count,
       SUM(CASE WHEN quantity_available = 0 THEN 1 ELSE 0 END) AS out_of_stock_count
     FROM inventory`
  );

  const [topProducts] = await query(
    `SELECT p.name, SUM(oi.quantity) AS units_sold, SUM(oi.line_total) AS revenue
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o   ON oi.order_id   = o.id
      WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND o.status NOT IN ('CANCELLED','REFUNDED')
      GROUP BY p.id
      ORDER BY revenue DESC
      LIMIT 5`
  );

  const [dailySales] = await query(
    `SELECT DATE(created_at) AS date, COUNT(*) AS orders, SUM(total_amount) AS revenue
       FROM orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        AND status NOT IN ('CANCELLED','REFUNDED')
      GROUP BY DATE(created_at)
      ORDER BY date ASC`
  );

  res.json({
    success: true,
    data: { revenue, inventory, topProducts, dailySales },
  });
});
