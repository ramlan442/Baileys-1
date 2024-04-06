import { Mutex } from 'async-mutex'

export const makeMutex = () => {
	const mutex = new Mutex()

	return {
		mutex<T>(code: () => Promise<T> | T): Promise<T> {
			return mutex.runExclusive(code)
		},
	}
}

export type MutexType = ReturnType<typeof makeMutex>

export const makeKeyedMutex = () => {
	const map: { [id: string]: MutexType } = {}

	return {
		mutex<T>(key: string, task: () => Promise<T> | T): Promise<T> {
			if(!map[key]) {
				map[key] = makeMutex()
			}

			return map[key].mutex(task)
		}
	}
}