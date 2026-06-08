import { type DBSchema, type IDBPDatabase, openDB } from "idb"
import { nanoid } from "nanoid"

const DB_NAME = "next-ai-drawio-files"
const DB_VERSION = 2
const STORE_NAME = "files"

export interface DiagramFile {
    id: string
    name: string
    /** draw.io native XML content */
    xml: string
    /** JSON representation for readability/viewing */
    json?: string
    thumbnailSvg?: string
    createdAt: number
    updatedAt: number
    githubOwner: string
    githubRepo: string
    githubPath: string
    githubToken: string
    lastSyncedAt?: number
    lastSyncSha?: string
}

interface DiagramFilesDB extends DBSchema {
    files: {
        key: string
        value: DiagramFile
        indexes: { "by-updated": number; "by-name": string }
    }
}

let dbPromise: Promise<IDBPDatabase<DiagramFilesDB>> | null = null

function getDB(): Promise<IDBPDatabase<DiagramFilesDB>> {
    if (!dbPromise) {
        dbPromise = openDB<DiagramFilesDB>(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion) {
                if (oldVersion < 1) {
                    const store = db.createObjectStore(STORE_NAME, {
                        keyPath: "id",
                    })
                    store.createIndex("by-updated", "updatedAt")
                    store.createIndex("by-name", "name")
                }
                // Version 2: content → xml migration handled by DiagramFile accessors
            },
        })
    }
    return dbPromise
}

function isAvailable(): boolean {
    if (typeof window === "undefined") return false
    try {
        return "indexedDB" in window && window.indexedDB !== null
    } catch {
        return false
    }
}

export async function listFiles(): Promise<DiagramFile[]> {
    if (!isAvailable()) return []
    try {
        const db = await getDB()
        const tx = db.transaction(STORE_NAME, "readonly")
        const index = tx.store.index("by-updated")
        const files: DiagramFile[] = []
        let cursor = await index.openCursor(null, "prev")
        while (cursor) {
            files.push(migrateFile(cursor.value))
            cursor = await cursor.continue()
        }
        return files
    } catch (error) {
        console.error("Failed to list files:", error)
        return []
    }
}

export async function getFile(id: string): Promise<DiagramFile | null> {
    if (!isAvailable()) return null
    try {
        const db = await getDB()
        const raw = await db.get(STORE_NAME, id)
        return raw ? migrateFile(raw) : null
    } catch (error) {
        console.error("Failed to get file:", error)
        return null
    }
}

export async function saveFile(
    file: Omit<DiagramFile, "id" | "createdAt" | "updatedAt"> & {
        id?: string
        createdAt?: number
    },
): Promise<DiagramFile | null> {
    if (!isAvailable()) return null
    try {
        const db = await getDB()
        const now = Date.now()
        const record: DiagramFile = {
            id: file.id || nanoid(),
            name: file.name,
            xml: file.xml,
            json: file.json,
            thumbnailSvg: file.thumbnailSvg,
            createdAt: file.createdAt || now,
            updatedAt: now,
            githubOwner: file.githubOwner || "",
            githubRepo: file.githubRepo || "",
            githubPath: file.githubPath || "",
            githubToken: file.githubToken || "",
            lastSyncedAt: file.lastSyncedAt,
            lastSyncSha: file.lastSyncSha,
        }
        await db.put(STORE_NAME, record)
        return record
    } catch (error) {
        console.error("Failed to save file:", error)
        return null
    }
}

export async function updateFile(
    id: string,
    updates: Partial<Omit<DiagramFile, "id" | "createdAt" | "updatedAt">>,
): Promise<DiagramFile | null> {
    if (!isAvailable()) return null
    try {
        const db = await getDB()
        const existing = await db.get(STORE_NAME, id)
        if (!existing) return null

        // If updating xml but not json, auto-generate json from the new xml
        if (updates.xml && !updates.json) {
            updates.json = xmlToJson(updates.xml)
        }
        // If updating json but not xml, try to extract xml from it
        if (updates.json && !updates.xml) {
            const extracted = jsonToXml(updates.json)
            if (extracted) updates.xml = extracted
        }

        const updated: DiagramFile = {
            ...existing,
            ...updates,
            updatedAt: Date.now(),
        }
        await db.put(STORE_NAME, updated)
        return updated
    } catch (error) {
        console.error("Failed to update file:", error)
        return null
    }
}

export async function deleteFile(id: string): Promise<boolean> {
    if (!isAvailable()) return false
    try {
        const db = await getDB()
        await db.delete(STORE_NAME, id)
        return true
    } catch (error) {
        console.error("Failed to delete file:", error)
        return false
    }
}

export async function createNewFile(
    name: string,
    xml?: string,
): Promise<DiagramFile | null> {
    const defaultXml =
        xml ||
        `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
    return saveFile({
        name,
        xml: defaultXml,
        json: xmlToJson(defaultXml),
        thumbnailSvg: undefined,
        githubOwner: "",
        githubRepo: "",
        githubPath: "",
        githubToken: "",
    })
}

// ─── migration helpers ────────────────────────────────────────────────

/** Migrate legacy files that still use `content` field to use `xml` */
function migrateFile(raw: DiagramFile): DiagramFile {
    const file = { ...raw }
    if (!file.xml && (file as any).content) {
        file.xml = (file as any).content
        delete (file as any).content
    }
    if (!file.xml) file.xml = ""
    return file
}

// ─── xml ↔ json conversion ────────────────────────────────────────────

/**
 * Generate a human-readable JSON structure from draw.io XML.
 * The JSON extracts diagram metadata and the mxCell hierarchy for easier
 * inspection and editing.
 */
export function xmlToJson(xml: string): string {
    try {
        // Parse the key elements visually — a full XML→JSON parser is too heavy,
        // so we produce a structured summary that includes the raw XML for roundtrip.
        const diagramMatch = xml.match(/<diagram\s+name="([^"]*)"[^>]*>/)
        const diagramName = diagramMatch ? diagramMatch[1] : "Page-1"

        // Extract cell count for a summary
        const cellCount = (xml.match(/<mxCell\s/g) || []).length

        const structure: Record<string, unknown> = {
            _format: "next-ai-draw-io-diagram",
            _version: 1,
            diagram: {
                name: diagramName,
                cellCount,
            },
            // Full raw XML is preserved for draw.io loading
            xml,
        }

        return JSON.stringify(structure, null, 2)
    } catch {
        return JSON.stringify({ xml }, null, 2)
    }
}

/**
 * Extract XML from the stored JSON representation.
 * Falls back to the `xml` field if present in the JSON structure.
 */
export function jsonToXml(jsonStr: string): string | null {
    try {
        const parsed = JSON.parse(jsonStr)
        if (typeof parsed.xml === "string" && parsed.xml.length > 0) {
            return parsed.xml
        }
        return null
    } catch {
        return null
    }
}

/**
 * Given an array of items (from GitHub sync), rebuild a DiagramFile.
 */
export function parseSyncPayload(
    payload: Record<string, unknown>,
    existing: DiagramFile,
): Partial<DiagramFile> {
    const updates: Partial<DiagramFile> = {}

    if (typeof payload.name === "string") updates.name = payload.name
    if (typeof payload.xml === "string") updates.xml = payload.xml
    if (typeof payload.json === "string") updates.json = payload.json
    if (typeof payload.thumbnailSvg === "string")
        updates.thumbnailSvg = payload.thumbnailSvg

    // If only a legacy `content` field exists, treat it as xml
    if (!updates.xml && typeof (payload as any).content === "string") {
        updates.xml = (payload as any).content
    }

    return updates
}
