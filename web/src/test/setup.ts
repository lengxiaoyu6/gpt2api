import '@testing-library/jest-dom/vitest'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

Object.defineProperty(globalThis.URL, 'createObjectURL', {
  writable: true,
  value: () => 'blob:preview',
})

Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
  writable: true,
  value: () => {},
})
