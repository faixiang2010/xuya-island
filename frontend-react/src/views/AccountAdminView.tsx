import { useEffect, useState, useRef } from 'react'
import { Button, ConfigProvider, Form, Input, Modal, Select, Switch, Tabs, message } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { ProTable, type ProColumns } from '@ant-design/pro-components'
import { familyApi, type FamilyMenu, type FamilyRole, type FamilyUser } from '../account/api'
import PythonSettings from '../account/PythonSettings'
import NetworkSettings from '../account/NetworkSettings'
import FamilyGrowthAdmin from '../account/FamilyGrowthAdmin'
import FamilyPanel from '../components/FamilyPanel'
import RewardRules from '../account/RewardRules'
import './FamilyPages.css'
import { useSearchParams } from 'react-router-dom'

type Audit = {
  id: number
  actor: string
  action: string
  target: string
  success: boolean
  createdAt: string
}
export default function AccountAdminView() {
  const [parameters] = useSearchParams()
  const [users, setUsers] = useState<FamilyUser[]>([])
  const [roles, setRoles] = useState<FamilyRole[]>([])
  const [menus, setMenus] = useState<FamilyMenu[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [captchaMode, setCaptchaMode] = useState('always')
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<{ type: 'users' | 'roles' | 'menus'; id?: string }>()
  const [advanced, setAdvanced] = useState(false)
  const [tab, setTab] = useState(() => {
    const section = parameters.get('section')
    if (section === 'growth') return 'growth'
    if (section === 'running') return 'running'
    return 'users'
  })
  const [advancedErrors, setAdvancedErrors] = useState<Record<string, string>>({})
  const [userError, setUserError] = useState('')
  const [roleError, setRoleError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [resetTarget, setResetTarget] = useState<FamilyUser>()
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [form] = Form.useForm()
  const [feedback, contextHolder] = message.useMessage()
  async function load() {
    setLoading(true)
    setUserError('')
    try {
      setUsers(await familyApi<FamilyUser[]>('/system/users'))
    } catch (error) {
      setUserError(error instanceof Error ? error.message : '家人账户未能读取')
    } finally {
      setLoading(false)
    }
  }
  async function loadAdvanced() {
    const tasks = [
      ['roles', '/system/roles', (value: FamilyRole[]) => setRoles(value)],
      ['menus', '/system/menus', (value: FamilyMenu[]) => setMenus(value)],
      ['audit', '/system/audit', (value: Audit[]) => setAudit(value)],
      [
        'security',
        '/system/security',
        (value: { captchaMode: string }) => setCaptchaMode(value.captchaMode),
      ],
    ] as const
    await Promise.all(
      tasks.map(async ([key, url, apply]) => {
        try {
          const value = await familyApi(url)
          ;(apply as (value: unknown) => void)(value)
          setAdvancedErrors((previous) => ({ ...previous, [key]: '' }))
        } catch (error) {
          setAdvancedErrors((previous) => ({
            ...previous,
            [key]: error instanceof Error ? error.message : '未能读取设置',
          }))
        }
      }),
    )
  }
  useEffect(() => {
    void load()
    void loadRoles()
  }, [])
  async function loadRoles() {
    setRoleError('')
    try {
      setRoles(await familyApi<FamilyRole[]>('/system/roles'))
    } catch (error) {
      setRoleError(error instanceof Error ? error.message : '身份列表未能读取')
    }
  }
  useEffect(() => {
    if (advanced) void loadAdvanced()
  }, [advanced])
  async function reset() {
    if (!resetTarget || pending.current) return
    if (
      resetPassword.length < 8 ||
      resetPassword.length > 64 ||
      new TextEncoder().encode(resetPassword).length > 72
    ) {
      setResetError('密码需8至64个字符，UTF-8不超过72字节')
      return
    }
    pending.current = true
    setBusy(true)
    setResetError('')
    try {
      await familyApi('/system/users/' + encodeURIComponent(resetTarget.id), 'PUT', {
        username: resetTarget.username,
        nickname: resetTarget.nickname,
        enabled: resetTarget.enabled,
        roles: resetTarget.roles,
        password: resetPassword,
      })
      setResetTarget(undefined)
      setResetPassword('')
      void feedback.success('密码已重置，下次登录须修改')
      await load()
    } catch (error) {
      setResetError(error instanceof Error ? error.message : '没有重置，请重试')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  function toggleUser(user: FamilyUser) {
    Modal.confirm({
      title: (user.enabled ? '停用' : '启用') + '“' + user.nickname + '”的账户？',
      content: user.enabled ? '该家人将无法登录，作品与学习记录仍然保留。' : '该家人可以重新登录。',
      okText: user.enabled ? '确认停用' : '确认启用',
      cancelText: '先不修改',
      onOk: async () => {
        if (pending.current) return
        pending.current = true
        setBusy(true)
        try {
          await familyApi('/system/users/' + encodeURIComponent(user.id), 'PUT', {
            username: user.username,
            nickname: user.nickname,
            roles: user.roles,
            enabled: !user.enabled,
          })
          await load()
        } catch (error) {
          void feedback.error(error instanceof Error ? error.message : '未能修改')
          throw error
        } finally {
          pending.current = false
          setBusy(false)
        }
      },
    })
  }
  function edit(type: 'users' | 'roles' | 'menus', value?: FamilyUser | FamilyRole | FamilyMenu) {
    form.resetFields()
    form.setFieldsValue(
      value
        ? { ...value, password: '' }
        : {
            enabled: true,
            roles: ['learner'],
            kind: 'menu',
            menuIds: [],
            sortOrder: 100,
            parentId: null,
          },
    )
    setEditing({ type, id: value?.id })
  }
  async function save() {
    if (!editing || pending.current) return
    pending.current = true
    setBusy(true)
    try {
      const value = await form.validateFields()
      await familyApi(
        `/system/${editing.type}${editing.id ? '/' + encodeURIComponent(editing.id) : ''}`,
        editing.id ? 'PUT' : 'POST',
        value,
      )
      setEditing(undefined)
      void feedback.success('已保存。权限调整会在后续请求中生效。')
      await load()
      if (advanced) await loadAdvanced()
    } catch (error) {
      if (error instanceof Error) void feedback.error(error.message)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  function userActions(value: FamilyUser) {
    return (
      <div className="family-actions">
        <Button type="link" disabled={busy} onClick={() => edit('users', value)}>
          编辑资料
        </Button>
        <Button
          type="link"
          disabled={busy}
          onClick={() => {
            setResetTarget(value)
            setResetPassword('')
            setResetError('')
          }}
        >
          重置密码
        </Button>
        <Button
          type="link"
          disabled={
            busy ||
            (value.enabled &&
              value.roles.includes('super-admin') &&
              users.filter((user) => user.enabled && user.roles.includes('super-admin')).length <=
                1)
          }
          onClick={() => toggleUser(value)}
        >
          {value.enabled ? '停用' : '启用'}
        </Button>
      </div>
    )
  }
  const userColumns: ProColumns<FamilyUser>[] = [
    { title: '账号', dataIndex: 'username', width: 108 },
    { title: '昵称', dataIndex: 'nickname', width: 108 },
    {
      title: '角色',
      dataIndex: 'roles',
      width: 128,
      render: (_, value) =>
        value.roles.map((id) => roles.find((role) => role.id === id)?.name ?? id).join('、'),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 76,
      render: (_, value) => (value.enabled ? '可登录' : '已停用'),
    },
    {
      title: '密码',
      dataIndex: 'changePassword',
      width: 116,
      render: (_, value) => (value.changePassword ? '首次登录须修改' : '已设置'),
    },
    {
      title: '管理',
      valueType: 'option',
      width: 196,
      // 重置密码/停用是这一页唯一的目的，窄窗口下必须始终留在视野内。
      fixed: 'right',
      render: (_, value) => userActions(value),
    },
  ]
  const roleColumns: ProColumns<FamilyRole>[] = [
    { title: '角色', dataIndex: 'name', width: 130 },
    { title: '说明', dataIndex: 'description', width: 220 },
    {
      title: '授权菜单与操作',
      width: 420,
      render: (_, value) =>
        value.menuIds.map((id) => menus.find((menu) => menu.id === id)?.title ?? id).join('、'),
    },
    { title: '状态', width: 90, render: (_, value) => (value.enabled ? '启用' : '停用') },
    {
      title: '管理',
      valueType: 'option',
      width: 120,
      fixed: 'right',
      render: (_, value) =>
        value.id === 'super-admin' ? (
          '内置保护'
        ) : (
          <Button type="link" onClick={() => edit('roles', value)}>
            编辑权限
          </Button>
        ),
    },
  ]
  const menuColumns: ProColumns<FamilyMenu>[] = [
    { title: '菜单名称', dataIndex: 'title', width: 150 },
    {
      title: '类型',
      dataIndex: 'kind',
      width: 110,
      valueEnum: { menu: '页面', directory: '目录', action: '操作权限' },
    },
    { title: '页面', dataIndex: 'path', width: 190 },
    { title: '权限', dataIndex: 'permission', width: 180 },
    { title: '排序', dataIndex: 'sortOrder', width: 80 },
    { title: '状态', width: 80, render: (_, value) => (value.enabled ? '启用' : '停用') },
    {
      title: '管理',
      valueType: 'option',
      width: 90,
      render: (_, value) => (
        <Button type="link" onClick={() => edit('menus', value)}>
          编辑
        </Button>
      ),
    },
  ]
  const auditColumns: ProColumns<Audit>[] = [
    { title: '时间', dataIndex: 'createdAt', valueType: 'dateTime', width: 190 },
    { title: '操作人', dataIndex: 'actor', width: 140 },
    { title: '操作', dataIndex: 'action', width: 150 },
    { title: '对象', dataIndex: 'target', width: 180 },
    { title: '结果', width: 90, render: (_, value) => (value.success ? '成功' : '失败') },
  ]
  const pages = [
    ['/', '学习地图'],
    ['/games', '游戏中心'],
    ['/classroom', '编程课堂'],
    ['/adventure/town-cup-order', '故事冒险'],
    ['/studio', '小奇创作室'],
    ['/works', '我的作品'],
    ['/growth', '成长手册'],
    ['/codex', '码穹'],
    ['/admin', '家庭管理'],
    ['', '无页面'],
  ]
  const permissions = [
    '',
    'learning:read',
    'games:use',
    'classroom:use',
    'adventure:use',
    'studio:use',
    'works:manage',
    'execution:run',
    'codex:access',
    'codex:workspace',
    'codex:terminal',
    'codex:plugin',
    'system:manage',
    'system:python',
    'rewards:manage',
  ]
  const sections = [
    { key: 'python', label: 'Python环境', children: <PythonSettings /> },
    { key: 'network', label: '局域网共享', children: <NetworkSettings /> },
    {
      key: 'growth',
      label: '成长与礼物',
      children: (
        <FamilyGrowthAdmin
          users={users}
          onAddLearner={() => {
            setTab('users')
            edit('users')
          }}
        />
      ),
    },
    {
      key: 'users',
      label: '家人账户',
      children: (
        <>
          <div className="family-mobile-list family-paper">
            <Button type="primary" onClick={() => edit('users')}>
              添加账户
            </Button>
            {loading ? (
              <p role="status">正在读取家人账户…</p>
            ) : (
              users.map((user) => (
                <article key={user.id}>
                  <h3>{user.nickname}</h3>
                  <p>账号：{user.username}</p>
                  <p>
                    身份：
                    {user.roles
                      .map((id) => roles.find((role) => role.id === id)?.name ?? id)
                      .join('、')}
                  </p>
                  <span className="family-status">{user.enabled ? '可登录' : '已停用'}</span>
                  {user.changePassword && <p className="family-secondary">首次登录须修改密码</p>}
                  {userActions(user)}
                </article>
              ))
            )}
          </div>
          <div className="family-desktop-table">
            <ProTable
              rowKey="id"
              columns={userColumns}
              dataSource={users}
              loading={loading}
              search={false}
              options={{ reload: () => void load() }}
              toolBarRender={() => [
                <Button key="add" type="primary" onClick={() => edit('users')}>
                  添加账户
                </Button>,
              ]}
              pagination={users.length > 10 ? { pageSize: 10 } : false}
              scroll={{ x: 732 }}
            />
          </div>
        </>
      ),
    },
    {
      key: 'roles',
      label: '角色与权限',
      children: (
        <ProTable
          rowKey="id"
          columns={roleColumns}
          dataSource={roles}
          search={false}
          options={false}
          scroll={{ x: 980 }}
          toolBarRender={() => [
            <Button key="add" type="primary" onClick={() => edit('roles')}>
              添加角色
            </Button>,
          ]}
        />
      ),
    },
    {
      key: 'menus',
      label: '菜单',
      children: (
        <ProTable
          rowKey="id"
          columns={menuColumns}
          dataSource={menus}
          search={false}
          options={false}
          scroll={{ x: 880 }}
          toolBarRender={() => [
            <Button key="add" onClick={() => edit('menus')}>
              添加菜单
            </Button>,
          ]}
        />
      ),
    },
    {
      key: 'security',
      label: '登录防护',
      children: (
        <section>
          <h2>验证码展示策略</h2>
          <p>始终展示适合局域网访问；自适应在连续失败3次后展示。连续失败5次将暂停登录15分钟。</p>
          <Select
            aria-label="验证码展示策略"
            style={{ width: 240 }}
            value={captchaMode}
            options={[
              { value: 'always', label: '始终展示（默认）' },
              { value: 'adaptive', label: '自适应展示' },
              { value: 'off', label: '关闭验证码' },
            ]}
            onChange={setCaptchaMode}
          />
          <Button
            style={{ marginLeft: 12 }}
            type="primary"
            loading={busy}
            onClick={() =>
              void (async () => {
                if (pending.current) return
                pending.current = true
                setBusy(true)
                try {
                  await familyApi('/system/security', 'PUT', { captchaMode })
                  void feedback.success('登录防护已保存')
                } catch (error) {
                  void feedback.error(error instanceof Error ? error.message : '没有保存')
                } finally {
                  pending.current = false
                  setBusy(false)
                }
              })()
            }
          >
            保存设置
          </Button>
        </section>
      ),
    },
    {
      key: 'audit',
      label: '管理记录',
      children: (
        <ProTable
          rowKey="id"
          columns={auditColumns}
          dataSource={audit}
          search={false}
          options={{ reload: () => void load() }}
          pagination={{ pageSize: 15 }}
          scroll={{ x: 750 }}
        />
      ),
    },
  ]
  return (
    <ConfigProvider
      locale={zhCN}
      // 全站按钮都写紧凑中文标签；关掉 antd 自动插入的空格，与自研按钮排版一致。
      button={{ autoInsertSpace: false }}
      renderEmpty={() => <p className="family-secondary">暂时没有记录</p>}
      theme={{
        // 与全站设计 token 对齐：主操作=芽绿，圆角/边框/字号沿用同一套值。
        token: {
          colorPrimary: '#33a46d',
          colorLink: '#1c6e48',
          colorInfo: '#33a46d',
          colorBorderSecondary: '#e6e1d6',
          colorBgContainer: '#ffffff',
          colorText: '#22303f',
          borderRadius: 10,
          fontFamily: 'inherit',
          fontSize: 16,
        },
        components: {
          // 芽绿底上的文字用深墨绿（与全站 --on-brand 一致）：白字只有 3.15，不达 AA。
          Button: {
            primaryColor: '#0f2318',
          },
          Table: {
            headerBg: '#eeebe3',
            headerColor: '#22303f',
            headerSplitColor: 'transparent',
            borderColor: '#e6e1d6',
            rowHoverBg: '#e6f7ee',
          },
          Tabs: {
            inkBarColor: '#33a46d',
            itemSelectedColor: '#1c6e48',
            itemHoverColor: '#1c6e48',
          },
        },
      }}
    >
      {contextHolder}
      <main className="family-page account-admin">
        <header className="family-heading">
          <div>
            <h1>家庭管理</h1>
            {/* 只读标题：为下面各分区的 h3 补齐层级，屏幕阅读器导航才连续。 */}
            <h2 className="sr-only">家人账户、运行与共享和成长设置</h2>
            <p>准备好小岛，让家人安心探索。</p>
          </div>
          <Button onClick={() => setAdvanced(true)}>高级设置</Button>
        </header>
        {userError && (
          <div role="alert" className="family-error">
            {userError}
            <Button onClick={() => void load()}>重试账户读取</Button>
          </div>
        )}
        {roleError && (
          <div role="alert" className="family-error">
            {roleError}
            <Button onClick={() => void loadRoles()}>重试身份读取</Button>
          </div>
        )}
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            sections.find((item) => item.key === 'users')!,
            {
              key: 'running',
              label: '运行与共享',
              children: (
                <>
                  <PythonSettings />
                  <NetworkSettings />
                </>
              ),
            },
            sections.find((item) => item.key === 'growth')!,
          ]}
        />
        {/* 高级设置里都是多列表格，面板要够宽，表格再各自横向滚动。 */}
        <FamilyPanel
          open={advanced}
          title="高级设置"
          width="min(1040px, 100vw)"
          onClose={() => setAdvanced(false)}
        >
          <Tabs
            items={sections
              .filter((item) => ['roles', 'menus', 'security', 'audit'].includes(item.key))
              .map((item) => ({
                ...item,
                children: advancedErrors[item.key] ? (
                  <div role="alert" className="family-error">
                    {advancedErrors[item.key]}
                    <Button onClick={() => void loadAdvanced()}>重新读取</Button>
                  </div>
                ) : (
                  item.children
                ),
              }))
              .concat([{ key: 'rules', label: '奖励规则', children: <RewardRules /> }])}
          />
        </FamilyPanel>
        <Modal
          open={!!resetTarget}
          title="重置密码"
          onCancel={() => {
            if (!busy) {
              setResetTarget(undefined)
              setResetPassword('')
            }
          }}
          onOk={() => void reset()}
          confirmLoading={busy}
          maskClosable={!busy}
        >
          <p>
            为“{resetTarget?.nickname}”（{resetTarget?.username}
            ）设置临时密码。原登录将失效，下次登录须修改密码。
          </p>
          <Input.Password
            aria-label="新的临时密码"
            value={resetPassword}
            onChange={(event) => setResetPassword(event.target.value)}
            disabled={busy}
            autoComplete="new-password"
          />
          {resetError && <p role="alert">{resetError}</p>}
        </Modal>
        <Modal
          open={!!editing}
          title={
            editing?.type === 'users'
              ? '准备家庭账户'
              : editing?.type === 'roles'
                ? '分配角色权限'
                : '配置菜单'
          }
          onCancel={() => {
            if (!busy) setEditing(undefined)
          }}
          confirmLoading={busy}
          maskClosable={!busy}
          onOk={() => void save()}
          destroyOnHidden
        >
          <Form form={form} layout="vertical" disabled={busy}>
            {editing?.type === 'users' && (
              <>
                <Form.Item
                  name="username"
                  label="账号（创建后不能修改）"
                  rules={[
                    { required: true },
                    {
                      pattern: /^[A-Za-z0-9_-]{3,40}$/,
                      message: '3至40位字母、数字、下划线或短横线',
                    },
                  ]}
                >
                  <Input disabled={!!editing.id} autoComplete="off" />
                </Form.Item>
                <Form.Item name="nickname" label="昵称" rules={[{ required: true, max: 40 }]}>
                  <Input />
                </Form.Item>
                <Form.Item
                  hidden={!!editing.id}
                  name="password"
                  label="初始密码（首次登录须修改）"
                  rules={[
                    { required: !editing.id },
                    { min: 8, max: 64 },
                    {
                      validator: (_, value: string) =>
                        !value || new TextEncoder().encode(value).length <= 72
                          ? Promise.resolve()
                          : Promise.reject(new Error('密码UTF-8长度不能超过72字节')),
                    },
                  ]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
                <Form.Item name="roles" label="身份与权限" rules={[{ required: true }]}>
                  <Select
                    mode="multiple"
                    options={roles
                      .filter(
                        (role) => role.enabled || form.getFieldValue('roles')?.includes(role.id),
                      )
                      .map((role) => ({ value: role.id, label: role.name }))}
                  />
                </Form.Item>
              </>
            )}
            {editing?.type === 'roles' && (
              <>
                <Form.Item name="name" label="角色名称" rules={[{ required: true, max: 40 }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="description" label="说明">
                  <Input.TextArea maxLength={200} />
                </Form.Item>
                <Form.Item name="menuIds" label="允许访问的页面与操作">
                  <Select
                    mode="multiple"
                    options={menus
                      .filter((menu) => menu.enabled)
                      .map((menu) => ({
                        value: menu.id,
                        label: `${menu.title} · ${menu.permission || '目录'}`,
                      }))}
                  />
                </Form.Item>
                <p>页面权限和执行权限分别配置；码穹只在主机本地可用。</p>
              </>
            )}
            {editing?.type === 'menus' && (
              <>
                <Form.Item name="title" label="菜单名称" rules={[{ required: true, max: 40 }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="kind" label="类型" rules={[{ required: true }]}>
                  <Select
                    options={[
                      { value: 'menu', label: '页面' },
                      { value: 'directory', label: '目录' },
                      { value: 'action', label: '操作权限' },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="parentId" label="父菜单">
                  <Select
                    allowClear
                    options={menus
                      .filter((menu) => menu.id !== editing.id)
                      .map((menu) => ({ value: menu.id, label: menu.title }))}
                  />
                </Form.Item>
                <Form.Item name="path" label="已登记页面">
                  <Select options={pages.map(([value, label]) => ({ value, label }))} />
                </Form.Item>
                <Form.Item name="permission" label="已登记权限">
                  <Select
                    options={permissions.map((value) => ({ value, label: value || '无权限代码' }))}
                  />
                </Form.Item>
                <Form.Item name="sortOrder" label="排序">
                  <Input
                    type="number"
                    onChange={(event) =>
                      form.setFieldValue('sortOrder', Number(event.target.value))
                    }
                  />
                </Form.Item>
              </>
            )}
            <Form.Item
              hidden={editing?.type === 'users'}
              name="enabled"
              label="启用"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Form>
        </Modal>
      </main>
    </ConfigProvider>
  )
}
