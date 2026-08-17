import { describe, expect, it } from 'vitest'
import {
  SWIPE_ACTION_THRESHOLD_PX,
  SWIPE_AXIS_LOCK_PX,
  SWIPE_MAX_OFFSET_PX,
  clampSwipeOffset,
  resolveSwipeAction,
  resolveSwipeAxis,
} from './swipeGesture'

describe('resolveSwipeAxis', () => {
  it('не определяет ось, пока смещение меньше порога залипания', () => {
    expect(resolveSwipeAxis(SWIPE_AXIS_LOCK_PX - 1, 0)).toBe('undetermined')
    expect(resolveSwipeAxis(0, SWIPE_AXIS_LOCK_PX - 1)).toBe('undetermined')
  })

  it('определяет горизонтальную ось, когда движение шире, чем выше', () => {
    expect(resolveSwipeAxis(20, 5)).toBe('horizontal')
  })

  it('определяет вертикальную ось, когда движение выше, чем шире', () => {
    expect(resolveSwipeAxis(5, 20)).toBe('vertical')
  })

  it('при равных смещениях отдаёт ось вертикали — не срабатывает свайп случайно при прокрутке', () => {
    expect(resolveSwipeAxis(15, 15)).toBe('vertical')
  })
})

describe('clampSwipeOffset', () => {
  it('не трогает смещение внутри допустимого диапазона', () => {
    expect(clampSwipeOffset(40)).toBe(40)
    expect(clampSwipeOffset(-40)).toBe(-40)
  })

  it('ограничивает смещение максимумом в обе стороны', () => {
    expect(clampSwipeOffset(SWIPE_MAX_OFFSET_PX + 50)).toBe(SWIPE_MAX_OFFSET_PX)
    expect(clampSwipeOffset(-SWIPE_MAX_OFFSET_PX - 50)).toBe(-SWIPE_MAX_OFFSET_PX)
  })
})

describe('resolveSwipeAction', () => {
  it('возвращает null, пока смещение меньше порога действия', () => {
    expect(resolveSwipeAction(SWIPE_ACTION_THRESHOLD_PX - 1)).toBeNull()
    expect(resolveSwipeAction(-(SWIPE_ACTION_THRESHOLD_PX - 1))).toBeNull()
  })

  it('свайп вправо за порог — «выполнено»', () => {
    expect(resolveSwipeAction(SWIPE_ACTION_THRESHOLD_PX)).toBe('complete')
    expect(resolveSwipeAction(SWIPE_ACTION_THRESHOLD_PX + 40)).toBe('complete')
  })

  it('свайп влево за порог — «завтра»', () => {
    expect(resolveSwipeAction(-SWIPE_ACTION_THRESHOLD_PX)).toBe('tomorrow')
    expect(resolveSwipeAction(-SWIPE_ACTION_THRESHOLD_PX - 40)).toBe('tomorrow')
  })
})
