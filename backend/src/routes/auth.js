import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { query } from '../config/db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('role').optional().isIn(['admin', 'manager']),
    body('branch_id').optional().isInt(),
    body('full_name').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { email, password, role = 'manager', branch_id, full_name } = req.body;
      const password_hash = await bcrypt.hash(password, 10);
      await query(
        `INSERT INTO users (email, password_hash, role, branch_id, full_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [email, password_hash, role, branch_id || null, full_name || null]
      );
      const r = await query(
        'SELECT id, email, role, branch_id, full_name FROM users WHERE email = $1',
        [email]
      );
      res.status(201).json({ user: r.rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Email deja folosit' });
      res.status(500).json({ error: err.message });
    }
  }
);

router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').exists()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { email, password } = req.body;
      const r = await query(
        'SELECT id, email, password_hash, role, branch_id, full_name FROM users WHERE email = $1',
        [email]
      );
      const user = r.rows[0];
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ error: 'Email sau parolă incorectă' });
      }
      const token = jwt.sign(
        { id: user.id, role: user.role, branch_id: user.branch_id },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );
      delete user.password_hash;
      res.json({ token, user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const r = await query(
      'SELECT id, email, role, branch_id, full_name FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Utilizator negăsit' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
