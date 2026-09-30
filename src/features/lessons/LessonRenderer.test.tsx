import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { contentCatalog } from '../../lib/content/catalog.ts'
import type { ContentId, LessonBlock } from '../../lib/content/types.ts'
import { InvalidLessonBlockError, LessonRenderer, renderLessonBlock } from './LessonRenderer.tsx'

describe('lesson block renderer', () => {
  const id = (value: string) => value as ContentId
  it('dispatches reusable block kinds and distinguishes Japanese, reading, and translation', () => {
    const block: LessonBlock = { id: id('example'), kind: 'japanese-example', japanese: 'こんにちは', reading: 'konnichiwa', translation: 'Hello' }
    render(<>{renderLessonBlock(block)}</>)
    expect(screen.getByText('こんにちは')).toHaveAttribute('lang', 'ja')
    expect(screen.getByText('konnichiwa')).toHaveAttribute('lang', 'ja-Latn')
    expect(screen.getByText('Hello')).toHaveAttribute('lang', 'en')
    expect(renderLessonBlock({ id: id('title'), kind: 'heading', text: 'Title' })).toBeTruthy()
  })

  it('reports unknown kinds with a deterministic developer error', () => {
    expect(() => renderLessonBlock({ id: id('bad-block'), kind: 'corrupt' })).toThrowError(new InvalidLessonBlockError('bad-block', 'corrupt'))
  })

  it('renders canonical lesson blocks in authored content order', () => {
    const lesson = contentCatalog.lessons.find((item) => item.id === 'introduction')!
    render(<LessonRenderer lesson={lesson} />)
    const article = screen.getByRole('article', { name: 'Welcome to Japanese' })
    const ids = within(article).getAllByText(/Welcome to Japanese|Japanese uses three writing systems|こんにちは|Romaji \(Japanese written with Latin letters\)|How learning works/)
      .map((element) => element.closest('[data-block-id]')?.getAttribute('data-block-id'))
    expect(ids).toEqual(['intro-title', 'writing-systems', 'hiragana-example', 'romaji-note', 'learning-model', 'intro-exercises'])
  })

  it('explains sentence annotations and links each concept to its teaching lesson', () => {
    const lesson = contentCatalog.lessons.find((item) => item.id === 'hiragana-k-row')!
    const onOpenLesson = vi.fn()
    render(<LessonRenderer lesson={lesson} catalog={contentCatalog} onOpenLesson={onOpenLesson} />)
    fireEvent.click(screen.getByText('Explain'))
    const panel = screen.getByText('Love.').closest('details')!
    expect(within(panel).getAllByText('あい')).toHaveLength(4)
    expect(within(panel).getByText(/あ: Hiragana あ/)).toBeInTheDocument()
    fireEvent.click(within(panel).getAllByRole('button', { name: 'Review Hiragana A row' })[0]!)
    expect(onOpenLesson).toHaveBeenCalledWith('hiragana-a-row')
  })
})
