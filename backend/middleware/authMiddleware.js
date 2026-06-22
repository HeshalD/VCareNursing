const jwt = require('jsonwebtoken');
const db = require('../config/db');

// ── Permission cache ──────────────────────────────────────────────────────────
// Avoids a DB round-trip on every protected request.
// Entries expire after 5 minutes or are explicitly invalidated on permission changes.
const _permCache = new Map(); // userId -> { perms: Set<string>, cachedAt: number }
const CACHE_TTL = 5 * 60 * 1000;

function _parseRoles(rawRole) {
  if (Array.isArray(rawRole)) {
    return rawRole.map(r => (typeof r === 'string' ? r.replace(/\{|\}/g, '').trim() : String(r)));
  }
  if (typeof rawRole === 'string') {
    return rawRole.replace(/\{|\}/g, '').split(',').map(r => r.trim()).filter(Boolean);
  }
  return [];
}

exports.invalidatePermissionCache = (userId) => {
  _permCache.delete(userId);
};

// LAYER 3: Does the user have a specific permission?
// Usage: requirePermission('BOOKING_SWAP_STAFF')
// SUPER_ADMIN always passes. All others are checked against staff_permissions.
exports.requirePermission = (permissionKey) => async (req, res, next) => {
  try {
    const roles = _parseRoles(req.user.role);
    if (roles.includes('SUPER_ADMIN')) return next();

    const userId = req.user.user_id;
    const now = Date.now();
    let cached = _permCache.get(userId);

    if (!cached || now - cached.cachedAt > CACHE_TTL) {
      const result = await db.query(
        'SELECT permission_key FROM staff_permissions WHERE user_id = $1',
        [userId]
      );
      cached = {
        perms: new Set(result.rows.map(r => r.permission_key)),
        cachedAt: now,
      };
      _permCache.set(userId, cached);
    }

    if (!cached.perms.has(permissionKey)) {
      return res.status(403).json({ message: 'Permission Denied: You do not have access to this action.' });
    }
    next();
  } catch (err) {
    console.error('requirePermission error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Sessions for device-bound logins are checked on every request so a revoked
// device or a force-logout takes effect immediately, not just at next login.
const LAST_SEEN_THROTTLE_MS = 60 * 1000;

// LAYER 1: Is the user logged in?
exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ message: 'You are not logged in.' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists
    const user = await db.query('SELECT user_id, role FROM users WHERE user_id = $1', [decoded.id]);

    if (user.rows.length === 0) {
      return res.status(401).json({ message: 'The user belonging to this token no longer exists.' });
    }

    if (decoded.jti) {
      const session = await db.query(
        'SELECT is_active, last_seen_at FROM staff_sessions WHERE jti = $1',
        [decoded.jti]
      );

      if (!session.rows.length || !session.rows[0].is_active) {
        return res.status(401).json({ message: 'This session has been ended. Please log in again.' });
      }

      const staleFor = Date.now() - new Date(session.rows[0].last_seen_at).getTime();
      if (staleFor > LAST_SEEN_THROTTLE_MS) {
        db.query('UPDATE staff_sessions SET last_seen_at = NOW() WHERE jti = $1', [decoded.jti])
          .catch(err => console.error('staff_sessions last_seen_at update failed:', err));
      }
    }

    // Grant access to the protected route
    req.user = user.rows[0];
    if (decoded.jti) req.user.jti = decoded.jti;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token. Please log in again.' });
  }
};

// LAYER 2: Do they have the right Role? (e.g., SUPER_ADMIN)
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    const rawRole = req.user.role;

    let cleanedUserRoles;
    if (Array.isArray(rawRole)) {
      // pg parsed the enum[] as a proper JS array
      cleanedUserRoles = rawRole.map(r =>
        typeof r === 'string' ? r.replace(/\{|\}/g, '').trim() : String(r)
      );
    } else if (typeof rawRole === 'string') {
      // pg returned the enum[] as a PostgreSQL literal: "{NURSE,CARETAKER}" or "NURSE"
      cleanedUserRoles = rawRole
        .replace(/\{|\}/g, '')
        .split(',')
        .map(r => r.trim())
        .filter(Boolean);
    } else {
      cleanedUserRoles = [];
    }

    const hasRequiredRole = roles.some(requiredRole =>
      cleanedUserRoles.includes(requiredRole)
    );

    if (!hasRequiredRole) {
      return res.status(403).json({
        message: 'Permission Denied: You do not have access to this action.'
      });
    }
    next();
  };
};