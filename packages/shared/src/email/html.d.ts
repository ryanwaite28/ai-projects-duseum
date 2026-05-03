// TypeScript declaration for .html template imports.
// esbuild resolves these as inlined text strings via --loader:.html=text.
declare module '*.html' {
  const content: string
  export default content
}
