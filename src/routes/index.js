'use strict';

const router = require('express').Router();

// Controllers
const authCtrl      = require('../controllers/authController');
const productCtrl   = require('../controllers/productController');
const orderCtrl     = require('../controllers/orderController');
const inventoryCtrl = require('../controllers/inventoryController');
const customerCtrl  = require('../controllers/customerController');

// Middleware
const { authenticate, authorize }          = require('../middleware/auth');
const { validate, notFound, errorHandler } = require('../middleware/errorHandler');
const validators                           = require('../utils/validators');

// ─── Auth ─────────────────────────────────────────────────────
router.post('/auth/register',        validators.register,       validate, authCtrl.register);
router.post('/auth/login',           validators.login,          validate, authCtrl.login);
router.get ('/auth/me',              authenticate,                         authCtrl.me);
router.put ('/auth/change-password', authenticate,                         authCtrl.changePassword);

// ─── Products ─────────────────────────────────────────────────
router.get   ('/products',             authenticate,                                                  productCtrl.list);
router.get   ('/products/:id',         authenticate,                                                  productCtrl.getById);
router.post  ('/products',             authenticate, authorize('admin','manager'), validators.createProduct,    validate, productCtrl.create);
router.patch ('/products/:id',         authenticate, authorize('admin','manager'),                    productCtrl.update);
router.delete('/products/:id',         authenticate, authorize('admin'),                              productCtrl.remove);
router.post  ('/products/:id/adjust',  authenticate, authorize('admin','manager'), validators.adjustInventory, validate, productCtrl.adjustInventory);

// ─── Orders ───────────────────────────────────────────────────
router.get  ('/orders',           authenticate,                                                 orderCtrl.list);
router.get  ('/orders/stats',     authenticate, authorize('admin','manager'),                   orderCtrl.stats);
router.get  ('/orders/:id',       authenticate,                                                 orderCtrl.getById);
router.post ('/orders',           authenticate, validators.createOrder,  validate,              orderCtrl.create);
router.patch('/orders/:id/status',authenticate, validators.updateStatus, validate,              orderCtrl.updateStatus);

// ─── Inventory ────────────────────────────────────────────────
router.get('/inventory',              authenticate,                        inventoryCtrl.list);
router.get('/inventory/alerts',       authenticate,                        inventoryCtrl.alerts);
router.get('/inventory/transactions', authenticate,                        inventoryCtrl.transactions);

// ─── Customers ────────────────────────────────────────────────
router.get  ('/customers',     authenticate,                                                        customerCtrl.list);
router.get  ('/customers/:id', authenticate,                                                        customerCtrl.getById);
router.post ('/customers',     authenticate, validators.createCustomer, validate,                   customerCtrl.create);
router.patch('/customers/:id', authenticate, authorize('admin','manager'),                          customerCtrl.update);

// ─── Health ───────────────────────────────────────────────────
router.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

module.exports = router;
