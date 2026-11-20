import { ConsoleLogger, LoggerService, LogLevel } from '@nestjs/common';

/**
 * Structured logging: LOG_FORMAT=json prints one JSON object per line
 * ({ts, level, context, msg, ...}) for Loki / ELK / docker logs; default keeps Nest's
 * human-readable console output. LOG_LEVEL=debug|verbose|log|warn|error.
 */
export class JsonLogger implements LoggerService {
  constructor(private readonly levels: LogLevel[]) {}

  private write(level: LogLevel, message: unknown, rest: unknown[]) {
    if (!this.levels.includes(level)) return;
    const context = typeof rest[rest.length - 1] === 'string' ? (rest.pop() as string) : undefined;
    const line: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level: level === 'log' ? 'info' : level,
      context,
      msg: message instanceof Error ? message.message : typeof message === 'string' ? message : message,
    };
    if (level === 'error' && typeof rest[0] === 'string') line.stack = rest[0];
    const out = JSON.stringify(line);
    if (level === 'error' || level === 'fatal') process.stderr.write(out + '\n');
    else process.stdout.write(out + '\n');
  }

  log(message: unknown, ...rest: unknown[]) {
    this.write('log', message, rest);
  }
  error(message: unknown, ...rest: unknown[]) {
    this.write('error', message, rest);
  }
  warn(message: unknown, ...rest: unknown[]) {
    this.write('warn', message, rest);
  }
  debug(message: unknown, ...rest: unknown[]) {
    this.write('debug', message, rest);
  }
  verbose(message: unknown, ...rest: unknown[]) {
    this.write('verbose', message, rest);
  }
  fatal(message: unknown, ...rest: unknown[]) {
    this.write('fatal', message, rest);
  }
}

const ORDER: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

export function logLevels(level = process.env.LOG_LEVEL): LogLevel[] {
  const wanted = (level ?? 'log').toLowerCase() as LogLevel;
  const idx = ORDER.indexOf(wanted === ('info' as LogLevel) ? 'log' : wanted);
  return ORDER.slice(0, idx < 0 ? 4 : idx + 1);
}

export function createAppLogger(): LoggerService {
  const levels = logLevels();
  if ((process.env.LOG_FORMAT ?? '').toLowerCase() === 'json') return new JsonLogger(levels);
  const l = new ConsoleLogger();
  l.setLogLevels(levels);
  return l;
}
