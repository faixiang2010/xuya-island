import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Button, Form, Input, InputNumber, Modal, Select, Switch, Tabs, message } from 'antd'
import { ProTable, type ProColumns } from '@ant-design/pro-components'
import { familyApi, type FamilyUser } from './api'
import {
  activityPath,
  specification,
  type Dashboard,
  type LearningSession,
  type Reward,
  type Redemption,
} from '../growth/types'

interface Project {
  id: string
  title: string
}
const names: Record<string, string> = {
  pending: '待确认',
  approved: '待兑现',
  fulfilled: '已兑现',
  cancelled: '已取消',
  rejected: '已拒绝',
  refunded: '已退款',
}
/** 活动记录按天分组，家长一眼就能看清哪一天练了几次。 */
function dayLabel(at: Date) {
  const now = new Date()
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86400000)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days === 2) return '前天'
  return `${at.getMonth() + 1} 月 ${at.getDate()} 日`
}
function dayGroups(sessions: LearningSession[]) {
  const groups = new Map<string, { key: string; label: string; items: LearningSession[] }>()
  sessions.forEach((item) => {
    const at = new Date(item.started_at)
    const key = `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`
    const group = groups.get(key) ?? { key, label: dayLabel(at), items: [] }
    group.items.push(item)
    groups.set(key, group)
  })
  return [...groups.values()]
}
function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false })
}
export default function FamilyGrowthAdmin({
  users,
  onAddLearner,
}: {
  users: FamilyUser[]
  onAddLearner: () => void
}) {
  const [gifts, setGifts] = useState<Reward[]>([])
  const [learner, setLearner] = useState('')
  const [requests, setRequests] = useState<Redemption[]>([])
  const [report, setReport] = useState<Dashboard>()
  const [editing, setEditing] = useState<Reward | null>()
  const [busy, setBusy] = useState(false)
  const [project, setProject] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [giftLoading, setGiftLoading] = useState(false)
  const loadVersion = useRef(0),
    giftVersion = useRef(0),
    alive = useRef(true),
    pending = useRef(false)
  const [form] = Form.useForm()
  const [feedback, holder] = message.useMessage()
  async function loadGifts() {
    const ticket = ++giftVersion.current
    setGiftLoading(true)
    try {
      const value = await familyApi<Reward[]>('/admin/rewards')
      if (alive.current && ticket === giftVersion.current) {
        setGifts(value)
        setErrors((previous) => ({ ...previous, gifts: '' }))
      }
    } catch (error) {
      if (alive.current && ticket === giftVersion.current)
        setErrors((previous) => ({
          ...previous,
          gifts: error instanceof Error ? error.message : '礼物未能读取',
        }))
    } finally {
      if (alive.current && ticket === giftVersion.current) setGiftLoading(false)
    }
  }
  async function load() {
    if (!learner) return
    const ticket = ++loadVersion.current
    setLoading(true)
    setErrors((previous) => ({ gifts: previous.gifts || '' }))
    const tasks = [
      ['requests', '/redemptions', (value: Redemption[]) => setRequests(value)],
      ['report', '/dashboard', (value: Dashboard) => setReport(value)],
      ['projects', '/projects', (value: Project[]) => setProjects(value)],
    ] as const
    await Promise.all(
      tasks.map(async ([key, suffix, apply]) => {
        try {
          const value = await familyApi('/admin/learners/' + encodeURIComponent(learner) + suffix)
          if (alive.current && ticket === loadVersion.current)
            (apply as (value: unknown) => void)(value)
        } catch (error) {
          if (alive.current && ticket === loadVersion.current)
            setErrors((previous) => ({
              ...previous,
              [key]: error instanceof Error ? error.message : '未能读取',
            }))
        }
      }),
    )
    if (alive.current && ticket === loadVersion.current) setLoading(false)
  }
  useEffect(() => {
    alive.current = true
    void loadGifts()
    return () => {
      alive.current = false
      loadVersion.current++
      giftVersion.current++
    }
  }, [])
  useEffect(() => {
    if (
      !users.some((user) => user.enabled && user.roles.includes('learner') && user.id === learner)
    ) {
      setLearner(users.find((user) => user.enabled && user.roles.includes('learner'))?.id || '')
    }
  }, [users, learner])
  useEffect(() => {
    setReport(undefined)
    setRequests([])
    setProjects([])
    setProject('')
    void load()
    return () => {
      loadVersion.current++
    }
  }, [learner])
  function edit(value: Reward | null) {
    setEditing(value)
    form.setFieldsValue(
      value || { title: '', description: '', cost: 5, stock: 1, enabled: true, revision: 0 },
    )
  }
  async function save() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      const value = await form.validateFields()
      await familyApi(
        `/admin/rewards${editing?.id ? '/' + editing.id : ''}`,
        editing?.id ? 'PUT' : 'POST',
        value,
      )
      setEditing(undefined)
      if (alive.current) {
        await load()
        await loadGifts()
      }
      void feedback.success('礼物已保存')
    } catch (error) {
      if (error instanceof Error) void feedback.error(error.message)
    } finally {
      pending.current = false
      if (alive.current) setBusy(false)
    }
  }
  async function action(item: Redemption, action: string) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      await familyApi(`/admin/redemptions/${item.id}/action`, 'POST', {
        action,
        revision: item.revision,
      })
      await load()
      await loadGifts()
      void feedback.success('已处理，账本和库存已同步')
    } catch (error) {
      void feedback.error(error instanceof Error ? error.message : '没有完成，请重试')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  const giftColumns: ProColumns<Reward>[] = [
    { title: '家庭礼物', dataIndex: 'title' },
    { title: '约定与兑现方式', dataIndex: 'description' },
    { title: '积分成本', dataIndex: 'cost' },
    { title: '当前可用数量', dataIndex: 'stock' },
    { title: '开放', render: (_, item) => (item.enabled ? '可以申请' : '暂时收起') },
    {
      title: '管理',
      valueType: 'option',
      render: (_, item) => (
        <Button type="link" onClick={() => edit(item)}>
          编辑礼物
        </Button>
      ),
    },
  ]
  function requestActions(item: Redemption) {
    return item.status === 'pending' ? (
      <div className="family-actions">
        <Button disabled={busy} onClick={() => void action(item, 'approve')}>
          批准
        </Button>
        <Button disabled={busy} onClick={() => void action(item, 'reject')}>
          暂时拒绝
        </Button>
      </div>
    ) : item.status === 'approved' ? (
      <div className="family-actions">
        <Button disabled={busy} onClick={() => void action(item, 'fulfill')}>
          标记已经兑现
        </Button>
        <Button disabled={busy} onClick={() => void action(item, 'refund')}>
          取消并退回积分
        </Button>
      </div>
    ) : (
      '已归档'
    )
  }
  function filteredRequests(key: string) {
    return requests.filter((item) =>
      key === 'done' ? !['pending', 'approved'].includes(item.status) : item.status === key,
    )
  }
  const requestColumns: ProColumns<Redemption>[] = [
    { title: '申请礼物', dataIndex: 'title' },
    { title: '申请时成本', dataIndex: 'cost' },
    { title: '状态', render: (_, item) => names[item.status] || item.status },
    { title: '申请时间', dataIndex: 'created_at', valueType: 'dateTime' },
    {
      title: '处理',
      valueType: 'option',
      render: (_, item) => requestActions(item),
    },
  ]
  return (
    <section>
      {holder}
      <section className="family-paper">
        <h2>陪伴一位家人</h2>
        <p>看看最近的探索，处理约定好的礼物。</p>
        <Select
          aria-label="选择学习账户"
          className="family-setting-width"
          value={learner || undefined}
          placeholder="选择要陪伴的家庭成员"
          disabled={busy}
          options={users
            .filter((user) => user.enabled && user.roles.includes('learner'))
            .map((user) => ({ value: user.id, label: user.nickname }))}
          onChange={(value) => {
            loadVersion.current++
            setReport(undefined)
            setRequests([])
            setProjects([])
            setProject('')
            setLearner(value)
          }}
        />
        {!learner && (
          <div className="family-empty">
            <p>还没有可用的学习账户。</p>
            <Button onClick={onAddLearner}>添加学习者</Button>
          </div>
        )}
        {loading && <p role="status">正在读取这位家人的记录…</p>}
        {errors.report && (
          <p className="family-error" role="alert">
            {errors.report}
            <Button onClick={() => void load()}>重新读取学习概况</Button>
          </p>
        )}
        {report && report.learner.id === learner && (
          <div>
            <h2>{report.learner.nickname} · 最近探索</h2>
            <details className="family-sessions">
              <summary>
                查看活动记录
                <span>{report.sessions.length} 次记录</span>
              </summary>
              <div className="family-sessions-body">
                {dayGroups(report.sessions).map((group) => (
                  <section key={group.key}>
                    <h4>{group.label}</h4>
                    <ol>
                      {group.items.map((item) => {
                        const path = activityPath(item)
                        const done = item.status === 'completed'
                        const row = (
                          <>
                            <time dateTime={item.started_at}>{timeLabel(item.started_at)}</time>
                            <span className="family-session-title">
                              {specification(item).title || '一次探索'}
                            </span>
                            <span
                              className={
                                done ? 'family-session-state done' : 'family-session-state'
                              }
                            >
                              {done ? '完成' : '可继续'}
                            </span>
                          </>
                        )
                        return (
                          <li key={item.id}>
                            {path ? (
                              <Link
                                to={path}
                                aria-label={'回到这次活动：' + specification(item).title}
                              >
                                {row}
                              </Link>
                            ) : (
                              <span className="family-session-row">{row}</span>
                            )}
                          </li>
                        )
                      })}
                    </ol>
                  </section>
                ))}
              </div>
            </details>
          </div>
        )}
      </section>
      {learner && (
        <section className="family-paper">
          <h2>礼物申请</h2>
          {errors.requests ? (
            <p className="family-error" role="alert">
              {errors.requests}
              <Button onClick={() => void load()}>重新读取申请</Button>
            </p>
          ) : (
            <Tabs
              items={[
                ['pending', '待确认'],
                ['approved', '待兑现'],
                ['done', '已处理'],
              ].map(([key, label]) => ({
                key,
                label,
                children: (
                  <>
                    <div className="family-desktop-table">
                      <ProTable
                        rowKey="id"
                        search={false}
                        options={false}
                        loading={loading}
                        columns={requestColumns}
                        dataSource={filteredRequests(key)}
                        pagination={{ pageSize: 5 }}
                        scroll={{ x: 520 }}
                      />
                    </div>
                    <div className="family-mobile-list">
                      {loading ? (
                        <p role="status">正在读取申请…</p>
                      ) : filteredRequests(key).length ? (
                        filteredRequests(key).map((item) => (
                          <article key={item.id}>
                            <h3>{item.title}</h3>
                            <p>
                              {item.cost} 积分 · {names[item.status]}
                            </p>
                            <p className="family-secondary">
                              {new Date(item.created_at).toLocaleString('zh-CN')}
                            </p>
                            {requestActions(item)}
                          </article>
                        ))
                      ) : (
                        <p className="family-secondary">暂时没有这类申请。</p>
                      )}
                    </div>
                  </>
                ),
              }))}
            />
          )}
          <details>
            <summary>确认孩子的原创成果</summary>
            <p>一起试玩实际运行成功的作品后再确认；每个作品只奖励一次，每周最多一次。</p>
            {errors.projects ? (
              <p role="alert">
                {errors.projects}
                <Button onClick={() => void load()}>重新读取作品</Button>
              </p>
            ) : (
              <>
                <Select
                  aria-label="选择已运行成功的作品"
                  value={project || undefined}
                  onChange={setProject}
                  disabled={busy}
                  options={projects.map((item) => ({ value: item.id, label: item.title }))}
                  placeholder="选择当前版本运行成功的作品"
                  className="family-setting-width"
                />
                <Button
                  disabled={!project || busy}
                  loading={busy}
                  onClick={() =>
                    void (async () => {
                      if (pending.current) return
                      pending.current = true
                      setBusy(true)
                      try {
                        await familyApi(
                          '/admin/learners/' + encodeURIComponent(learner) + '/milestones',
                          'POST',
                          { projectId: project },
                        )
                        await load()
                        void feedback.success('成果确认已记入账本')
                      } catch (error) {
                        void feedback.error(error instanceof Error ? error.message : '确认没有完成')
                      } finally {
                        pending.current = false
                        if (alive.current) setBusy(false)
                      }
                    })()
                  }
                >
                  确认可试玩的原创成果
                </Button>
              </>
            )}
          </details>
        </section>
      )}
      <section className="family-paper">
        <h2>家庭礼物</h2>
        {errors.gifts && (
          <p className="family-error" role="alert">
            {errors.gifts}
            <Button onClick={() => void loadGifts()}>重新读取礼物</Button>
          </p>
        )}
        <div className="family-mobile-list">
          <Button type="primary" onClick={() => edit(null)}>
            添加礼物
          </Button>
          {giftLoading ? (
            <p role="status">正在读取礼物…</p>
          ) : gifts.length ? (
            gifts.map((gift) => (
              <article key={gift.id}>
                <h3>{gift.title}</h3>
                <p>{gift.description}</p>
                <p>
                  {gift.cost} 积分 · 可用 {gift.stock} 份 · {gift.enabled ? '可以申请' : '暂时收起'}
                </p>
                <Button onClick={() => edit(gift)}>编辑礼物</Button>
              </article>
            ))
          ) : (
            <p>还没有准备礼物。</p>
          )}
        </div>
        <div className="family-desktop-table">
          <ProTable
            rowKey="id"
            search={false}
            options={{ reload: () => void loadGifts() }}
            loading={giftLoading}
            scroll={{ x: 640 }}
            headerTitle="和孩子一起约定的礼物"
            columns={giftColumns}
            dataSource={gifts}
            toolBarRender={() => [
              <Button key="add" type="primary" onClick={() => edit(null)}>
                添加礼物
              </Button>,
            ]}
          />
        </div>
      </section>
      <Modal
        title="准备家庭礼物"
        open={editing !== undefined}
        onCancel={() => {
          if (!busy) setEditing(undefined)
        }}
        maskClosable={!busy}
        onOk={() => void save()}
        confirmLoading={busy}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" disabled={busy}>
          <Form.Item name="title" label="礼物或一起做的事" rules={[{ required: true, max: 80 }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="description"
            label="具体约定与兑现方式"
            rules={[{ required: true, max: 1000 }]}
          >
            <Input.TextArea />
          </Form.Item>
          <Form.Item name="cost" label="积分成本" rules={[{ required: true }]}>
            <InputNumber min={1} max={100000} />
          </Form.Item>
          <Form.Item name="stock" label="当前可以申请的数量" rules={[{ required: true }]}>
            <InputNumber min={0} max={10000} />
          </Form.Item>
          <Form.Item name="enabled" label="向学习账户开放" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="revision" hidden>
            <InputNumber />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  )
}
