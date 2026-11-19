import { randomUUID } from 'crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { recordHttpRequest } from '../metrics/metrics';

/** L8: accept only sane client request ids (no log injection / unbounded values). */
export const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;

export type RequestWithId = Request & { requestId?: string };

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const start = Date.now();
    res.on('finish', () => {
      const user = (
        req as RequestWithId & { user?: { id?: string; role?: string; tenantId?: string | null } }
      ).user;
      const ms = Date.now() - start;
      const path = req.originalUrl?.split('?')[0] ?? req.url;
      recordHttpRequest(req.method, path, res.statusCode, ms / 1000);
      const line = {
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        msg: 'http_request',
        requestId,
        method: req.method,
        path,
        status: res.statusCode,
        ms,
        // L8: tenant from the authenticated principal, never from a client header
        tenantId: user?.tenantId ?? undefined,
        userId: user?.id,
        role: user?.role,
      };
      // Structured JSON for self-hosted log aggregation
      console.log(JSON.stringify(line));
    });

    next();
  }
}
