type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = import.meta.env.DEV;

function formatData(data: unknown): string {
  try {
    const replacer = (_key: string, value: unknown) =>
      value instanceof Error ? { message: value.message, stack: value.stack } : value;
    return JSON.stringify(data, replacer);
  } catch {
    return '[Unserializable data]';
  }
}

function createLogger(module: string) {
  const log = (level: LogLevel, message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${module}]`;
    const formatted = data ? `${prefix} ${message} ${formatData(data)}` : `${prefix} ${message}`;

    // Send to main process for unified logging
    window.electronAPI?.log(formatted);

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
