import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import NodeCache from 'node-cache'
import { join } from 'path'
import { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '../Types'
import { initAuthCreds } from './auth-utils'
import { BufferJSON } from './generics'

/**
 * stores the full authentication state in a single folder.
 * Far more efficient than singlefileauthstate
 *
 * Again, I wouldn't endorse this for any production level use other than perhaps a bot.
 * Would recommend writing an auth state for use with a proper SQL or No-SQL DB
 * */
export const useMultiFileAuthState = async(folder: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void>, cache: NodeCache }> => {
	const cache = new NodeCache({
		useClones: false
	})

	const writeData = (data: any, file: string) => {
		return writeFile(join(folder, fixFileName(file)!), JSON.stringify(data, BufferJSON.replacer))
	}

	const readData = async(file: string) => {
		try {
			const data = await readFile(join(folder, fixFileName(file)!), { encoding: 'utf-8' })
			return JSON.parse(data, BufferJSON.reviver)
		} catch(error) {
			return null
		}
	}

	function getUniqueId(type: string, id: string) {
		return `${type}.${id}`
	}

	const folderInfo = await stat(folder).catch(() => { })
	if(folderInfo) {
		if(!folderInfo.isDirectory()) {
			throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`)
		}
	} else {
		await mkdir(folder, { recursive: true })
	}

	const fixFileName = (file?: string) => file?.replace(/\//g, '__')?.replace(/:/g, '-')

	const creds: AuthenticationCreds = await readData('creds.json') || initAuthCreds()

	return {
		cache,
		state: {
			creds,
			keys: {
				get: async(type, ids) => {
					return ids.reduce(
						async(dict, id) => {
							const key = getUniqueId(type, id)
							const value = cache.get<SignalDataTypeMap[typeof type]>(key)
							if(value) {
								dict[id] = value
							}

							return dict
						}, { }
					)
				},
				set: async(data) => {
					for(const type in data) {
						for(const id in data[type]) {
							const value = data[type][id]
							const key = getUniqueId(type, id)
							if(value) {
								cache.set(key, value)
							}
						}
					}
				}
			}
		},
		saveCreds: () => {
			return writeData(creds, 'creds.json')
		}
	}
}