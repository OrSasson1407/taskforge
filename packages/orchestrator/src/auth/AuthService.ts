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

    // Worker-scoped credential (NFR-009: worker credentials distinct from user credentials).
    // Deliberately a single pre-shared WORKER_AUTH_TOKEN comparison rather than a JWT — that
    // is proportionate to the solo/4-month scope (Document 5, Part A). Per-worker credential
    // scoping is the named Phase 10 review item, not a Phase 3 concern. Unenforced (returns
    // true) when WORKER_AUTH_TOKEN isn't set, so local dev/test keeps working with no setup.
    static isValidWorkerCredential(token: string | undefined): boolean {
        const expected = process.env.WORKER_AUTH_TOKEN;
        if (!expected) return true;
        return token === expected;
    }
}