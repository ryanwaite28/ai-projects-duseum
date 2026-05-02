// =============================================================================
// frontend/src/test/test-utils.tsx
// Shared render wrapper for component tests.
// Provides QueryClientProvider (retry disabled) + MemoryRouter.
// =============================================================================

import { type RenderOptions, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type React from 'react'

export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries:   { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })

const makeWrapper = (initialPath = '/') =>
  function TestWrapper({ children }: { children: React.ReactNode }) {
    const queryClient = createTestQueryClient()
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }

const customRender = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { initialPath?: string }
) => {
  const { initialPath, ...renderOptions } = options ?? {}
  return render(ui, { wrapper: makeWrapper(initialPath), ...renderOptions })
}

export * from '@testing-library/react'
export { customRender as render }
