import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import strip from '@rollup/plugin-strip';
import alias from '@rollup/plugin-alias';
import dts from 'rollup-plugin-dts';
import { defineConfig } from 'rollup';
import path from 'path';

const input = 'src/index.ts';
const sourcemap = true;

// Redirect @volcengine/rtc → vendored local copy so we can patch it
const aliasPlugin = alias({
  entries: [
    { find: '@volcengine/rtc', replacement: path.resolve('src/vendor/volcengine-rtc.esm.js') },
  ],
});

// Strip console.log/debug/info from production build
const stripPlugin = strip({
  functions: ['console.log', 'console.debug', 'console.info'],
  include: '**/*.ts',
});

// External deps for es/cjs (consumers install these themselves)
const externalDeps = ['axios', 'clipboard-copy', 'crypto-js', 'webrtc-adapter'];

export default defineConfig([
  {
    input,
    external: externalDeps,
    output: [
      {
        file: 'dist/index.es.js',
        format: 'es',
        sourcemap,
      },
      {
        file: 'dist/index.cjs.js',
        format: 'cjs',
        sourcemap,
      },
    ],
    plugins: [
      aliasPlugin,
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      json(),
      stripPlugin,
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        noEmitOnError: true,
      }),
    ],
  },
  {
    // iife bundle tất cả vào — không external
    input,
    output: {
      file: 'dist/index.global.js',
      format: 'iife',
      name: 'ArmcloudRTC',
      sourcemap,
    },
    plugins: [
      aliasPlugin,
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      json(),
      stripPlugin,
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        noEmitOnError: true,
      }),
    ],
  },
  {
    input,
    output: {
      file: 'dist/types/index.d.ts',
      format: 'es',
    },
    plugins: [dts()],
  },
]);
