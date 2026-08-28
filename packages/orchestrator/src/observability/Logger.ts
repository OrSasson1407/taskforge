import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const Logger = {
    info: (msg: string, meta: any = {}) => console.log(JSON.stringify({ level: 'info', timestamp: new Date().toISOString(), msg, ...meta })),
    error: (msg: string, meta: any = {}) => console.error(JSON.stringify({ level: 'error', timestamp: new Date().toISOString(), msg, ...meta }))
};

export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const correlationId = req.headers['x-correlation-id'] || uuidv4();
    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    
    // Log the incoming request
    Logger.info('Incoming request', { 
        method: req.method, 
        path: req.path, 
        correlationId 
    });
    
    next();
};
