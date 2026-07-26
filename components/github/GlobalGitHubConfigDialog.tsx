"use client"

import { Eye, EyeOff, FolderGit2, Github, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
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
import { getRepoDefaultBranch } from "@/lib/github-api"
import {
    clearGlobalGitHubConfig,
    type GlobalGitHubConfig,
    getGlobalGitHubConfig,
    saveGlobalGitHubConfig,
} from "@/lib/global-github-config"

const DEFAULT_PATH = "data/nextall.json"

interface GlobalGitHubConfigDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfigSaved: () => void
}

export function GlobalGitHubConfigDialog({
    open,
    onOpenChange,
    onConfigSaved,
}: GlobalGitHubConfigDialogProps) {
    const [owner, setOwner] = useState("")
    const [repo, setRepo] = useState("")
    const [path, setPath] = useState(DEFAULT_PATH)
    const [token, setToken] = useState("")
    const [showToken, setShowToken] = useState(false)
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [hasConfig, setHasConfig] = useState(false)

    useEffect(() => {
        if (open) {
            const config = getGlobalGitHubConfig()
            setOwner(config?.owner || "")
            setRepo(config?.repo || "")
            setPath(config?.path || DEFAULT_PATH)
            setToken(config?.token || "")
            setShowToken(false)
            setHasConfig(!!config)
        }
    }, [open])

    const handleSave = async () => {
        if (!owner.trim() || !repo.trim()) {
            toast.warning("请填写仓库信息")
            return
        }

        setSaving(true)
        try {
            saveGlobalGitHubConfig({
                owner: owner.trim(),
                repo: repo.trim(),
                path: path.trim() || DEFAULT_PATH,
                token: token.trim(),
            })
            toast.success("GitHub 同步配置已保存")
            onConfigSaved()
            onOpenChange(false)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存失败")
        } finally {
            setSaving(false)
        }
    }

    const handleTest = async () => {
        if (!token.trim() || !owner.trim() || !repo.trim()) {
            toast.warning("请填写 token 和仓库信息")
            return
        }
        setTesting(true)
        try {
            const branch = await getRepoDefaultBranch(
                token.trim(),
                owner.trim(),
                repo.trim(),
            )
            toast.success(`连接成功！默认分支: ${branch}`)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "连接失败，请检查配置")
        } finally {
            setTesting(false)
        }
    }

    const handleClear = () => {
        clearGlobalGitHubConfig()
        setOwner("")
        setRepo("")
        setPath(DEFAULT_PATH)
        setToken("")
        setHasConfig(false)
        toast.success("GitHub 配置已清除")
        onConfigSaved()
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
                {/* Header */}
                <DialogHeader className="px-6 pt-6 pb-4 border-b border-border-subtle">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-foreground shrink-0">
                            <Github className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle>GitHub 全局同步</DialogTitle>
                            <DialogDescription className="mt-0.5">
                                配置后即可将文件管理中的所有文件同步到 GitHub
                                仓库
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Synced banner */}
                {hasConfig && (
                    <div className="flex items-center gap-2.5 px-6 py-3 bg-success-muted/60 border-b border-success/10">
                        <div className="w-2 h-2 rounded-full bg-success shrink-0 shadow-[0_0_0_3px_theme(colors.success/0.14)]" />
                        <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-xs font-semibold text-success">
                                已配置全局同步
                            </span>
                            <span className="text-[11px] text-success/70">
                                所有文件将使用此仓库配置
                            </span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={handleClear}
                        >
                            清除
                        </Button>
                    </div>
                )}

                {/* Form */}
                <div className="px-6 py-5 space-y-4">
                    {/* Repository */}
                    <div className="space-y-3 p-3.5 rounded-xl bg-muted/40 border border-border-subtle">
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center shrink-0">
                                <FolderGit2 className="h-3 w-3 text-muted-foreground" />
                            </div>
                            <span className="text-xs font-bold text-foreground tracking-wide">
                                仓库信息
                            </span>
                        </div>
                        <div className="flex gap-2.5">
                            <div className="flex-1 space-y-1.5">
                                <Label className="text-[11px] font-semibold text-muted-foreground">
                                    用户名
                                </Label>
                                <Input
                                    value={owner}
                                    onChange={(e) => setOwner(e.target.value)}
                                    placeholder="如 nyhxiaoning"
                                    className="h-9 text-sm"
                                />
                            </div>
                            <div className="flex-[2] space-y-1.5">
                                <Label className="text-[11px] font-semibold text-muted-foreground">
                                    仓库名
                                </Label>
                                <Input
                                    value={repo}
                                    onChange={(e) => setRepo(e.target.value)}
                                    placeholder="如 my-diagrams"
                                    className="h-9 text-sm"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[11px] font-semibold text-muted-foreground">
                                文件路径
                            </Label>
                            <Input
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                placeholder="如 data/nextall.json"
                                className="h-9 text-sm"
                            />
                            <p className="text-[10.5px] text-muted-foreground">
                                所有图表将存储在此 JSON 文件中。默认路径{" "}
                                <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
                                    data/nextall.json
                                </code>
                            </p>
                        </div>
                    </div>

                    {/* Token */}
                    <div className="space-y-3 p-3.5 rounded-xl bg-muted/40 border border-border-subtle">
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center shrink-0">
                                <FolderGit2 className="h-3 w-3 text-muted-foreground" />
                            </div>
                            <span className="text-xs font-bold text-foreground tracking-wide">
                                认证
                            </span>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[11px] font-semibold text-muted-foreground">
                                Personal Access Token
                            </Label>
                            <div className="flex gap-1.5">
                                <Input
                                    type={showToken ? "text" : "password"}
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    placeholder="ghp_..."
                                    className="h-9 text-sm flex-1"
                                />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-9 w-9 shrink-0"
                                    onClick={() => setShowToken(!showToken)}
                                    title={showToken ? "隐藏" : "显示"}
                                >
                                    {showToken ? (
                                        <EyeOff className="h-3.5 w-3.5" />
                                    ) : (
                                        <Eye className="h-3.5 w-3.5" />
                                    )}
                                </Button>
                            </div>
                            <p className="text-[10.5px] text-muted-foreground">
                                需要{" "}
                                <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
                                    repo
                                </code>{" "}
                                权限。Token 仅保存在本地浏览器中。
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border-subtle flex items-center gap-2">
                    <div className="flex-1">
                        {hasConfig && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive h-8 text-xs"
                                onClick={handleClear}
                            >
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                清除配置
                            </Button>
                        )}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTest}
                        disabled={testing}
                    >
                        {testing ? "测试中..." : "测试连接"}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                    >
                        取消
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving ? "保存中..." : "保存配置"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
