import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  localStorage.clear()
})

beforeEach(() => localStorage.setItem('learn-japanese.last-profile', 'kevin'))

describe('App navigation shell', () => {
  it('opens the two-profile picker and starts Learn for the selected profile', async () => {
    localStorage.clear()
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Choose a profile' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Kevin Moonlit sakura garden/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Janne Faerie blossom garden/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Kevin/ }).querySelector('img')).toHaveAttribute('src', '/assets/avatars/kevin.webp')
    expect(screen.getByRole('button', { name: /Janne/ }).querySelector('img')).toHaveAttribute('src', '/assets/avatars/janne.webp')
    fireEvent.click(screen.getByRole('button', { name: /Janne Faerie blossom garden/ }))
    expect(screen.getByRole('heading', { name: 'Learn Japanese' })).toBeInTheDocument()
    expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'janne')
    expect(localStorage.getItem('learn-japanese.last-profile')).toBe('janne')
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Learn Japanese' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Learn' })).toHaveAttribute('aria-current', 'page')
    await screen.findByRole('region', { name: 'Daily study card' })
    expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument()
    expect(screen.queryByText('YOUR FIRST COURSE')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    for (const label of ['Practice', 'Progress']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
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

  it('uses the selected profile artwork and renders the Practice and More destinations', async () => {
    render(<App />)
    await screen.findByRole('region', { name: 'Daily study card' })
    fireEvent.click(screen.getByRole('button', { name: 'Practice' }))
    expect(screen.getByRole('heading', { name: 'Kana practice' })).toBeInTheDocument()
    expect(document.querySelector('.activity-card img')).toHaveAttribute('src', '/assets/activities/practice-kevin.webp')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument()
    expect(screen.getByText('Device only')).toBeInTheDocument()
  })

  it('opens directly on a flashcard and reveals ratings only after Show answer', async () => {
    render(<App />)
    const card = await screen.findByRole('region', { name: 'Daily study card' })
    expect(within(card).getByRole('heading')).toBeInTheDocument()
    expect(within(card).queryByRole('group', { name: 'Review rating' })).not.toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Show answer' }))
    expect(within(card).getByRole('group', { name: 'Review rating' })).toBeInTheDocument()
    expect(['Again', 'Hard', 'Good', 'Easy'].map((label) => within(card).getByRole('button', { name: new RegExp(`^${label}$`) }))).toHaveLength(4)
  })

  it('restores the last selected profile and switches themes immediately', () => {
    localStorage.setItem('learn-japanese.last-profile', 'kevin')
    render(<App />)
    expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'kevin')
    fireEvent.click(screen.getByRole('button', { name: /Switch profile from Kevin/ }))
    expect(screen.getByRole('heading', { name: 'Choose a profile' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Janne Faerie blossom garden/ }))
    expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'janne')
  })
})
