import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages has no server-side rewrite rules: a request for a path that does
 * not map to a file on disk (a deep link, a hard refresh) is answered with
 * `404.html`. Lutcraft is a single-page client-side app, so shipping a copy of
 * the built `index.html` as `404.html` lets the app boot from any entry point
 * instead of showing GitHub's default 404 page.
 *
 * The copy runs in `closeBundle` so it always mirrors the *final* HTML after
 * Vite has injected the hashed script/style tags and applied `base`.
 */
const pagesSpaFallback = (): Plugin => {
  let outDir = 'dist';
  return {
    name: 'lutcraft-pages-spa-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const index = path.join(outDir, 'index.html');
      if (fs.existsSync(index)) {
        fs.copyFileSync(index, path.join(outDir, '404.html'));
      }
    },
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    // Served from https://<user>.github.io/image-to-lut-generator/ — the base
    // must match the repository name so hashed assets resolve under the subpath.
    base: '/image-to-lut-generator/',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), pagesSpaFallback()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
