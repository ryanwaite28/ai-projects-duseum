import '@testing-library/jest-dom'

// jsdom logs "Not implemented: navigation (except hash changes)" whenever a
// component does `window.location.href = url` in an onSuccess handler.
// The behaviour is harmless in tests, but the stderr noise obscures failures.
// Replace the setter with a no-op so the warning is silenced globally.
Object.defineProperty(window, 'location', {
  value:    { ...window.location, href: '' },
  writable: true,
})
