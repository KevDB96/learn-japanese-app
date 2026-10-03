import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExerciseDefinition } from '../../lib/content/types.ts'
import { eligiblePracticeExercises, evaluateExerciseAnswer, evaluateSentenceOrder, ExerciseRendererView, ExerciseSlot, normalizeExerciseAnswer } from './ExerciseEngine.tsx'

afterEach(cleanup)

const feedback = { success: 'Good.', explanation: 'Katakana is used for borrowed words.' }
const choice: ExerciseDefinition = { id: 'choice-check' as ExerciseDefinition['id'], type: 'multiple-choice', prompt: 'Choose the script', options: ['Hiragana', 'Katakana'], answer: 'Katakana', feedback }
const kana: ExerciseDefinition = { ...choice, id: 'kana-check' as ExerciseDefinition['id'], type: 'character-selection', prompt: 'Choose kana', options: ['あ', 'ア'], answer: 'あ' }
const text: ExerciseDefinition = { id: 'text-check' as ExerciseDefinition['id'], type: 'short-text', prompt: 'Write it', answer: 'こんにちは', acceptedAnswers: [' こんにちは '], feedback, normalizeWhitespace: true }
const cloze: ExerciseDefinition = { id: 'cloze-check' as ExerciseDefinition['id'], type: 'cloze', prompt: 'Complete the sentence', before: '猫は学生', after: '。', answer: 'です', acceptedAnswers: ['で す'], explanation: 'です completes the polite sentence.', feedback }
const sentenceOrder: Extract<ExerciseDefinition, { type: 'sentence-order' }> = { id: 'sentence-order-check' as ExerciseDefinition['id'], type: 'sentence-order', prompt: 'Build the sentence', chunks: [{ id: 'topic', japanese: '猫は', reading: 'ねこは', meaning: 'As for the cat' }, { id: 'description', japanese: '学生', reading: 'がくせい', meaning: 'student' }, { id: 'ending', japanese: 'です。', reading: 'です。', meaning: 'polite copula and ending' }], answerOrder: ['topic', 'description', 'ending'], acceptedOrders: [['description', 'topic', 'ending']], explanation: 'The topic comes first, followed by its description and the polite ending.', feedback }

describe('lesson exercises', () => {
  it("supports audio-led choices and reports missing clips while keeping answer controls available", async () => {
    const audio: ExerciseDefinition = { id: 'audio-check' as ExerciseDefinition['id'], type: 'audio-choice', prompt: 'Choose the meaning', audioId: 'missing-audio', target: 'meaning', options: ['cat', 'water'], answer: 'cat', feedback }
    const onComplete = vi.fn()
    render(<ExerciseRendererView exercise={audio} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: 'cat' }))
    expect(screen.getByRole('status')).toHaveTextContent('Good.')
    expect(onComplete).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }))
    expect(await screen.findByText('Audio unavailable')).toBeInTheDocument()
  })

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

  it('renders cloze context intact and accepts only authored kana/kanji alternatives', () => {
    render(<ExerciseRendererView exercise={cloze} />)
    expect(screen.getByText('猫は学生', { exact: false })).toBeInTheDocument()
    expect(evaluateExerciseAnswer(cloze, ' です ')).toBe(true)
    expect(evaluateExerciseAnswer(cloze, 'で す')).toBe(true)
    expect(evaluateExerciseAnswer({ ...cloze, answer: '猫', acceptedAnswers: ['ねこ'] }, 'ねこ')).toBe(true)
    expect(evaluateExerciseAnswer({ ...cloze, answer: '猫', acceptedAnswers: ['ねこ'] }, 'ネコ')).toBe(false)
    expect(evaluateExerciseAnswer(cloze, 'です。')).toBe(false)
  })

  it('shows concise cloze context after a wrong lesson answer and allows retry', () => {
    render(<ExerciseRendererView exercise={cloze} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Missing text' }), { target: { value: 'ます' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(screen.getByRole('status')).toHaveTextContent(cloze.explanation)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByRole('textbox', { name: 'Missing text' })).toHaveValue('')
  })

  it('reports a wrong chosen option with the exercise identity for confusion tracking', () => {
    const onIncorrect = vi.fn()
    render(<ExerciseRendererView exercise={choice} onIncorrect={onIncorrect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hiragana' }))
    expect(onIncorrect).toHaveBeenCalledWith(choice, 'Hiragana')
    cleanup()
  })

  it('accepts only complete authored sentence orderings and renders accessible touch construction with a breakdown', () => {
    expect(evaluateSentenceOrder(sentenceOrder, ['topic', 'description', 'ending'])).toBe(true)
    expect(evaluateSentenceOrder(sentenceOrder, ['description', 'topic', 'ending'])).toBe(true)
    expect(evaluateSentenceOrder(sentenceOrder, ['topic', 'ending', 'description'])).toBe(false)
    expect(evaluateSentenceOrder(sentenceOrder, ['topic', 'description'])).toBe(false)
    const onComplete = vi.fn()
    render(<ExerciseRendererView exercise={sentenceOrder} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: '学生' }))
    fireEvent.click(screen.getByRole('button', { name: '猫は' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move 猫は earlier' }))
    expect(screen.getByLabelText('Sentence in progress')).toHaveTextContent('猫は学生')
    fireEvent.click(screen.getByRole('button', { name: 'Remove 学生' }))
    fireEvent.click(screen.getByRole('button', { name: '学生' }))
    fireEvent.click(screen.getByRole('button', { name: 'です。' }))
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(screen.getByRole('status')).toHaveTextContent('Good.')
    expect(screen.getByText('がくせい')).toBeInTheDocument()
    expect(screen.getByText(sentenceOrder.explanation)).toBeInTheDocument()
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('renders only recognition exercises through the slot registry', () => {
    render(<ExerciseSlot title="Quick check" exercises={[choice, kana, text]} />)
    expect(screen.getByRole('button', { name: 'Hiragana' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'あ' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('keeps production and audio-to-glyph activities out of Practice', () => {
    const audioGlyph: ExerciseDefinition = { id: 'audio-glyph-check' as ExerciseDefinition['id'], type: 'audio-choice', prompt: 'Choose the kana', audioId: 'audio-a', target: 'glyph', options: ['あ', 'い'], answer: 'あ', feedback }
    const eligible = eligiblePracticeExercises([choice, kana, text, cloze, sentenceOrder, audioGlyph])
    expect(eligible.map(({ id }) => id)).toEqual([choice.id])
    render(<ExerciseSlot title="Reading practice" exercises={[text, cloze, sentenceOrder, audioGlyph]} />)
    expect(screen.queryByRole('region', { name: 'Reading practice' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText(/write|type the japanese|build the sentence/i)).toBeNull()
  })
})
