'use strict';

const { body, param, query } = require('express-validator');

// ─── Auth ─────────────────────────────────────────────────────
exports.register = [
  body('first_name').trim().notEmpty().withMessage('First name required.').isLength({ max: 60 }),
  body('last_name').trim().notEmpty().withMessage('Last name required.').isLength({ max: 60 }),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required.'),
  body('password').isLength({ min: 8 }).withMessage('Password min 8 characters.')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain upper, lower, and digit.'),
];

exports.login = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

// ─── Products ─────────────────────────────────────────────────
exports.createProduct = [
  body('sku').trim().notEmpty().withMessage('SKU required.'),
  body('name').trim().notEmpty().isLength({ max: 200 }).withMessage('Product name required.'),
  body('category_id').isInt({ min: 1 }).withMessage('Valid category required.'),
  body('unit_price').isFloat({ min: 0 }).withMessage('Unit price must be >= 0.'),
  body('cost_price').isFloat({ min: 0 }).withMessage('Cost price must be >= 0.'),
  body('quantity_on_hand').optional().isInt({ min: 0 }),
];

exports.adjustInventory = [
  param('id').isUUID(),
  body('quantity').isInt().withMessage('Quantity must be an integer.'),
  body('type').optional().isIn(['PURCHASE','ADJUSTMENT','RETURN','TRANSFER']),
];

// ─── Orders ───────────────────────────────────────────────────
exports.createOrder = [
  body('customer_id').isUUID().withMessage('Valid customer ID required.'),
  body('items').isArray({ min: 1 }).withMessage('At least one item required.'),
  body('items.*.product_id').isUUID().withMessage('Valid product ID in each item.'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be >= 1.'),
  body('payment_method').optional().isIn(['CASH','CARD','UPI','BANK_TRANSFER','COD']),
  body('discount_amount').optional().isFloat({ min: 0 }),
  body('shipping_amount').optional().isFloat({ min: 0 }),
];

exports.updateStatus = [
  param('id').isUUID(),
  body('status').isIn(['CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED'])
    .withMessage('Invalid status.'),
];

// ─── Customers ────────────────────────────────────────────────
exports.createCustomer = [
  body('first_name').trim().notEmpty().isLength({ max: 60 }),
  body('last_name').trim().notEmpty().isLength({ max: 60 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().isMobilePhone(),
];
