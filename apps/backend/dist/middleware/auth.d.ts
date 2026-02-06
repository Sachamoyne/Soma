import { Request, Response, NextFunction } from "express";
/**
 * Middleware to authenticate requests using Supabase JWT token.
 * Validates the token via Supabase API and attaches user to req.user.
 */
export declare function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=auth.d.ts.map