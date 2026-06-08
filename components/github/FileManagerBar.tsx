"use client"

import { FileJson, Github, Plus } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { type DiagramFile, listFiles } from "@/lib/diagram-files"
import { FileListDialog } from "./FileListDialog"

interface FileManagerBarProps {
    currentFileId: string | null
    onFileSelect: (file: DiagramFile) => void
}

export function FileManagerBar({
    currentFileId,
    onFileSelect,
}: FileManagerBarProps) {
    const [open, setOpen] = useState(false)
    const [files, setFiles] = useState<DiagramFile[]>([])
    const currentFile = files.find((f) => f.id === currentFileId)

    useEffect(() => {
        if (open) {
            listFiles().then(setFiles)
        }
    }, [open])

    const handleOpen = () => setOpen(true)

    const hasSync = currentFile?.githubOwner && currentFile?.githubToken

    return (
        <>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-1/50 border-b border-border-subtle">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0"
                    onClick={handleOpen}
                >
                    <FileJson className="h-3.5 w-3.5" />
                    文件
                    {files.length > 0 && (
                        <span className="text-[10px] text-muted-foreground/60">
                            {files.length}
                        </span>
                    )}
                </Button>

                {currentFile && (
                    <>
                        <span className="text-muted-foreground/30">/</span>
                        <span className="text-xs font-medium text-foreground/80 truncate max-w-[200px]">
                            {currentFile.name}
                        </span>
                        {hasSync && (
                            <Github className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                        )}
                    </>
                )}

                <div className="flex-1" />

                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
                    onClick={handleOpen}
                >
                    <Plus className="h-3.5 w-3.5" />
                    新建 / 管理
                </Button>
            </div>

            <FileListDialog
                open={open}
                onOpenChange={setOpen}
                selectedFileId={currentFileId}
                onFileSelect={(file) => {
                    onFileSelect(file)
                    setOpen(false)
                }}
                onFilesChange={setFiles}
            />
        </>
    )
}
