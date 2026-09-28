import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from './App'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('App navigation shell', () => {
  it('starts on Learn with labelled destinations and semantic landmarks', () => {
    render(<App />)

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Learn Japanese' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Learn' })).toHaveAttribute('aria-current', 'page')
    for (const label of ['Practice', 'Progress', 'More']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('changes active destination and restores it from the URL hash', () => {
    render(<App />)

    const navigation = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    fireEvent.click(navigation.getByRole('button', { name: 'Practice' }))
    expect(screen.getByRole('heading', { name: 'Practice' })).toBeInTheDocument()
    expect(navigation.getByRole('button', { name: 'Practice' })).toHaveAttribute('aria-current', 'page')
    expect(window.location.hash).toBe('#practice')

    window.history.replaceState(null, '', '#progress')
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument()
    expect(navigation.getByRole('button', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
  })

  it('offers Continue for the first eligible lesson and opens it', async () => {
    render(<App />)

    const continueButton = await screen.findByRole('button', { name: 'Continue' })
    fireEvent.click(continueButton)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Welcome to Japanese' })).toBeInTheDocument()
    expect(screen.queryByText(/due|review count/i)).not.toBeInTheDocument()
  })
})
