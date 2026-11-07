import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function loadDotEnvIntoProcess(mode: string) {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined && value !== '') {
      process.env[key] = value;
    }
  }
  for (const file of ['.env.local', '.env']) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const [, k, rawVal] = m;
      const val = rawVal.replace(/^["']|["']$/g, '');
      if (!process.env[k] && val !== '') {
        process.env[k] = val;
      }
    }
  }
}

function vercelApiLocalPlugin(): Plugin {
  return {
    name: 'vercel-api-local',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/') && url !== '/api') {
          return next();
        }
        // If DATABASE_URL is not configured locally, let Vite's proxy forward to remote
        if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
          return next();
        }

        try {
          const parsedUrl = new URL(url, `http://${req.headers.host || 'localhost'}`);
          const query: Record<string, string> = {};
          parsedUrl.searchParams.forEach((v, k) => {
            query[k] = v;
          });

          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          }
          const rawBody = Buffer.concat(chunks).toString('utf8');
          let body: unknown = undefined;
          if (rawBody.trim()) {
            try {
              body = JSON.parse(rawBody);
            } catch {
              body = rawBody;
            }
          }

          const vercelReq = Object.assign(req, { query, body });
          const vercelRes = Object.assign(res, {
            status(code: number) {
              res.statusCode = code;
              return vercelRes;
            },
            json(payload: unknown) {
              if (!res.headersSent) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
              }
              res.end(JSON.stringify(payload));
              return vercelRes;
            },
            send(payload: unknown) {
              res.end(typeof payload === 'string' || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload));
              return vercelRes;
            },
          });

          const mod = await server.ssrLoadModule('/api/handler.ts');
          await mod.default(vercelReq, vercelRes);
        } catch (err) {
          console.error('[vite-api]', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  loadDotEnvIntoProcess(mode);
  const remoteTarget = process.env.REMOTE_API_URL || 'https://konstructum-gems.vercel.app';

  return {
    plugins: [
      react({
        // React 17 does not ship the automatic JSX runtime, so the classic
        // transform is required. This matches the SPFx build exactly.
        jsxRuntime: 'classic',
      }),
      vercelApiLocalPlugin(),
    ],
    build: {
      outDir: 'dist',
      sourcemap: true,
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            mui: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          },
        },
      },
    },
    server: {
      port: 4322,
      proxy: {
        '/api': {
          target: remoteTarget,
          changeOrigin: true,
          secure: true,
          cookieDomainRewrite: 'localhost',
        },
      },
    },
  };
});
