import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import strip from '@rollup/plugin-strip';
import dts from 'rollup-plugin-dts';
import { defineConfig } from 'rollup';

const input = 'src/index.ts';
const sourcemap = true;

// Xóa console.log/debug/info khỏi production build, giữ lại console.warn/error
const stripPlugin = strip({
  functions: ['console.log', 'console.debug', 'console.info'],
  include: '**/*.ts',
});
const externalDeps = Object.keys({
  '@volcengine/rtc': '',
  'axios': '',
  'clipboard-copy': '',
  'crypto-js': '',
  'webrtc-adapter': '',
});

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
