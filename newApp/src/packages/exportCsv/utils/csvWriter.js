import Papa from 'papaparse'
import { toText } from './normalize'

export function buildCsv({ rows, columns, delimiter = ',', newline = '\r\n', includeBom = false } = {}) {
  const cols = Array.isArray(columns) ? columns : []
  const list = Array.isArray(rows) ? rows : []

  const fields = cols.map((col) => col.label || col.key)
  const data = list.map((row) =>
    cols.map((col) => {
      const value = row ? row[col.key] : ''
      return toText(value)
    })
  )

  const csv = Papa.unparse({ fields, data }, { delimiter, newline })
  if (includeBom) {
    return `\ufeff${csv}`
  }
  return csv
}
