export function formatTaskCount(count: number) {
  return `${count} ${pluralizeRu(count, ['задача', 'задачи', 'задач'])}`
}

function pluralizeRu(count: number, forms: [string, string, string]) {
  const value = Math.abs(count) % 100
  const lastDigit = value % 10

  if (value > 10 && value < 20) return forms[2]
  if (lastDigit > 1 && lastDigit < 5) return forms[1]
  if (lastDigit === 1) return forms[0]
  return forms[2]
}
