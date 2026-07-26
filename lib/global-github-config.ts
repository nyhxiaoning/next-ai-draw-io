const STORAGE_KEY = "global-github-config"
const SYNC_STATE_KEY = "global-github-sync-state"

export interface GlobalGitHubConfig {
    owner: string
    repo: string
    token: string
    /** GitHub file path for storing all diagrams, e.g. data/nextall.json */
    path: string
}

export interface GlobalGitHubSyncState {
    sha: string
    lastSyncedAt: number
}

const DEFAULT_PATH = "data/nextall.json"

export function getGlobalGitHubConfig(): GlobalGitHubConfig | null {
    if (typeof window === "undefined") return null
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const config = JSON.parse(raw)
        return {
            owner: config.owner || "",
            repo: config.repo || "",
            token: config.token || "",
            path: config.path || DEFAULT_PATH,
        }
    } catch {
        return null
    }
}

export function saveGlobalGitHubConfig(config: GlobalGitHubConfig): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearGlobalGitHubConfig(): void {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(SYNC_STATE_KEY)
}

export function getGlobalGitHubSyncState(): GlobalGitHubSyncState | null {
    if (typeof window === "undefined") return null
    try {
        const raw = localStorage.getItem(SYNC_STATE_KEY)
        if (!raw) return null
        return JSON.parse(raw)
    } catch {
        return null
    }
}

export function saveGlobalGitHubSyncState(state: GlobalGitHubSyncState): void {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state))
}
