const { createServer } = require('http');
const { parse } = require('url');
const path = require('path');
const fs = require('fs');
const next = require('next');

const logFile = path.join(__dirname, 'server-debug.log');
function debugLog(...args) {
  const msg = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  try { fs.appendFileSync(logFile, msg); } catch {}
  console.log(...args);
}

// Log lifecycle events
process.on('exit', (code) => {
  debugLog('PROCESS EXIT EVENT, code:', code);
});
process.on('beforeExit', (code) => {
  debugLog('PROCESS BEFORE EXIT EVENT, code:', code);
});
['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'].forEach((sig) => {
  process.on(sig, () => {
    debugLog('RECEIVED SIGNAL:', sig);
  });
});
process.on('uncaughtException', (err, origin) => {
  debugLog('UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err, 'origin:', origin);
});
process.on('unhandledRejection', (reason, promise) => {
  debugLog('UNHANDLED REJECTION:', reason);
});

// Intercept process.exit to catch caller stack trace
const origExit = process.exit;
process.exit = function(code) {
  debugLog('INTERCEPTED process.exit CALL with code:', code, '\nStack trace:\n', new Error().stack);
  return origExit.call(process, code);
};

const hasBuild = fs.existsSync(path.join(__dirname, '.next'));
const dev = false; // Always use production build for server stability
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

debugLog('Initializing Next.js app with dev=' + dev + ' hasBuild=' + hasBuild);

const app = next({ dev, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

// Keep an active timer on the event loop that is NEVER unref'd
setInterval(() => {
  // heartbeat
}, 10000);

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      debugLog('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  server.on('error', (err) => {
    debugLog('HTTP SERVER ERROR:', err);
  });

  server.on('close', () => {
    debugLog('HTTP SERVER CLOSED!', new Error().stack);
  });

  server.listen(port, hostname, () => {
    debugLog(`Next.js server listening on http://${hostname}:${port}`);
  });
}).catch((err) => {
  debugLog('Failed to start Next.js server:', err);
  process.exit(1);
});
