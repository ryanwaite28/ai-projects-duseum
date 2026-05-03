import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

// Vitest uses Vite's transform pipeline, which doesn't understand .html imports.
// esbuild handles them via --loader:.html=text at build time. This plugin
// replicates that behaviour for the Vitest environment: every *.html import
// becomes a JS module whose default export is the file's raw text content.
export const htmlAsTextPlugin: Plugin = {
  name: 'html-as-text',
  transform(_, id) {
    if (id.endsWith('.html')) {
      const content = readFileSync(id, 'utf-8')
      return { code: `export default ${JSON.stringify(content)}` }
    }
  },
}
