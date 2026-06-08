export interface GitHubContent {
    name: string
    path: string
    sha: string
    size: number
    type: "file" | "dir"
    content?: string
    download_url?: string | null
}

export interface GitHubTreeItem {
    path: string
    mode: "100644" | "100755" | "040000" | "160000" | "120000"
    type: "blob" | "tree" | "commit"
    sha: string
}

const GITHUB_API = "https://api.github.com"

class GitHubApiError extends Error {
    status: number
    constructor(message: string, status: number) {
        super(message)
        this.name = "GitHubApiError"
        this.status = status
    }
}

async function request(
    token: string,
    url: string,
    options: RequestInit = {},
): Promise<Response> {
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "next-ai-draw-io",
            ...options.headers,
        },
    })

    if (!res.ok) {
        let message = `GitHub API error: ${res.status}`
        try {
            const body = await res.json()
            if (body.message) message = body.message
        } catch {}
        throw new GitHubApiError(message, res.status)
    }

    return res
}

export async function getFile(
    token: string,
    owner: string,
    repo: string,
    path: string,
): Promise<{ data: GitHubContent; sha: string } | null> {
    try {
        const res = await request(
            token,
            `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
        )
        const data: GitHubContent = await res.json()
        return { data, sha: data.sha }
    } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) {
            return null
        }
        throw error
    }
}

export async function createOrUpdateFile(
    token: string,
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    sha?: string,
): Promise<{ content: GitHubContent; sha: string }> {
    const body: Record<string, string> = {
        message,
        content: btoa(content),
    }
    if (sha) body.sha = sha

    const res = await request(
        token,
        `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
        {
            method: "PUT",
            body: JSON.stringify(body),
        },
    )

    const data: GitHubContent & { content: GitHubContent } = await res.json()
    return { content: data.content, sha: data.content.sha }
}

export async function deleteFile(
    token: string,
    owner: string,
    repo: string,
    path: string,
    sha: string,
    message: string,
): Promise<void> {
    await request(
        token,
        `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
        {
            method: "DELETE",
            body: JSON.stringify({ message, sha }),
        },
    )
}

export async function listFiles(
    token: string,
    owner: string,
    repo: string,
    path: string,
): Promise<GitHubContent[]> {
    try {
        const res = await request(
            token,
            `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
        )
        const data: GitHubContent[] = await res.json()
        return data
    } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) {
            return []
        }
        throw error
    }
}

export async function getRepoDefaultBranch(
    token: string,
    owner: string,
    repo: string,
): Promise<string> {
    const res = await request(token, `${GITHUB_API}/repos/${owner}/${repo}`)
    const data: { default_branch: string } = await res.json()
    return data.default_branch
}

export { GitHubApiError }
