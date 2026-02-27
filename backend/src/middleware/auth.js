import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Token lipsă' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalid sau expirat' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acces doar pentru admin' });
  }
  next();
}

export function requireBranchAccess(branchIdParam = 'branchId') {
  return (req, res, next) => {
    if (req.user?.role === 'admin') return next();
    const branchId = parseInt(req.params[branchIdParam] || req.body?.branch_id || req.query?.branch_id, 10);
    if (req.user?.branch_id !== branchId) {
      return res.status(403).json({ error: 'Nu aveți acces la această sucursală' });
    }
    next();
  };
}

export async function loadUser(req, res, next) {
  if (!req.user?.id) return next();
  try {
    const r = await query(
      'SELECT id, email, role, branch_id, full_name FROM users WHERE id = $1',
      [req.user.id]
    );
    if (r.rows[0]) req.userProfile = r.rows[0];
  } catch (e) {
    // ignore
  }
  next();
}
