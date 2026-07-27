import { randomUUID } from 'crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export type RequestWithId = Request & { requestId?: string };

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const start = Date.now();
    res.on('finish', () => {
      const line = {
        level: 'info',
        msg: 'http_request',
        requestId,
        method: req.method,
        path: req.originalUrl?.split('?')[0] ?? req.url,
        status: res.statusCode,
        ms: Date.now() - start,
      };
      // Structured JSON for self-hosted log aggregation
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(line));
    });

    next();
  }
}
