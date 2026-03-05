'use strict';

const jwt     = require('jsonwebtoken');
const { query } = require('../config/database');
const logger  = require('../config/logger');

// ─── Verify JWT Token ─────────────────────────────────────────
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access token required.' });
    }

    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user + role on every request (no stale permission cache)
    const [rows] = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.is_active,
              r.name AS role, r.permissions
         FROM users u JOIN roles r ON u.role_id = r.id
        WHERE u.id = ?`,
      [decoded.sub]
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ success: false, message: 'User not found or inactive.' });
    }

    req.user = {
      id         : rows[0].id,
      name       : `${rows[0].first_name} ${rows[0].last_name}`,
      email      : rows[0].email,
      role       : rows[0].role,
      permissions: rows[0].permissions,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired.' });
    }
    logger.warn('Auth failed', { error: err.message });
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

// ─── Role Guard ───────────────────────────────────────────────
/**
 * authorize('admin', 'manager')  — at least one role must match
 */
const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }
  if (!allowedRoles.includes(req.user.role)) {
    logger.warn('Forbidden access attempt', { user: req.user.id, role: req.user.role, required: allowedRoles });
    return res.status(403).json({ success: false, message: 'Insufficient permissions.' });
  }
  next();
};

// ─── Permission Guard ─────────────────────────────────────────
/**
 * requirePermission('orders', 'w')  — resource + 'r' or 'w' or 'rw'
 */
const requirePermission = (resource, access) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }

  const perms = req.user.permissions;
  if (perms.all === true) return next();  // admin bypass

  const resourcePerm = perms[resource];
  if (!resourcePerm || !resourcePerm.includes(access)) {
    return res.status(403).json({ success: false, message: `No '${access}' permission on '${resource}'.` });
  }
  next();
};

module.exports = { authenticate, authorize, requirePermission };
