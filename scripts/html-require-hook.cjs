/**
 * CJS require hook — teaches tsx to load .html files as plain text strings.
 *
 * esbuild handles this via --loader:.html=text at Lambda build time.
 * Vitest handles this via the htmlAsTextPlugin (vitest.html-plugin.ts).
 * This hook covers the tsx dev server, which has no equivalent loader.
 *
 * Registered via: tsx --require ./scripts/html-require-hook.cjs
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs     = require('fs')

Module._extensions['.html'] = function (mod, filename) {
  const content = fs.readFileSync(filename, 'utf-8')
  mod._compile(
    `Object.defineProperty(exports,"__esModule",{value:true});exports.default=${JSON.stringify(content)};`,
    filename
  )
}
