import { create } from "zustand"
import { type StatusResponse, api, getControlPlaneAdapterName } from "../api/client"

interface ConnectionState {
  adapter: "local"
  connected: boolean
  loading: boolean
  lastError: string
  status: StatusResponse | null
  initialize: (force?: boolean) => Promise<void>
  refresh: () => Promise<void>
  acceptStatus: (status: StatusResponse) => void
  setDisconnected: (message: string) => void
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  adapter: getControlPlaneAdapterName(),
  connected: false,
  loading: false,
  lastError: "",
  status: null,
  initialize: async (force = false) => {
    if (!force && (get().loading || get().status)) return
    set({ loading: true, adapter: getControlPlaneAdapterName() })
    try {
      const status = await api.status()
      set({
        connected: true,
        loading: false,
        lastError: "",
        status,
      })
    } catch (error) {
      set({
        connected: false,
        loading: false,
        lastError: error instanceof Error ? error.message : String(error),
      })
    }
  },
  refresh: async () => {
    await get().initialize(true)
  },
  acceptStatus: (status) => {
    set({
      connected: true,
      loading: false,
      lastError: "",
      status,
    })
  },
  setDisconnected: (message) => {
    set({ connected: false, lastError: message })
  },
}))
