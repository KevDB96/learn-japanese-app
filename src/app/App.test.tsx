import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders the starter application shell', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Learn Japanese' })).toBeInTheDocument()
    expect(screen.getByText('Your learning path starts here.')).toBeInTheDocument()
  })
})
