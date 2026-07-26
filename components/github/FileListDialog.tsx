"use client"

import {
    CloudDownload,
    CloudUpload,
    ExternalLink,
    FileCode,
    FileJson,
    Github,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
    X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    createNewFile,
    type DiagramFile,
    deleteFile,
    jsonToXml,
    listFiles,
    saveFile,
    updateFile,
    xmlToJson,
} from "@/lib/diagram-files"
import { createOrUpdateFile, getFile as getGitHubFile } from "@/lib/github-api"
import {
    type GlobalGitHubConfig,
    getGlobalGitHubConfig,
    getGlobalGitHubSyncState,
    saveGlobalGitHubSyncState,
} from "@/lib/global-github-config"
import { GlobalGitHubConfigDialog } from "./GlobalGitHubConfigDialog"

type EditTab = "name" | "xml" | "json"

interface FileListDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    selectedFileId: string | null
    onFileSelect: (file: DiagramFile) => void
    onFilesChange?: (files: DiagramFile[]) => void
}

function FileListContent({
    open,
    onOpenChange,
    selectedFileId,
    onFileSelect,
    onFilesChange,
}: FileListDialogProps) {
    const [files, setFiles] = useState<DiagramFile[]>([])
    const [loading, setLoading] = useState(true)
    const [editingFile, setEditingFile] = useState<DiagramFile | null>(null)
    const [newFileName, setNewFileName] = useState("")
    const [showNewInput, setShowNewInput] = useState(false)

    // Edit dialog state
    const [editTab, setEditTab] = useState<EditTab>("xml")
    const [editName, setEditName] = useState("")
    const [editXml, setEditXml] = useState("")
    const [editJson, setEditJson] = useState("")

    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
    const newNameInputRef = useRef<HTMLInputElement>(null)

    // Global GitHub state
    const [globalConfig, setGlobalConfig] = useState<GlobalGitHubConfig | null>(
        null,
    )
    const [showGlobalConfig, setShowGlobalConfig] = useState(false)
    const [pullingAll, setPullingAll] = useState(false)
    const [pushingAll, setPushingAll] = useState(false)
    const autoPulledRef = useRef(false)

    const loadFiles = useCallback(async () => {
        setLoading(true)
        try {
            const result = await listFiles()
            setFiles(result)
            onFilesChange?.(result)
        } finally {
            setLoading(false)
        }
    }, [onFilesChange])

    useEffect(() => {
        if (open) {
            loadFiles()
            setShowNewInput(false)
            setEditingFile(null)
            setConfirmDelete(null)
            setGlobalConfig(getGlobalGitHubConfig())
            autoPulledRef.current = false
        }
    }, [open, loadFiles])

    // Auto-pull all files from GitHub when dialog opens and global config is set
    useEffect(() => {
        if (
            open &&
            !loading &&
            globalConfig &&
            files.length > 0 &&
            !autoPulledRef.current
        ) {
            autoPulledRef.current = true
            handlePullAll()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, loading, globalConfig, files.length])

    // ── CRUD ──────────────────────────────────────────────────

    const handleCreate = async () => {
        const name = newFileName.trim()
        if (!name) {
            toast.warning("请输入文件名称")
            return
        }
        const file = await createNewFile(name)
        if (file) {
            toast.success(`文件 "${name}" 已创建`)
            setNewFileName("")
            setShowNewInput(false)
            await loadFiles()
            onFileSelect(file)
            onOpenChange(false)
        } else {
            toast.error("创建失败")
        }
    }

    const handleLoadFile = (file: DiagramFile) => {
        onFileSelect(file)
        onOpenChange(false)
    }

    // ── Edit dialog ───────────────────────────────────────────

    const startEdit = (file: DiagramFile) => {
        setEditName(file.name)
        setEditXml(file.xml)
        setEditJson(file.json || xmlToJson(file.xml))
        setEditTab("xml")
        setEditingFile(file)
    }

    const handleSyncJsonToXml = () => {
        const extracted = jsonToXml(editJson)
        if (extracted) {
            setEditXml(extracted)
            toast.success("已从 JSON 同步 XML")
        } else {
            toast.error("JSON 中未找到有效的 xml 字段")
        }
    }

    const handleSyncXmlToJson = () => {
        setEditJson(xmlToJson(editXml))
        toast.success("已从 XML 生成 JSON")
    }

    const handleSaveEdit = async () => {
        if (!editingFile) return
        const updates: Partial<DiagramFile> = {}

        if (editName.trim() && editName.trim() !== editingFile.name) {
            updates.name = editName.trim()
        }

        updates.xml = editXml
        updates.json = editJson

        const result = await updateFile(editingFile.id, updates)
        if (result) {
            toast.success("文件已保存")
            setEditingFile(null)
            await loadFiles()
            if (editingFile.id === selectedFileId) {
                onFileSelect(result)
            }
        } else {
            toast.error("保存失败")
        }
    }

    // ── Global GitHub sync (single file: data/nextall.json) ──

    const handlePullAll = async () => {
        if (!globalConfig) return
        setPullingAll(true)
        try {
            const result = await getGitHubFile(
                globalConfig.token,
                globalConfig.owner,
                globalConfig.repo,
                globalConfig.path,
            )
            if (!result) {
                toast.info("远程文件尚不存在，请先推送")
                setPullingAll(false)
                return
            }

            const decoded = atob(result.data.content || "")
            let payload: {
                files?: Array<{
                    id: string
                    name: string
                    xml: string
                    json?: string
                    thumbnailSvg?: string
                    updatedAt: number
                }>
            }
            try {
                payload = JSON.parse(decoded)
            } catch {
                toast.error("远程文件格式错误")
                setPullingAll(false)
                return
            }

            if (!payload.files || !Array.isArray(payload.files)) {
                toast.error("远程文件格式无效")
                setPullingAll(false)
                return
            }

            // Refresh local files list for comparison
            const localFiles = await listFiles()
            const localMap = new Map(localFiles.map((f) => [f.id, f]))

            let updated = 0
            let created = 0
            for (const remoteFile of payload.files) {
                const existing = localMap.get(remoteFile.id)
                if (existing) {
                    await updateFile(remoteFile.id, {
                        name: remoteFile.name,
                        xml: remoteFile.xml,
                        json: remoteFile.json || xmlToJson(remoteFile.xml),
                        thumbnailSvg: remoteFile.thumbnailSvg,
                        lastSyncedAt: Date.now(),
                    })
                    updated++
                } else {
                    await saveFile({
                        id: remoteFile.id,
                        name: remoteFile.name,
                        xml: remoteFile.xml,
                        json: remoteFile.json || xmlToJson(remoteFile.xml),
                        thumbnailSvg: remoteFile.thumbnailSvg,
                        createdAt: remoteFile.updatedAt,
                        githubOwner: "",
                        githubRepo: "",
                        githubPath: "",
                        githubToken: "",
                    })
                    created++
                }
            }

            // Save the SHA for future updates
            saveGlobalGitHubSyncState({
                sha: result.sha,
                lastSyncedAt: Date.now(),
            })

            await loadFiles()
            if (updated > 0 || created > 0) {
                toast.success(`已拉取：${updated} 个更新，${created} 个新建`)
            } else {
                toast.info("远程无更新")
            }
        } catch (e) {
            toast.error(
                e instanceof Error ? e.message : "拉取失败，请检查配置和网络",
            )
        } finally {
            setPullingAll(false)
        }
    }

    const handlePushAll = async () => {
        if (!globalConfig) {
            toast.warning("请先配置 GitHub 同步")
            setShowGlobalConfig(true)
            return
        }
        if (files.length === 0) {
            toast.info("没有文件需要推送")
            return
        }
        setPushingAll(true)
        try {
            // Build a single JSON containing all files
            const filesData = files.map((f) => ({
                id: f.id,
                name: f.name,
                xml: f.xml,
                json: f.json || xmlToJson(f.xml),
                thumbnailSvg: f.thumbnailSvg,
                updatedAt: f.updatedAt,
            }))
            const payload = JSON.stringify({ files: filesData }, null, 2)

            const syncState = getGlobalGitHubSyncState()

            const result = await createOrUpdateFile(
                globalConfig.token,
                globalConfig.owner,
                globalConfig.repo,
                globalConfig.path,
                payload,
                `Sync diagrams - ${new Date().toISOString()}`,
                syncState?.sha || undefined,
            )

            // Save the SHA for future updates
            saveGlobalGitHubSyncState({
                sha: result.sha,
                lastSyncedAt: Date.now(),
            })

            // Update lastSyncedAt for all local files
            for (const file of files) {
                await updateFile(file.id, {
                    lastSyncedAt: Date.now(),
                })
            }

            await loadFiles()
            toast.success(`已成功同步 ${files.length} 个文件到 GitHub`)
        } catch (e) {
            toast.error(
                e instanceof Error ? e.message : "推送失败，请检查配置和网络",
            )
        } finally {
            setPushingAll(false)
        }
    }

    // ── Delete ────────────────────────────────────────────────

    const handleDelete = async (id: string) => {
        if (confirmDelete !== id) {
            setConfirmDelete(id)
            return
        }
        const success = await deleteFile(id)
        if (success) {
            toast.success("文件已删除")
            setConfirmDelete(null)
            await loadFiles()
        } else {
            toast.error("删除失败")
        }
    }

    return (
        <div className="flex flex-col h-full max-h-[75vh]">
            {/* ── Global GitHub toolbar ───────────────────────── */}
            <div className="px-6 pt-3 pb-2 border-b border-border-subtle flex items-center gap-2">
                {globalConfig ? (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={handlePullAll}
                        disabled={pullingAll}
                    >
                        <CloudDownload
                            className={`h-3.5 w-3.5 mr-1.5 ${
                                pullingAll ? "animate-pulse" : ""
                            }`}
                        />
                        {pullingAll ? "拉取中..." : "拉取所有"}
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground"
                        onClick={() => setShowGlobalConfig(true)}
                    >
                        <Github className="h-3.5 w-3.5 mr-1.5" />
                        配置 GitHub
                    </Button>
                )}
                {globalConfig && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={handlePushAll}
                        disabled={pushingAll}
                    >
                        <CloudUpload
                            className={`h-3.5 w-3.5 mr-1.5 ${
                                pushingAll ? "animate-pulse" : ""
                            }`}
                        />
                        {pushingAll ? "推送中..." : "推送所有"}
                    </Button>
                )}
                {globalConfig && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setShowGlobalConfig(true)}
                        title="GitHub 配置"
                    >
                        <Github className="h-3.5 w-3.5 mr-1.5" />
                        {globalConfig.owner}/{globalConfig.repo}
                        <span className="text-muted-foreground/50 ml-1">
                            {globalConfig.path}
                        </span>
                    </Button>
                )}
                <div className="flex-1" />
                {pullingAll && (
                    <span className="text-[11px] text-muted-foreground animate-pulse">
                        正在从 GitHub 同步...
                    </span>
                )}
            </div>

            {/* ── New file input ─────────────────────────────── */}
            {showNewInput && (
                <div className="px-6 pt-4 pb-3 border-b border-border-subtle">
                    <div className="flex items-center gap-2">
                        <Input
                            ref={newNameInputRef}
                            value={newFileName}
                            onChange={(e) => setNewFileName(e.target.value)}
                            placeholder="输入文件名称..."
                            className="h-9 text-sm flex-1"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreate()
                                if (e.key === "Escape") setShowNewInput(false)
                            }}
                        />
                        <Button
                            size="sm"
                            className="h-9"
                            onClick={handleCreate}
                        >
                            创建
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => setShowNewInput(false)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* ── File list ──────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4 space-y-1.5">
                {loading ? (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        加载中...
                    </div>
                ) : files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <FileJson className="h-10 w-10 text-muted-foreground/20 mb-3" />
                        <p className="text-sm text-muted-foreground mb-1">
                            暂无存储的文件
                        </p>
                        <p className="text-xs text-muted-foreground/60 mb-4">
                            创建一个新文件开始管理你的图表
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowNewInput(true)}
                        >
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            新建文件
                        </Button>
                    </div>
                ) : (
                    files.map((file) => (
                        <div
                            key={file.id}
                            className={`group flex items-center gap-3 p-3 rounded-xl transition-colors ${
                                file.id === selectedFileId
                                    ? "bg-primary/5 border border-primary/15"
                                    : "hover:bg-muted/40 border border-transparent"
                            }`}
                        >
                            {/* Icon */}
                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                <FileJson className="h-4 w-4 text-muted-foreground" />
                            </div>

                            {/* Info */}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium truncate">
                                        {file.name}
                                    </span>
                                    {file.lastSyncedAt && (
                                        <Github className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                                    <span>
                                        {new Date(
                                            file.updatedAt,
                                        ).toLocaleDateString("zh-CN", {
                                            month: "short",
                                            day: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                    {file.lastSyncedAt && (
                                        <>
                                            <span>·</span>
                                            <CloudUpload className="h-3 w-3" />
                                            <span>
                                                {new Date(
                                                    file.lastSyncedAt,
                                                ).toLocaleDateString("zh-CN", {
                                                    month: "short",
                                                    day: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Actions - only load, edit, delete */}
                            <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="加载到编辑器"
                                    onClick={() => handleLoadFile(file)}
                                >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="重命名 / 编辑内容"
                                    onClick={() => startEdit(file)}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-7 w-7 ${
                                        confirmDelete === file.id
                                            ? "text-destructive bg-destructive/10"
                                            : "hover:text-destructive"
                                    }`}
                                    title={
                                        confirmDelete === file.id
                                            ? "确认删除"
                                            : "删除文件"
                                    }
                                    onClick={() => handleDelete(file.id)}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* ── Bottom bar ─────────────────────────────────── */}
            {files.length > 0 && (
                <div className="px-6 py-3 border-t border-border-subtle flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setShowNewInput(true)}
                    >
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        新建文件
                    </Button>
                    <div className="flex-1" />
                    <span className="text-[11px] text-muted-foreground/50">
                        共 {files.length} 个文件
                    </span>
                </div>
            )}

            {/* ── Edit dialog (inline overlay) ───────────────── */}
            {editingFile && (
                <div className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-[1px] flex items-center justify-center p-4">
                    <div className="bg-surface-0 rounded-2xl border border-border-subtle shadow-dialog w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-[0.98] duration-200 flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="px-6 pt-5 pb-4 border-b border-border-subtle shrink-0">
                            <h3 className="text-base font-semibold">
                                编辑文件
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                支持 XML 和 JSON 两种格式，修改后自动保持同步
                            </p>
                        </div>

                        {/* Name */}
                        <div className="px-6 py-3 border-b border-border-subtle shrink-0">
                            <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                                文件名称
                            </Label>
                            <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="h-9 text-sm"
                            />
                        </div>

                        {/* Tab bar */}
                        <div className="flex items-center gap-1 px-6 pt-3 shrink-0">
                            <button
                                onClick={() => setEditTab("xml")}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    editTab === "xml"
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                }`}
                            >
                                <FileCode className="h-3.5 w-3.5" />
                                XML
                            </button>
                            <button
                                onClick={() => setEditTab("json")}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    editTab === "json"
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                }`}
                            >
                                <FileJson className="h-3.5 w-3.5" />
                                JSON
                            </button>
                            <div className="flex-1" />
                            {editTab === "json" && (
                                <button
                                    onClick={handleSyncJsonToXml}
                                    className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                                    title="将 JSON 中的 xml 字段提取到 XML 编辑区"
                                >
                                    同步到 XML
                                </button>
                            )}
                            {editTab === "xml" && (
                                <button
                                    onClick={handleSyncXmlToJson}
                                    className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                                    title="从 XML 重新生成 JSON"
                                >
                                    生成 JSON
                                </button>
                            )}
                        </div>

                        {/* Editor */}
                        <div className="px-6 py-3 flex-1 overflow-y-auto min-h-0">
                            {editTab === "xml" ? (
                                <Textarea
                                    value={editXml}
                                    onChange={(e) => setEditXml(e.target.value)}
                                    className="min-h-70 font-mono text-xs leading-relaxed"
                                    placeholder="draw.io XML 内容..."
                                />
                            ) : (
                                <Textarea
                                    value={editJson}
                                    onChange={(e) =>
                                        setEditJson(e.target.value)
                                    }
                                    className="min-h-70 font-mono text-xs leading-relaxed"
                                    placeholder='{ "xml": "<mxfile>...</mxfile>" }'
                                />
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-border-subtle flex justify-end gap-2 shrink-0">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingFile(null)}
                            >
                                取消
                            </Button>
                            <Button size="sm" onClick={handleSaveEdit}>
                                保存
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Global GitHub config dialog ────────────────── */}
            <GlobalGitHubConfigDialog
                open={showGlobalConfig}
                onOpenChange={(open) => {
                    setShowGlobalConfig(open)
                    if (!open) {
                        setGlobalConfig(getGlobalGitHubConfig())
                        loadFiles()
                    }
                }}
                onConfigSaved={() => {
                    setGlobalConfig(getGlobalGitHubConfig())
                    loadFiles()
                }}
            />
        </div>
    )
}

export function FileListDialog(props: FileListDialogProps) {
    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-6 pt-5 pb-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                            <FileJson className="h-4.5 w-4.5 text-foreground" />
                        </div>
                        <div>
                            <DialogTitle className="text-base">
                                文件管理
                            </DialogTitle>
                            <DialogDescription className="text-xs">
                                创建、编辑、同步和管理你的图表文件
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
                <FileListContent {...props} />
            </DialogContent>
        </Dialog>
    )
}
