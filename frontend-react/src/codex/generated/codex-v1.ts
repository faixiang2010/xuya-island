export interface paths {
  '/api/v1/codex/access/bootstrap': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /** 从受信本机前端领取短效开发凭据 */
    post: operations['bootstrap']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/artifacts/{id}/content': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['content_1']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/artifacts/{id}/preview': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['preview_1']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/artifacts/{id}/preview/image': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['image']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/attachments': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['attach']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/attachments/{id}/content': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['content']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/automations': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['automations']
    put?: never
    post: operations['createAutomation']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/automations/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put: operations['updateAutomation']
    post?: never
    delete: operations['deleteAutomation']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/chrome/actions': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['action']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/chrome/bridge/exchange': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['exchange']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/chrome/status': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['status']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/chrome/tabs': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['tabs']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/conversations/{id}/agents': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['agents']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/conversations/{id}/agents/{taskId}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['agent']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/conversations/{id}/agents/{taskId}/cancel': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['cancelAgent']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/conversations/{id}/memory': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['memory']
    put: operations['memory_1']
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/conversations/{id}/plan': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['plan']
    put: operations['plan_1']
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/conversations/{id}/resources': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['resources']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/diagnostics': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** 可选服务状态与有界日志诊断 */
    get: operations['diagnostics']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/goals': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['goals']
    put?: never
    post: operations['createGoal']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/goals/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put: operations['updateGoal']
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/mcp/servers': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['list_3']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/mcp/servers/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put: operations['put']
    post?: never
    delete: operations['delete']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/mcp/servers/{id}/connect': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['connect']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/plugins': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['list_2']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/plugins/design/build': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['build']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/plugins/design/export': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['design']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/plugins/design/preview': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['preview']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/plugins/design/verify': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['verify']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/plugins/documents/edit': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['edit']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/plugins/documents/export': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['document']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/plugins/documents/read': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['read']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/plugins/documents/render': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['render']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/plugins/documents/render-status': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['officeStatus']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/plugins/github/issues': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['issue']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/plugins/github/pull-requests': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['pull']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/plugins/github/query': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['query']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/plugins/pdf/export': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['pdf']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/projects': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['projects']
    put?: never
    post: operations['register']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/projects/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['project']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/projects/{id}/workspaces': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['list_1']
    put?: never
    post: operations['create_1']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/settings': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** 工作台配置（密钥不返回） */
    get: operations['settings']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/settings/jev': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    /** 保存可选服务开关 */
    put: operations['optional_1']
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/settings/model': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    /** 保存本机模型配置 */
    put: operations['model']
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/settings/studio': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    /** 保存可选服务开关 */
    put: operations['optional']
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/skills': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** 已安装 Harness 技能 */
    get: operations['skills']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/skills/{name}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    /** 保存或启停本机技能 */
    put: operations['skill']
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/terminals/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post?: never
    delete: operations['close']
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/terminals/{id}/ticket': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['ticket']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/workspaces/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['workspace']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/workspaces/{id}/apply': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: operations['apply']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/workspaces/{id}/diff': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['diff']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/workspaces/{id}/file': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['file']
    put: operations['write']
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/workspaces/{id}/terminals': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['list']
    put?: never
    post: operations['create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/workspaces/{id}/tree': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['tree']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/codex/workspaces/{workspaceId}/terminals/{id}/output': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * 读取共享终端输出
     * @description 省略 after 时返回最近输出；传上次 cursor 增量读取。historyLost 表示旧输出已超出有界缓存；读取不执行命令。
     */
    get: operations['output']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
}
export type webhooks = Record<string, never>
export interface components {
  schemas: {
    Automation: {
      conversationId?: string
      createdAt?: string
      enabled?: boolean
      id?: string
      /** Format: int32 */
      intervalMinutes?: number
      lastStatus?: string
      name?: string
      /** Format: int64 */
      nextRunAt?: number
      prompt?: string
      updatedAt?: string
    }
    CodexArtifactInfo: {
      createdAt?: string
      id?: string
      mediaType?: string
      name?: string
      previewType?: string
      sha256?: string
      /** Format: int64 */
      size?: number
      source?: string
      sourceKind?: string
      workspaceId?: string
    }
    CodexArtifactPreview: {
      id?: string
      imagePath?: string
      mediaType?: string
      text?: string
      type?: string
    }
    CodexCancelSubagent: {
      clientRequestId: string
    }
    CodexChromeAction: {
      action?: string
      selector?: string
      /** Format: int64 */
      tabId?: number
      text?: string
      url?: string
    }
    CodexChromeActionResult: {
      requestId?: string
      result?: {
        [key: string]: unknown
      }
      status?: string
    }
    CodexChromeExchange: {
      extensionId?: string
      requestId?: string
      result?: {
        [key: string]: unknown
      }
      type?: string
    }
    CodexChromeStatus: {
      connected?: boolean
      extensionInstalled?: boolean
      lastSeen?: string
      message?: string
      registrationPresent?: boolean
      /** Format: int64 */
      selectedTabId?: number
    }
    CodexDesignBuild: {
      command?: string
      directory?: string
      outputDirectory?: string
      referenceArtifactId?: string
      workspaceId?: string
    }
    CodexDesignExport: {
      name?: string
      svg: string
      workspaceId: string
    }
    CodexDesignPreview: {
      directory?: string
      referenceArtifactId?: string
      workspaceId: string
    }
    CodexDesignPreviewInfo: {
      build?: components['schemas']['CodexProcessResult']
      expiresAt?: string
      id?: string
      referenceArtifactId?: string
      status?: string
      url?: string
      workspaceId?: string
    }
    CodexDesignVerify: {
      previewId: string
      /** Format: int64 */
      tabId?: number
      workspaceId: string
    }
    CodexDocumentEdit: {
      artifactId: string
      edits?: components['schemas']['CodexDocumentParagraphEdit'][]
      name?: string
      workspaceId: string
    }
    CodexDocumentExport: {
      name?: string
      text: string
      title?: string
      workspaceId: string
    }
    CodexDocumentParagraphEdit: {
      /** Format: int32 */
      index?: number
      text?: string
    }
    CodexDocumentRead: {
      artifactId: string
      workspaceId: string
    }
    CodexGithubIssue: {
      body?: string
      repository: string
      title: string
      workspaceId: string
    }
    CodexGithubPullRequest: {
      base: string
      body?: string
      head: string
      repository: string
      title: string
      workspaceId: string
    }
    CodexGithubQuery: {
      kind: string
      repository: string
      workspaceId: string
    }
    CodexMcpServerInput: {
      allowedTools?: string[]
      args?: string[]
      command?: string
      enabled?: boolean
      environment?: {
        [key: string]: string
      }
      headers?: {
        [key: string]: string
      }
      name?: string
      readOnlyTools?: string[]
      transport?: string
      url?: string
    }
    CodexMcpServerView: {
      allowedTools?: string[]
      appliesTo?: string
      args?: string[]
      command?: string
      enabled?: boolean
      environmentNames?: string[]
      hasSecrets?: boolean
      headerNames?: string[]
      id?: string
      lastError?: string
      name?: string
      readOnlyTools?: string[]
      status?: string
      tools?: components['schemas']['CodexMcpToolInfo'][]
      transport?: string
      url?: string
    }
    CodexMcpToolInfo: {
      description?: string
      inputSchema?: {
        [key: string]: unknown
      }
      name?: string
      readOnly?: boolean
    }
    CodexPluginInfo: {
      actions?: string[]
      id?: string
      name?: string
      status?: string
    }
    CodexProcessResult: {
      /** Format: int32 */
      exitCode?: number
      output?: string
      timedOut?: boolean
      truncated?: boolean
    }
    CodexProjectInfo: {
      createdAt?: string
      git?: boolean
      headRevision?: string
      id?: string
      mode?: string
      name?: string
      path?: string
    }
    CodexProjectRegister: {
      mode?: string
      name: string
      path: string
    }
    CodexTerminalCreate: {
      /** Format: int32 */
      cols?: number
      directory?: string
      /** Format: int32 */
      rows?: number
      shell?: string
    }
    CodexTerminalInfo: {
      createdAt?: string
      directory?: string
      environment?: string
      id?: string
      /** Format: int64 */
      lastActivity?: number
      running?: boolean
      shell?: string
      workspaceId?: string
    }
    /** @description 共享 PTY 原始输出，游标为 UTF-16 字符偏移，ANSI 控制符保留 */
    CodexTerminalOutput: {
      /** Format: int64 */
      cursor?: number
      /** Format: int64 */
      fromCursor?: number
      hasMore?: boolean
      historyLost?: boolean
      /** Format: int64 */
      latestCursor?: number
      running?: boolean
      terminalId?: string
      text?: string
    }
    CodexTerminalTicket: {
      /** Format: int64 */
      expiresAt?: number
      ticket?: string
      webSocketPath?: string
    }
    CodexWorkspaceApply: {
      expectedSourceRevision: string
      resultRevision: string
      strategy?: string
    }
    CodexWorkspaceApplyResult: {
      applied?: string[]
      conflicts?: components['schemas']['CodexWorkspaceConflict'][]
      sourceRevision?: string
      status?: string
    }
    CodexWorkspaceConflict: {
      mergedContent?: string
      path?: string
      reason?: string
    }
    CodexWorkspaceCreate: {
      baseRef?: string
      dockerImage?: string
      environment?: string
      mode?: string
    }
    CodexWorkspaceDiff: {
      currentSourceRevision?: string
      files?: components['schemas']['CodexWorkspaceDiffFile'][]
      resultRevision?: string
      sourceRevision?: string
      workspaceId?: string
    }
    CodexWorkspaceDiffFile: {
      after?: string
      afterHash?: string
      before?: string
      beforeHash?: string
      binary?: boolean
      patch?: string
      path?: string
      status?: string
    }
    CodexWorkspaceEntry: {
      directory?: boolean
      hash?: string
      name?: string
      path?: string
      /** Format: int64 */
      size?: number
    }
    CodexWorkspaceFile: {
      content?: string
      hash?: string
      path?: string
      /** Format: int64 */
      size?: number
    }
    CodexWorkspaceInfo: {
      containerId?: string
      createdAt?: string
      dockerImage?: string
      environment?: string
      id?: string
      mode?: string
      path?: string
      projectId?: string
      sourceRevision?: string
      status?: string
    }
    CodexWorkspaceTree: {
      entries?: components['schemas']['CodexWorkspaceEntry'][]
      path?: string
    }
    CodexWorkspaceWrite: {
      content?: string
      expectedHash?: string
      path: string
    }
    Goal: {
      conversationId?: string
      createdAt?: string
      id?: string
      /** Format: int64 */
      maxActiveMs?: number
      /** Format: int64 */
      maxTokens?: number
      status?: string
      title?: string
      updatedAt?: string
    }
    Plan: {
      conversationId?: string
      /** Format: int32 */
      revision?: number
      steps?: {
        [key: string]: unknown
      }[]
      title?: string
      updatedAt?: string
    }
  }
  responses: never
  parameters: never
  requestBodies: never
  headers: never
  pathItems: never
}
export type $defs = Record<string, never>
export interface operations {
  bootstrap: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  content_1: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': string
        }
      }
    }
  }
  preview_1: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexArtifactPreview']
        }
      }
    }
  }
  image: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': string
        }
      }
    }
  }
  attach: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: {
      content: {
        'multipart/form-data': {
          conversationId: string
          /** Format: binary */
          file: string
        }
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': Record<string, never>
        }
      }
    }
  }
  content: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': string
        }
      }
    }
  }
  automations: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['Automation'][]
        }
      }
    }
  }
  createAutomation: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': {
          [key: string]: unknown
        }
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['Automation']
        }
      }
    }
  }
  updateAutomation: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': {
          [key: string]: unknown
        }
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['Automation']
        }
      }
    }
  }
  deleteAutomation: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  action: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexChromeAction']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexChromeActionResult']
        }
      }
    }
  }
  exchange: {
    parameters: {
      query?: never
      header?: {
        'X-Codex-Chrome-Bridge'?: string
      }
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexChromeExchange']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  status: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexChromeStatus']
        }
      }
    }
  }
  tabs: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  agents: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }[]
        }
      }
    }
  }
  agent: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
        taskId: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  cancelAgent: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
        taskId: string
      }
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexCancelSubagent']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  memory: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }[]
        }
      }
    }
  }
  memory_1: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': {
          [key: string]: string
        }
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  plan: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  plan_1: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': {
          [key: string]: unknown
        }
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['Plan']
        }
      }
    }
  }
  resources: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  diagnostics: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  goals: {
    parameters: {
      query: {
        conversationId: string
      }
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['Goal'][]
        }
      }
    }
  }
  createGoal: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': {
          [key: string]: unknown
        }
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['Goal']
        }
      }
    }
  }
  updateGoal: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': {
          [key: string]: unknown
        }
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['Goal']
        }
      }
    }
  }
  list_3: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexMcpServerView'][]
        }
      }
    }
  }
  put: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexMcpServerInput']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexMcpServerView']
        }
      }
    }
  }
  delete: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  connect: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexMcpServerView']
        }
      }
    }
  }
  list_2: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexPluginInfo'][]
        }
      }
    }
  }
  build: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexDesignBuild']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexDesignPreviewInfo']
        }
      }
    }
  }
  design: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexDesignExport']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexArtifactInfo']
        }
      }
    }
  }
  preview: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexDesignPreview']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexDesignPreviewInfo']
        }
      }
    }
  }
  verify: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexDesignVerify']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  edit: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexDocumentEdit']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexArtifactInfo']
        }
      }
    }
  }
  document: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexDocumentExport']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexArtifactInfo']
        }
      }
    }
  }
  read: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexDocumentRead']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  render: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexDocumentRead']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexArtifactInfo']
        }
      }
    }
  }
  officeStatus: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  issue: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexGithubIssue']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  pull: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexGithubPullRequest']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  query: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexGithubQuery']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  pdf: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexDocumentExport']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexArtifactInfo']
        }
      }
    }
  }
  projects: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexProjectInfo'][]
        }
      }
    }
  }
  register: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexProjectRegister']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexProjectInfo']
        }
      }
    }
  }
  project: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexProjectInfo']
        }
      }
    }
  }
  list_1: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexWorkspaceInfo'][]
        }
      }
    }
  }
  create_1: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexWorkspaceCreate']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexWorkspaceInfo']
        }
      }
    }
  }
  settings: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  optional_1: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': {
          [key: string]: unknown
        }
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  model: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': {
          [key: string]: unknown
        }
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  optional: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': {
          [key: string]: unknown
        }
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  skills: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }[]
        }
      }
    }
  }
  skill: {
    parameters: {
      query?: never
      header?: never
      path: {
        name: string
      }
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': {
          [key: string]: unknown
        }
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: unknown
          }
        }
      }
    }
  }
  close: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': {
            [key: string]: boolean
          }
        }
      }
    }
  }
  ticket: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexTerminalTicket']
        }
      }
    }
  }
  workspace: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexWorkspaceInfo']
        }
      }
    }
  }
  apply: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexWorkspaceApply']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexWorkspaceApplyResult']
        }
      }
    }
  }
  diff: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexWorkspaceDiff']
        }
      }
    }
  }
  file: {
    parameters: {
      query: {
        path: string
      }
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexWorkspaceFile']
        }
      }
    }
  }
  write: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexWorkspaceWrite']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexWorkspaceFile']
        }
      }
    }
  }
  list: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexTerminalInfo'][]
        }
      }
    }
  }
  create: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CodexTerminalCreate']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexTerminalInfo']
        }
      }
    }
  }
  tree: {
    parameters: {
      query?: {
        path?: string
      }
      header?: never
      path: {
        id: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexWorkspaceTree']
        }
      }
    }
  }
  output: {
    parameters: {
      query?: {
        after?: number
        maxChars?: number
      }
      header?: never
      path: {
        id: string
        workspaceId: string
      }
      cookie?: never
    }
    requestBody?: never
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['CodexTerminalOutput']
        }
      }
    }
  }
}
