import typescript from 'rollup-plugin-typescript2';

export default {
  input: 'main.ts',
  output: {
    file: 'main.js',
    format: 'cjs'
  },
  external: ['obsidian'],
  plugins: [typescript()]
};