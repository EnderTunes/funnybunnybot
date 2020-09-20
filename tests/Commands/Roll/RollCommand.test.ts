import { RollCommand } from '@src/Commands/Roll/RollCommand'

const { parse, execute } = RollCommand

const diceCount = 2
const diceSides = 6

describe('roll command parsing', () => {
	const xDy = [`${diceCount}d${diceSides}`]
	const spaced = [`${diceCount}`, `${diceSides}`]
	it('parses dice count', () => {
		expect(parse(xDy).diceCount).toBe(diceCount)
		expect(parse(spaced).diceCount).toBe(diceCount)
	})
	it('parses dice sides', () => {
		expect(parse(xDy).diceSides).toBe(diceSides)
		expect(parse(spaced).diceSides).toBe(diceSides)
	})
	it('parses single number as dice sides', () => {
		expect(parse([`${diceSides}`]).diceCount).toBe(1)
		expect(parse([`${diceSides}`]).diceSides).toBe(diceSides)
	})
	it('throws with invalid parameters', () => {
		function doParse(params: string[]) {
			return () => parse(params)
		}
		const error = 'Invalid parameters'
		expect(doParse([])).toThrow(error)
		expect(doParse([''])).toThrow(error)
		expect(doParse(['2d'])).toThrow(error)
		expect(doParse(['d2'])).toThrow(error)
		expect(doParse(['abc'])).toThrow(error)
	})
})

describe('roll command execution', () => {
	function createExecute(diceCountInput: number, diceSidesInput: number) {
		return () =>
			execute({
				params: { diceCount: diceCountInput, diceSides: diceSidesInput },
			})
	}
	const singleDice = createExecute(1, diceSides)() as string
	const multiDice = createExecute(diceCount, diceSides)() as string
	it('returns a string with correct number of lines', () => {
		expect(singleDice.split('\n')).toHaveLength(2)
		expect(multiDice.split('\n')).toHaveLength(diceCount + 2)
	})
	it('throws with invalid parameters', () => {
		expect(createExecute(diceCount, 1)).toThrow('sides must be at least 2')
		expect(createExecute(diceCount, 0x80000000)).toThrow(
			'sides must be a 32-bit integer'
		)
		expect(createExecute(0, diceSides)).toThrow('dice must be at least 1')
		expect(createExecute(999, diceSides)).toThrow('dice must be less than 100')
	})
})
