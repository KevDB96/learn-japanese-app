import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExerciseDefinition } from '../../lib/content/types.ts'
import { evaluateExerciseAnswer, ExerciseRendererView, ExerciseSlot, normalizeExerciseAnswer } from './ExerciseEngine.tsx'

const feedback = { success: 'Good.', explanation: 'Katakana is used for borrowed words.' }
const choice: ExerciseDefinition = { id: 'choice-check' as ExerciseDefinition['id'], type: 'multiple-choice', prompt: 'Choose the script', options: ['Hiragana', 'Katakana'], answer: 'Katakana', feedback }
const kana: ExerciseDefinition = { ...choice, id: 'kana-check' as ExerciseDefinition['id'], type: 'character-selection', prompt: 'Choose kana', options: ['あ', 'ア'], answer: 'あ' }
const text: ExerciseDefinition = { id: 'text-check' as ExerciseDefinition['id'], type: 'short-text', prompt: 'Write it', answer: 'こんにちは', acceptedAnswers: [' こんにちは '], feedback, normalizeWhitespace: true }

describe('lesson exercises', () => {
  it('dispatches all content-defined types and handles correct, incorrect, retry and one-time completion', () => {
    const onComplete = vi.fn()
    const { rerender } = render(<ExerciseRendererView exercise={choice} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hiragana' }))
    expect(screen.getByRole('status')).toHaveTextContent(feedback.explanation)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Katakana' }))
    expect(screen.getByRole('status')).toHaveTextContent('Good.')
    expect(onComplete).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onComplete).toHaveBeenCalledTimes(1)

    rerender(<ExerciseRendererView exercise={kana} />)
    fireEvent.click(screen.getByRole('button', { name: 'あ' }))
    expect(screen.getByRole('status')).toHaveTextContent('Good.')
    rerender(<ExerciseRendererView exercise={text} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: ' こんにちは ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(screen.getByRole('status')).toHaveTextContent('Good.')
  })

  it('trims boundaries, collapses whitespace only when declared, and accepts only explicit variants', () => {
    expect(normalizeExerciseAnswer('  a   b  ')).toBe('a   b')
    expect(normalizeExerciseAnswer('  a   b  ', true)).toBe('a b')
    expect(evaluateExerciseAnswer(text, 'こんにちは')).toBe(true)
    expect(evaluateExerciseAnswer(text, 'こん にちは')).toBe(false)
    expect(evaluateExerciseAnswer({ ...text, acceptedAnswers: undefined, normalizeWhitespace: false }, ' こんにちは ')).toBe(true)
  })

  it('renders the three Introduction exercise definitions through the slot registry', () => {
    render(<ExerciseSlot title="Quick check" exercises={[choice, kana, text]} />)
    expect(screen.getByRole('button', { name: 'Hiragana' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'あ' })).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
  })
})
