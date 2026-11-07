import jwt from 'jsonwebtoken';
import { db } from './db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_super_segura_deportes_2026';

export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      branchId: user.branch_id
    },
    JWT_SECRET,
    { expiresIn: '14d' }
  );
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso no autorizado: Token requerido.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Sesión inválida o expirada. Por favor inicie sesión nuevamente.' });
    }
    req.user = user;
    next();
  });
}

// Middleware to restrict access to specific roles (e.g. ['OWNER'])
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      // Log unauthorized attempt in audit log
      logAudit(req, {
        action: 'ACCESO_DENEGADO',
        targetEntity: 'security',
        targetId: req.path,
        reason: `Intento de acceso a ruta protegida con rol insuficiente: ${req.user?.role || 'DESCONOCIDO'}`
      });
      return res.status(403).json({ 
        error: 'Permiso denegado: Esta función está reservada exclusivamente para el Dueño/Administrador.' 
      });
    }
    next();
  };
}

// Audit logger helper
export function logAudit(req, { action, targetEntity, targetId = null, oldValues = null, newValues = null, reason = null }) {
  try {
    const timestamp = new Date().toISOString();
    const userId = req?.user?.id || null;
    const username = req?.user?.username || 'ANONIMO';
    const role = req?.user?.role || 'PUBLICO';
    const branchId = req?.user?.branchId || (req?.body?.branchId ? Number(req.body.branchId) : null);
    const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '127.0.0.1';
    const userAgent = req?.headers?.['user-agent'] || 'DESCONOCIDO';

    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        timestamp, user_id, username, role, branch_id, action, target_entity, target_id,
        old_values, new_values, reason, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      timestamp,
      userId,
      username,
      role,
      branchId,
      action,
      targetEntity,
      targetId ? String(targetId) : null,
      oldValues ? (typeof oldValues === 'string' ? oldValues : JSON.stringify(oldValues)) : null,
      newValues ? (typeof newValues === 'string' ? newValues : JSON.stringify(newValues)) : null,
      reason,
      ipAddress,
      userAgent
    );
  } catch (err) {
    console.error('Error al registrar auditoría:', err);
  }
}

