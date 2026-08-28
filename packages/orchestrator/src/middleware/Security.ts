import { Request, Response, NextFunction } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
});

export const requireRole = (role: 'admin' | 'user') => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        if (!user) return res.status(401).json({ error: 'Unauthorized' });
        
        // Mock role check (assume 'test-admin' has admin role)
        const userRole = user.sub.includes('admin') ? 'admin' : 'user';
        if (role === 'admin' && userRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden: Requires admin privileges' });
        }
        next();
    };
};

export const auditLog = async (req: Request, action: string, targetId?: string) => {
    const db = getFirestore();
    const user = (req as any).user;
    await db.collection('audit_logs').add({
        timestamp: Date.now(),
        actor: user ? user.sub : 'anonymous',
        action,
        targetId,
        ip: req.ip,
        correlationId: req.headers['x-correlation-id']
    });
};
