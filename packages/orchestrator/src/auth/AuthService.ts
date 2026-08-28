import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'taskforge-dev-secret-key';

export class AuthService {
    static generateToken(userId: string): string {
        return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '1h' });
    }

    static verifyToken(token: string): jwt.JwtPayload | null {
        try {
            return jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
        } catch (error) {
            return null;
        }
    }
}
