import type { DeterministicCondition, DeterministicExpression } from './types'

export interface DeterministicRandom { nextPermille(stream: string): number }

/** Evaluates only declared AST nodes. It has no clock, I/O, eval, or ambient randomness. */
export function evaluateExpression(expression: DeterministicExpression, variables: Readonly<Record<string, number>>, random?: DeterministicRandom): number {
  switch (expression.kind) {
    case 'constant': return expression.value
    case 'variable': return requiredVariable(expression.id, variables)
    case 'add': return expression.operands.reduce((sum, operand) => sum + evaluateExpression(operand, variables, random), 0)
    case 'multiply': return expression.operands.reduce((product, operand) => product * evaluateExpression(operand, variables, random), 1)
    case 'minimum': return Math.min(...expression.operands.map((operand) => evaluateExpression(operand, variables, random)))
    case 'maximum': return Math.max(...expression.operands.map((operand) => evaluateExpression(operand, variables, random)))
    case 'subtract': return evaluateExpression(expression.left, variables, random) - evaluateExpression(expression.right, variables, random)
    case 'divide': {
      const divisor = evaluateExpression(expression.right, variables, random)
      if (divisor === 0) throw new Error('Content formula division by zero')
      return evaluateExpression(expression.left, variables, random) / divisor
    }
    case 'negate': return -evaluateExpression(expression.operand, variables, random)
    case 'if': return evaluateCondition(expression.condition, variables, random) ? evaluateExpression(expression.whenTrue, variables, random) : evaluateExpression(expression.whenFalse, variables, random)
    case 'randomChance': {
      if (!random || !/^[a-zA-Z0-9_.-]+$/.test(expression.stream)) throw new Error('Content formula requires a named RNG stream')
      const probability = evaluateExpression(expression.probabilityPermille, variables, random)
      if (!Number.isSafeInteger(probability) || probability < 0 || probability > 1000) throw new Error('Content formula probability must be an integer permille')
      return random.nextPermille(expression.stream) < probability ? evaluateExpression(expression.whenTrue, variables, random) : evaluateExpression(expression.whenFalse, variables, random)
    }
  }
}

export function evaluateCondition(condition: DeterministicCondition, variables: Readonly<Record<string, number>>, random?: DeterministicRandom): boolean {
  switch (condition.kind) {
    case 'greaterThan': return evaluateExpression(condition.left, variables, random) > evaluateExpression(condition.right, variables, random)
    case 'greaterThanOrEqual': return evaluateExpression(condition.left, variables, random) >= evaluateExpression(condition.right, variables, random)
    case 'equals': return evaluateExpression(condition.left, variables, random) === evaluateExpression(condition.right, variables, random)
    case 'all': return condition.conditions.every((item) => evaluateCondition(item, variables, random))
    case 'any': return condition.conditions.some((item) => evaluateCondition(item, variables, random))
    case 'not': return !evaluateCondition(condition.condition, variables, random)
  }
}

function requiredVariable(id: string, variables: Readonly<Record<string, number>>): number {
  const value = variables[id]
  if (!Number.isFinite(value)) throw new Error(`Content formula variable is unavailable: ${id}`)
  return value!
}
