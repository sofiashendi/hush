type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
}

const isDev = process.env.NODE_ENV !== 'production';

function formatLog(entry: LogEntry): string {
  const { timestamp, level, module, message, data } = entry;
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${module}]`;
  let dataStr = '';
  if (data) {
    try {
      const replacer = (_key: string, value: unknown) =>
        value instanceof Error ? { message: value.message, stack: value.stack } : value;
      dataStr = ` ${JSON.stringify(data, replacer)}`;
    } catch {
      dataStr = ' [Unserializable data]';
    }
  }
  return `${prefix} ${message}${dataStr}`;
}

function createLogger(module: string) {
  const log = (level: LogLevel, message: string, data?: unknown) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data,
    };

    const formatted = formatLog(entry);

    switch (level) {
      case 'debug':
        if (isDev) console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  };

  return {
    debug: (message: string, data?: unknown) => log('debug', message, data),
    info: (message: string, data?: unknown) => log('info', message, data),
    warn: (message: string, data?: unknown) => log('warn', message, data),
    error: (message: string, data?: unknown) => log('error', message, data),
  };
}

export { createLogger };
export type { LogLevel, LogEntry };
