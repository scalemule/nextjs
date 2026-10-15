/**
 * Experiment assignment helpers used inside this package.
 *
 * The canonical helpers live in `@scalemule/sdk` (`withExperiments`, `normalizeExperiments`); the
 * provider and analytics hook keep a local copy so a test or app that mocks `@scalemule/sdk` with
 * a partial module still renders. Same rules: slug keys and variants, at most ten per event.
 */
export type ExperimentAssignments = Record<string, string>

const KEY = /^[a-z0-9][a-z0-9_.-]{0,63}$/
const VARIANT = /^[a-z0-9][a-z0-9_.:-]{0,63}$/
const MAX = 10

export function normalizeExperiments(input: unknown): ExperimentAssignments {
  const result: ExperimentAssignments = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result
  let count = 0
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (count >= MAX) break
    if (KEY.test(key) && typeof value === 'string' && VARIANT.test(value)) {
      result[key] = value
      count++
    }
  }
  return result
}

export function withExperiments(
  properties: Record<string, unknown> | undefined,
  experiments: ExperimentAssignments | undefined
): Record<string, unknown> | undefined {
  const merged = normalizeExperiments({ ...normalizeExperiments(properties?.experiments), ...(experiments ?? {}) })
  if (Object.keys(merged).length === 0) return properties
  return { ...(properties ?? {}), experiments: merged }
}
