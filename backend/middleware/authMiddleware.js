const jwt = require('jsonwebtoken');
const db = require('../config/db');

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

    // Grant access to the protected route
    req.user = user.rows[0];
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