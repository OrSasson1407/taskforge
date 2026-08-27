import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

export class AuthService {
  verifyToken(token: string): any {
    try {
      // Short-lived JWT verification[cite: 3]
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Unauthorized');
    }
  }

  generateToken(payload: any): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
  }
}
