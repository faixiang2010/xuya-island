import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Skeleton } from 'antd'
import { familyApi } from '../account/api'
import { accountStorage } from '../account/session'
import { newId } from '../shared/id'
import { synchronizeLearning } from '../growth/outbox'
import FamilyPanel from '../components/FamilyPanel'
import LegacyLearningImport from '../account/LegacyLearningImport'
import BadgeGallery from '../motivation/BadgeGallery'
import { useBadges } from '../motivation/useBadges'
import { exportLearningReport } from '../growth/export'
import { knowledgeTitle } from '../growth/labels'
import {
  activityPath,
  activityStatuses as statuses,
  specification,
  type Dashboard,
  type LearningSession,
  type Reward,
  type Redemption,
} from '../growth/types'
import './GrowthView.css'

export default function GrowthView() {
  const badges = useBadges()
  const [data, setData] = useState<Dashboard>()
  const [gifts, setGifts] = useState<Reward[]>([])
  const [tab, setTab] = useState('recent')
  const [loading, setLoading] = useState(true)
  const [giftLoading, setGiftLoading] = useState(false)
  const [error, setError] = useState('')
  const [giftError, setGiftError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState(false)
  const [selected, setSelected] = useState<LearningSession>()
  const [detail, setDetail] = useState<LearningSession>()
  const [detailError, setDetailError] = useState('')
  const [wishes, setWishes] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(accountStorage.getItem('xuya:gift-wishes') ?? '[]')
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : []
    } catch {
      return []
    }
  })
  const alive = useRef(true),
    version = useRef(0),
    detailVersion = useRef(0),
    giftVersion = useRef(0),
    pending = useRef(false)
  async function load() {
    const ticket = ++version.current
    setLoading(true)
    setError('')
    try {
      const result = await familyApi<Dashboard>('/learning/dashboard')
      if (alive.current && ticket === version.current) setData(result)
    } catch (failure) {
      if (alive.current && ticket === version.current)
        setError(failure instanceof Error ? failure.message : '成长手册没有连接好。')
    } finally {
      if (alive.current && ticket === version.current) setLoading(false)
    }
  }
  async function loadGifts() {
    const ticket = ++giftVersion.current
    setGiftLoading(true)
    setGiftError('')
    try {
      const result = await familyApi<Reward[]>('/rewards/catalog')
      if (alive.current && ticket === giftVersion.current) setGifts(result)
    } catch (failure) {
      if (alive.current && ticket === giftVersion.current)
        setGiftError(failure instanceof Error ? failure.message : '礼物没有连接好。')
    } finally {
      if (alive.current && ticket === giftVersion.current) setGiftLoading(false)
    }
  }
  useEffect(() => {
    alive.current = true
    void load()
    return () => {
      alive.current = false
      version.current++
      detailVersion.current++
      giftVersion.current++
    }
  }, [])
  useEffect(() => {
    if (tab === 'gifts') void loadGifts()
  }, [tab])
  async function mutate(operation: () => Promise<unknown>, notice: string) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setMessage('')
    try {
      await operation()
      if (alive.current) {
        setMessage(notice)
        await load()
        if (tab === 'gifts') await loadGifts()
      }
    } catch (failure) {
      if (alive.current)
        setMessage(failure instanceof Error ? failure.message : '这次没有完成，请重试。')
    } finally {
      pending.current = false
      if (alive.current) setBusy(false)
    }
  }
  async function redeem(gift: Reward) {
    await mutate(async () => {
      const key = `xuya:redemption:${gift.id}`
      const clientId = accountStorage.getItem(key) || newId()
      accountStorage.setItem(key, clientId)
      await familyApi('/rewards/redemptions', 'POST', { clientId, rewardId: gift.id })
      accountStorage.removeItem(key)
    }, '申请已送到家人那里，积分先留给这份礼物，等待家人确认。')
  }
  function wish(id: string) {
    const next = wishes.includes(id) ? wishes.filter((value) => value !== id) : [...wishes, id]
    try {
      accountStorage.setItem('xuya:gift-wishes', JSON.stringify(next))
      setWishes(next)
      setMessage(next.includes(id) ? '已放进心愿。' : '已从心愿移出。')
    } catch {
      setMessage('这台浏览器暂时不能保存心愿，请稍后再试。')
    }
  }
  async function inspect(session: LearningSession) {
    const ticket = ++detailVersion.current
    setSelected(session)
    setDetail(undefined)
    setDetailError('')
    try {
      const result = await familyApi<LearningSession>(
        `/learning/sessions/${encodeURIComponent(session.id)}`,
      )
      if (alive.current && ticket === detailVersion.current) setDetail(result)
    } catch (failure) {
      if (alive.current && ticket === detailVersion.current)
        setDetailError(failure instanceof Error ? failure.message : '这条足迹没有打开。')
    }
  }
  function closeDetail() {
    detailVersion.current++
    setSelected(undefined)
    setDetail(undefined)
    setDetailError('')
  }
  function row(session: LearningSession) {
    const completion = specification(session).completion
    return (
      <button key={session.id} className="growth-history" onClick={() => void inspect(session)}>
        <span>
          <b>{specification(session).title || '一次学习探索'}</b>
          <small>
            {new Date(session.started_at).toLocaleString('zh-CN')}
            {completion ? ` · 本次获得 ${completion.awarded} 积分` : ''}
          </small>
        </span>
        <span className="family-status">{statuses[session.status] || '已记录'}</span>
      </button>
    )
  }
  function cancellation(item: Redemption) {
    return (
      <Button
        disabled={busy}
        loading={busy}
        onClick={() =>
          void mutate(
            () =>
              familyApi(`/rewards/redemptions/${encodeURIComponent(item.id)}/cancel`, 'POST', {
                revision: item.revision,
              }),
            '已取消申请，留给礼物的积分已退回可用余额。',
          )
        }
      >
        暂时取消
      </Button>
    )
  }
  const resumable = data?.sessions.find(
    (session) => ['active', 'paused'].includes(session.status) && activityPath(session),
  )
  const available = data ? data.balance.balance - data.balance.frozen : 0
  const completion = detail ? specification(detail).completion : undefined
  return (
    <main className="family-page growth-page">
      <header className="family-heading">
        <div>
          <h1>我的成长手册</h1>
          <p>
            {data
              ? `${data.learner.nickname}，每一次尝试都值得留下来。`
              : '找回你的探索，一会儿就好。'}
          </p>
        </div>
      </header>
      <nav className="growth-tabs" aria-label="成长手册">
        <button aria-pressed={tab === 'recent'} onClick={() => setTab('recent')}>
          最近探索
        </button>
        <button aria-pressed={tab === 'gifts'} onClick={() => setTab('gifts')}>
          心愿礼物
        </button>
      </nav>
      {message && (
        <p role="status" className="growth-notice">
          {message}
        </p>
      )}
      {error && (
        <div role="alert" className="family-error">
          {error}
          <Button onClick={() => void load()} disabled={loading}>
            重新连接成长手册
          </Button>
        </div>
      )}
      {loading && !data && (
        <section className="family-paper" aria-label="正在读取成长手册">
          <Skeleton active />
        </section>
      )}
      {data && !error && tab === 'recent' && (
        <>
          <section className="family-paper">
            <BadgeGallery badges={badges} />
          </section>
          {data.sessions.length || data.savedRuns.length ? (
            <section className="family-paper">
              <div className="family-heading">
                <div>
                  <h2>最近学了什么</h2>
                  <p>
                    {data.report.learningCount
                      ? `本周留下了 ${data.report.learningCount} 次探索${data.report.completed ? `，其中 ${data.report.completed} 次已经完成` : '，可以按自己的节奏继续'}。`
                      : '之前的尝试仍然在这里，今天也可以慢慢来。'}
                  </p>
                </div>
                <Link className="button primary" to={resumable ? activityPath(resumable)! : '/'}>
                  {resumable ? '继续探索 →' : '去学习地图 →'}
                </Link>
              </div>
              {data.sessions.slice(0, 5).map(row)}
              {!data.sessions.length && (
                <p>已经保存了 {data.savedRuns.length} 次代码运行，可在足迹中查看。</p>
              )}
              <Button onClick={() => setHistory(true)}>查看更多足迹</Button>
            </section>
          ) : (
            <section className="family-paper family-empty">
              <h2>你的第一段探索，从这里开始</h2>
              <p>玩一小组游戏，或者试试第一段程序。回来时，就能看到自己的足迹。</p>
              <Link className="button primary" to="/">
                去学习地图 →
              </Link>
            </section>
          )}
          {!!(data.sessions.length || data.savedRuns.length) && (
            <section className="family-paper growth-more">
              <details>
                <summary>本周手册</summary>
                <p>{data.report.conclusion}</p>
                <p>{data.report.timingNotice}</p>
                <p>
                  {data.report.helpSources.length
                    ? `本周得到的帮助：${data.report.helpSources.join('、')}`
                    : '本周记录中没有标记提示或外部帮助。'}
                </p>
                <Button onClick={() => exportLearningReport(data.report)}>
                  保存带依据的本周手册
                </Button>
              </details>
              <details>
                <summary>看看练习中的发现</summary>
                {data.skills.length ? (
                  data.skills.map((skill) => (
                    <div key={skill.knowledgeId}>
                      <h3>
                        {knowledgeTitle(skill.knowledgeId)} · {skill.state}
                      </h3>
                      <p>
                        近28天留下了{skill.evidenceCount}条活动记录。{skill.notice}
                      </p>
                    </div>
                  ))
                ) : (
                  <p>再积累一些真实尝试后，我们一起看看变化。不凭一次运行判断掌握。</p>
                )}
                {data.reviews
                  .filter((review) => Date.parse(review.next_at) <= Date.now())
                  .slice(0, 1)
                  .map((review) => (
                    <p key={review.knowledge_id}>
                      可以回顾：{knowledgeTitle(review.knowledge_id)}。
                      {activityPath(review) && (
                        <Link
                          to={`${activityPath(review)}${activityPath(review)!.includes('?') ? '&' : '?'}review=1`}
                        >
                          打开练习
                        </Link>
                      )}
                    </p>
                  ))}
              </details>
            </section>
          )}
        </>
      )}
      {data && !error && tab === 'gifts' && (
        <>
          <section className="family-paper">
            <div className="growth-gift-heading">
              <div>
                <h2>和家人约定的小期待</h2>
                <p>可以先放进心愿，准备好后再向家人申请。</p>
              </div>
              <div className="growth-balance">
                <strong>{available}</strong>
                <span>可用成长积分</span>
                <small>等待家人确认：{data.balance.frozen}</small>
              </div>
            </div>
          </section>
          {giftError ? (
            <div role="alert" className="family-error">
              {giftError}
              <Button onClick={() => void loadGifts()}>重新读取礼物</Button>
            </div>
          ) : giftLoading ? (
            <section className="family-paper">
              <Skeleton active />
            </section>
          ) : gifts.length ? (
            <div className="growth-grid">
              {gifts.map((gift) => (
                <section className="family-paper" key={gift.id}>
                  <h3>{gift.title}</h3>
                  <p>{gift.description}</p>
                  <strong>{gift.cost} 积分</strong>
                  <p className="family-secondary">
                    {gift.stock < 1
                      ? '家人暂时没有准备更多份，可以先放进心愿。'
                      : available < gift.cost
                        ? `还差 ${gift.cost - available} 积分，可以先慢慢探索。`
                        : `还有 ${gift.stock} 份可以申请。`}
                  </p>
                  <div className="family-actions">
                    <Button onClick={() => wish(gift.id)}>
                      {wishes.includes(gift.id) ? '已在我的心愿里' : '放进心愿'}
                    </Button>
                    <Button
                      type="primary"
                      disabled={busy || gift.stock < 1 || available < gift.cost}
                      loading={busy}
                      onClick={() => void redeem(gift)}
                    >
                      向家人申请
                    </Button>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <section className="family-paper">
              <h3>一起商量一份小礼物吧</h3>
              <p>家人还没有准备礼物，可以先聊聊你想一起做的事。</p>
              <GiftManagementLink />
            </section>
          )}
          <section className="family-paper">
            <h2>我的申请</h2>
            {!data.redemptions.length && <p>还没有申请，心愿可以慢慢想。</p>}
            {data.redemptions.map((item) => (
              <div key={item.id} className="growth-history">
                <span>
                  {item.title}
                  <small>
                    {item.cost} 积分 · {statuses[item.status] || '已记录'}
                  </small>
                </span>
                {item.status === 'pending' && cancellation(item)}
              </div>
            ))}
            <details>
              <summary>积分从哪里来</summary>
              <p>普通错误不扣分。申请礼物时先留出积分，取消或退回时恢复可用余额。</p>
              {data.ledger.map((item) => (
                <p key={item.id}>
                  {item.reason} · {item.delta > 0 ? '+' : ''}
                  {item.delta}积分
                  {item.frozen_delta
                    ? `，留出变化 ${item.frozen_delta > 0 ? '+' : ''}${item.frozen_delta}`
                    : ''}
                </p>
              ))}
            </details>
          </section>
        </>
      )}
      <FamilyPanel open={history} title="学习足迹" onClose={() => setHistory(false)}>
        {data?.sessions.map(row)}
        {!data?.sessions.length && <p>还没有活动明细，保存过的运行会继续保留。</p>}
        <details>
          <summary>最近保存的代码运行</summary>
          {data?.savedRuns.map((run) => (
            <p key={run.id}>
              一次代码运行 · {run.status === 'success' ? '运行成功' : '留下了一次尝试'} ·{' '}
              {new Date(run.gmt_create).toLocaleString('zh-CN')} ·{' '}
              {run.source === 'host-python' ? '主机实际运行' : '历史浏览器报告'}
            </p>
          ))}
        </details>
        <details>
          <summary>记录管理</summary>
          <LegacyLearningImport />
          <Button
            disabled={busy}
            loading={busy}
            onClick={() =>
              void mutate(synchronizeLearning, '已尝试同步当前账户的学习记录；离线记录会继续保留。')
            }
          >
            同步待发送的记录
          </Button>
        </details>
      </FamilyPanel>
      <FamilyPanel open={!!selected} title="学习活动明细" onClose={closeDetail}>
        <h2>{selected && (specification(selected).title || '一次学习探索')}</h2>
        {detailError ? (
          <div role="alert" className="family-error">
            {detailError}
            <Button onClick={() => selected && void inspect(selected)}>重新打开</Button>
          </div>
        ) : detail ? (
          <>
            <p>
              {statuses[detail.status] || '已记录'} · 内容版本 {detail.content_version}
            </p>
            {completion ? (
              <>
                <p>
                  首次完整正确 {completion.summary.firstCorrect} / {completion.summary.total} ·
                  本次准确分 {completion.summary.accuracy}
                </p>
                <p>实际到账 {completion.awarded} 积分</p>
                <ul>
                  {completion.awards.map((award, index) => (
                    <li key={index}>
                      {award.reason}：{award.points}积分 · {award.notice}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>已记录这次尝试，还没有完成结算。</p>
            )}
          </>
        ) : (
          <Skeleton active />
        )}
      </FamilyPanel>
    </main>
  )
}
function GiftManagementLink() {
  const [manager, setManager] = useState(false)
  useEffect(() => {
    let active = true
    void familyApi<{ user: { roles: string[] } | null }>('/auth/state')
      .then((state) => {
        if (active) setManager(!!state.user?.roles.includes('super-admin'))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  return manager ? (
    <Link className="button secondary" to="/admin?section=growth">
      去准备家庭礼物
    </Link>
  ) : null
}
