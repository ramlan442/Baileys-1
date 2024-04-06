import { randomBytes } from 'crypto'
import NodeCache from 'node-cache'
import type { Logger } from 'pino'
import { v4 as uuidv4 } from 'uuid'
import { DEFAULT_CACHE_TTLS } from '../Defaults'
import type { AuthenticationCreds, CacheStore, SignalDataSet, SignalDataTypeMap, SignalKeyStore, SignalKeyStoreWithTransaction, TransactionCapabilityOptions } from '../Types'
import { Curve, signedKeyPair } from './crypto'
import { delay, generateRegistrationId } from './generics'

/**
 * Adds caching capability to a SignalKeyStore
 * @param store the store to add caching to
 * @param logger to log trace events
 * @param _cache cache store to use
 */
export function makeCacheableSignalKeyStore(
	store: SignalKeyStore,
	logger: Logger,
	_cache?: CacheStore
): SignalKeyStore {
	const cache = _cache || new NodeCache({
		stdTTL: DEFAULT_CACHE_TTLS.SIGNAL_STORE, // 5 minutes
		useClones: false,
		deleteOnExpire: true,
	})

	function getUniqueId(type: string, id: string) {
		return `${type}.${id}`
	}

	return {
		async get(type, ids) {
			const data: { [_: string]: SignalDataTypeMap[typeof type] } = { }
			const idsToFetch: string[] = []
			for(const id of ids) {
				const item = cache.get<SignalDataTypeMap[typeof type]>(getUniqueId(type, id))
				if(typeof item !== 'undefined') {
					data[id] = item
				} else {
					idsToFetch.push(id)
				}
			}

			if(idsToFetch.length) {
				logger.trace({ items: idsToFetch.length }, 'loading from store')
				const fetched = await store.get(type, idsToFetch)
				for(const id of idsToFetch) {
					const item = fetched[id]
					if(item) {
						data[id] = item
						cache.set(getUniqueId(type, id), item)
					}
				}
			}

			return data
		},
		async set(data) {
			let keys = 0
			for(const type in data) {
				for(const id in data[type]) {
					cache.set(getUniqueId(type, id), data[type][id])
					keys += 1
				}
			}

			logger.trace({ keys }, 'updated cache')

			await store.set(data)
		},
		async clear() {
			cache.flushAll()
			await store.clear?.()
		}
	}
}

/**
 * Adds DB like transaction capability (https://en.wikipedia.org/wiki/Database_transaction) to the SignalKeyStore,
 * this allows batch read & write operations & improves the performance of the lib
 * @param state the key store to apply this capability to
 * @param logger logger to log events
 * @returns SignalKeyStore with transaction capability
 */
export const addTransactionCapability = (
	state: SignalKeyStore,
	logger: Logger,
	{ maxCommitRetries, delayBetweenTriesMs }: TransactionCapabilityOptions
): SignalKeyStoreWithTransaction => {
	return {
		get: async(type, ids) => state.get(type, ids),
		set: data => state.set(data),
		isInTransaction: () => false,
		transaction: async(work) => await work()
	}
}

export const initAuthCreds = (): AuthenticationCreds => {
	const identityKey = Curve.generateKeyPair()
	return {
		noiseKey: Curve.generateKeyPair(),
		pairingEphemeralKeyPair: Curve.generateKeyPair(),
		signedIdentityKey: identityKey,
		signedPreKey: signedKeyPair(identityKey, 1),
		registrationId: generateRegistrationId(),
		advSecretKey: randomBytes(32).toString('base64'),
		processedHistoryMessages: [],
		nextPreKeyId: 1,
		firstUnuploadedPreKeyId: 1,
		accountSyncCounter: 0,
		accountSettings: {
			unarchiveChats: false
		},
		// mobile creds
		deviceId: Buffer.from(uuidv4().replace(/-/g, ''), 'hex').toString('base64url'),
		phoneId: uuidv4(),
		identityId: randomBytes(20),
		registered: false,
		backupToken: randomBytes(20),
		registration: {} as never,
		pairingCode: undefined,
	}
}