import { Store } from '@tauri-apps/plugin-store'
import { isTauri } from '@/lib/utils'
import { logger } from '@/lib/logging'

export interface DaemonConnection {
  id: string
  name: string
  url: string
  apiKey?: string
  lastUsed: string
  isDefault?: boolean
}

export interface ConnectionState {
  activeConnectionId: string | null // null = managed daemon
  connections: DaemonConnection[]
}

const STORE_KEY = 'daemon-connections'
const DEFAULT_STATE: ConnectionState = {
  activeConnectionId: null,
  connections: [],
}

class ConnectionStore {
  private store: Store | null = null
  private initialized = false
  private initPromise: Promise<void> | null = null

  async init(): Promise<void> {
    if (this.initialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this._init()
    return this.initPromise
  }

  private async _init(): Promise<void> {
    if (!isTauri()) {
      logger.debug('ConnectionStore: Not in Tauri environment, using memory only')
      this.initialized = true
      return
    }

    try {
      this.store = await Store.load('daemon-connections.json')
      this.initialized = true
      logger.debug('ConnectionStore: Initialized Tauri store')
    } catch (error) {
      logger.error('ConnectionStore: Failed to initialize Tauri store', error)
      this.initialized = true // Mark as initialized to prevent retry loops
    }
  }

  async getState(): Promise<ConnectionState> {
    await this.init()

    if (!this.store) {
      return DEFAULT_STATE
    }

    try {
      const state = await this.store.get<ConnectionState>(STORE_KEY)
      return state ?? DEFAULT_STATE
    } catch (error) {
      logger.error('ConnectionStore: Failed to get state', error)
      return DEFAULT_STATE
    }
  }

  async saveConnection(connection: DaemonConnection): Promise<void> {
    await this.init()

    if (!this.store) {
      logger.warn('ConnectionStore: Cannot save connection, store not available')
      return
    }

    try {
      const state = await this.getState()
      const existingIndex = state.connections.findIndex(c => c.id === connection.id)

      if (existingIndex >= 0) {
        state.connections[existingIndex] = connection
      } else {
        state.connections.push(connection)
      }

      await this.store.set(STORE_KEY, state)
      await this.store.save()
      logger.debug('ConnectionStore: Saved connection', connection.name)
    } catch (error) {
      logger.error('ConnectionStore: Failed to save connection', error)
    }
  }

  async deleteConnection(id: string): Promise<void> {
    await this.init()

    if (!this.store) {
      logger.warn('ConnectionStore: Cannot delete connection, store not available')
      return
    }

    try {
      const state = await this.getState()
      state.connections = state.connections.filter(c => c.id !== id)

      // If we deleted the active connection, clear the active ID
      if (state.activeConnectionId === id) {
        state.activeConnectionId = null
      }

      await this.store.set(STORE_KEY, state)
      await this.store.save()
      logger.debug('ConnectionStore: Deleted connection', id)
    } catch (error) {
      logger.error('ConnectionStore: Failed to delete connection', error)
    }
  }

  async setActiveConnection(id: string | null): Promise<void> {
    await this.init()

    if (!this.store) {
      logger.warn('ConnectionStore: Cannot set active connection, store not available')
      return
    }

    try {
      const state = await this.getState()
      state.activeConnectionId = id

      // Update lastUsed for the connection if it exists
      if (id) {
        const connection = state.connections.find(c => c.id === id)
        if (connection) {
          connection.lastUsed = new Date().toISOString()
        }
      }

      await this.store.set(STORE_KEY, state)
      await this.store.save()
      logger.debug('ConnectionStore: Set active connection', id)
    } catch (error) {
      logger.error('ConnectionStore: Failed to set active connection', error)
    }
  }

  async getActiveConnection(): Promise<DaemonConnection | null> {
    await this.init()

    try {
      const state = await this.getState()
      if (!state.activeConnectionId) {
        return null
      }
      return state.connections.find(c => c.id === state.activeConnectionId) ?? null
    } catch (error) {
      logger.error('ConnectionStore: Failed to get active connection', error)
      return null
    }
  }

  async getDefaultConnection(): Promise<DaemonConnection | null> {
    await this.init()

    try {
      const state = await this.getState()
      return state.connections.find(c => c.isDefault) ?? null
    } catch (error) {
      logger.error('ConnectionStore: Failed to get default connection', error)
      return null
    }
  }

  async setDefaultConnection(id: string | null): Promise<void> {
    await this.init()

    if (!this.store) {
      logger.warn('ConnectionStore: Cannot set default connection, store not available')
      return
    }

    try {
      const state = await this.getState()

      // Clear isDefault from all connections
      for (const connection of state.connections) {
        connection.isDefault = false
      }

      // Set the new default
      if (id) {
        const connection = state.connections.find(c => c.id === id)
        if (connection) {
          connection.isDefault = true
        }
      }

      await this.store.set(STORE_KEY, state)
      await this.store.save()
      logger.debug('ConnectionStore: Set default connection', id)
    } catch (error) {
      logger.error('ConnectionStore: Failed to set default connection', error)
    }
  }

  generateId(): string {
    return crypto.randomUUID()
  }
}

export const connectionStore = new ConnectionStore()
