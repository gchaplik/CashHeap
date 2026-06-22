import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep better-sqlite3 on the server only — it's a native Node module
  serverExternalPackages: ['better-sqlite3'],

  // Pin the project root so Turbopack doesn't pick up a stray
  // package-lock.json in a parent directory and corrupt module IDs.
  turbopack: {
    root: __dirname,
  },

  experimental: {
    serverActions: { bodySizeLimit: '100mb' },
  },
};

export default nextConfig;
