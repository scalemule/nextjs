import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: [
      'src/index.ts', // Main client-side entry
      'src/client.ts', // Standalone client
      'src/server/index.ts', // Server-side entry
      'src/server/auth.ts', // 1-line auth route export
      'src/server/ledvery.ts', // Ledvery OIDC route factory
      'src/server/webhook-handler.ts', // Simplified webhook handler
      'src/testing.tsx', // Testing utilities
    ],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: false,
    clean: false,
    external: [
      '@scalemule/sdk',
      'react',
      'react-dom',
      'next',
      'next/headers',
      'next/server',
    ],
    treeshake: true,
    minify: false,
  },
  {
    entry: ['src/audio.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    clean: false,
    external: ['react', 'react-dom'],
    banner: { js: "'use client';" },
  },
])
