export interface paths {
  '/api/v1/agents': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** 可用编码智能体 */
    get: operations['agents']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/agents/capabilities': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** 服务端实际模型与执行能力 */
    get: operations['capabilities']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/capabilities': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** 服务端实际模型与执行能力 */
    get: operations['capabilities_1']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/conversations': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** 查询会话列表 */
    get: operations['list']
    put?: never
    /** 创建独立工作区会话 */
    post: operations['create']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/conversations/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: operations['get']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    /**
     * 修改聊天偏好或运行设置
     * @description 置顶/改名不触发任务；归档有活动执行的聊天返回409，恢复保留原ID和工作目录。
     */
    patch: operations['configure']
    trace?: never
  }
  '/api/v1/conversations/{id}/actions': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /** 补充要求、中断、取消、继续或配置会话 */
    post: operations['action']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/conversations/{id}/events': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /**
     * 订阅AG-UI投影事件
     * @description Last-Event-ID或after指定最后观察的游标。断开只结束观察，不取消后台任务
     */
    get: operations['events']
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/conversations/{id}/interactions/{interactionId}/responses': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /** 幂等回答提问或工具审批 */
    post: operations['respond']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/conversations/{id}/runs': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    /**
     * 幂等提交后台任务
     * @description 同一clientRequestId重试观察原任务，不重复执行；不同内容返回409
     */
    post: operations['submit']
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/conversations/{id}/snapshot': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    /** 获取固定游标的会话快照 */
    get: operations['snapshot']
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
    Action: {
      action: string
      clientRequestId: string
      executionId?: string
      settings?: {
        [key: string]: unknown
      }
      text?: string
    }
    Conversation: {
      archived?: boolean
      createdAt?: string
      id?: string
      /** Format: int64 */
      maxActiveMs?: number
      /** Format: int64 */
      maxTokens?: number
      modelId?: string
      permissionMode?: string
      /** @description 聊天置顶偏好，归档与恢复保留此值 */
      pinned?: boolean
      planMode?: boolean
      projectId?: string
      reasoningEffort?: string
      title?: string
      updatedAt?: string
      workspaceId?: string
    }
    /** @description 仅发送需修改的字段；偏好变更不启动 Agent */
    ConversationPatch: {
      archived?: boolean
      /** Format: int64 */
      maxActiveMs?: number
      /** Format: int64 */
      maxTokens?: number
      modelId?: string
      permissionMode?: string
      pinned?: boolean
      planMode?: boolean
      reasoningEffort?: string
      title?: string
    }
    ConversationSnapshot: {
      conversation?: components['schemas']['Conversation']
      /** Format: int64 */
      cursor?: number
      goals?: components['schemas']['Goal'][]
      messages?: components['schemas']['Message'][]
      pendingInteractions?: components['schemas']['InteractionRequest'][]
      plan?: components['schemas']['Plan']
      runs?: components['schemas']['Run'][]
      usage?: components['schemas']['Usage']
    }
    CreateConversation: {
      /** Format: int64 */
      maxActiveMs?: number
      /** Format: int64 */
      maxTokens?: number
      modelId?: string
      permissionMode?: string
      planMode?: boolean
      /** @description 可选项目标识；省略时创建独立会话，项目聊天须同时提供工作区 */
      projectId?: string
      reasoningEffort?: string
      title?: string
      /** @description 项目工作区标识；独立会话由服务端自动分配目录 */
      workspaceId?: string
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
    InteractionRequest: {
      arguments?: {
        [key: string]: unknown
      }
      id?: string
      kind?: string
      message?: string
      responseSchema?: {
        [key: string]: unknown
      }
      toolCallId?: string
      toolName?: string
    }
    Message: {
      attachments?: {
        [key: string]: unknown
      }[]
      content?: string
      id?: string
      role?: string
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
    Respond: {
      clientRequestId: string
      payload?: {
        [key: string]: unknown
      }
    }
    Run: {
      clientRequestId?: string
      createdAt?: string
      executionId?: string
      status?: string
    }
    RunReceipt: {
      clientRequestId?: string
      conversationId?: string
      eventsUrl?: string
      executionId?: string
      status?: string
    }
    ServerSentEventString: unknown
    SubmitRun: {
      attachments?: {
        [key: string]: unknown
      }[]
      clientRequestId: string
      text: string
    }
    Usage: {
      /** Format: int64 */
      activeMs?: number
      /** Format: int64 */
      tokens?: number
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
  agents: {
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
  capabilities: {
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
  capabilities_1: {
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
  list: {
    parameters: {
      query?: {
        projectId?: string
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
          '*/*': components['schemas']['Conversation'][]
        }
      }
    }
  }
  create: {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateConversation']
      }
    }
    responses: {
      /** @description Created */
      201: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['Conversation']
        }
      }
    }
  }
  get: {
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
          '*/*': components['schemas']['Conversation']
        }
      }
    }
  }
  configure: {
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
        'application/json': components['schemas']['ConversationPatch']
      }
    }
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['Conversation']
        }
      }
    }
  }
  action: {
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
        'application/json': components['schemas']['Action']
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
  events: {
    parameters: {
      query?: {
        after?: number
        cursor?: number
      }
      header?: {
        'Last-Event-ID'?: string
      }
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
          'text/event-stream': components['schemas']['ServerSentEventString'][]
        }
      }
    }
  }
  respond: {
    parameters: {
      query?: never
      header?: never
      path: {
        id: string
        interactionId: string
      }
      cookie?: never
    }
    requestBody: {
      content: {
        'application/json': components['schemas']['Respond']
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
  submit: {
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
        'application/json': components['schemas']['SubmitRun']
      }
    }
    responses: {
      /** @description Accepted */
      202: {
        headers: {
          [name: string]: unknown
        }
        content: {
          '*/*': components['schemas']['RunReceipt']
        }
      }
    }
  }
  snapshot: {
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
          '*/*': components['schemas']['ConversationSnapshot']
        }
      }
    }
  }
}
