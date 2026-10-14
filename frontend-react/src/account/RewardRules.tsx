import { useEffect, useState, useRef } from 'react'
import { Button, InputNumber } from 'antd'
import { familyApi } from './api'

export default function RewardRules() {
  const [saved, setSaved] = useState<number>()
  const [value, setValue] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const pending = useRef(false)
  async function load() {
    setError('')
    try {
      const result = await familyApi<{ dailyCap: number }>('/admin/reward-rules')
      setSaved(result.dailyCap)
      setValue(result.dailyCap)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '奖励规则未能读取')
    }
  }
  useEffect(() => {
    void load()
  }, [])
  async function save() {
    if (pending.current || value == null || saved === undefined) return
    pending.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await familyApi<{ dailyCap: number }>('/admin/reward-rules', 'PUT', {
        dailyCap: value,
      })
      setSaved(result.dailyCap)
      setValue(result.dailyCap)
      setNotice('已保存，只影响之后的奖励。')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '没有保存，请重试')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <section>
      <h2>每日正向奖励上限</h2>
      <p>普通错误不扣分，修改不改变已经保存的积分。</p>
      {error && (
        <div role="alert" className="family-error">
          {error}
          <Button onClick={() => void load()} disabled={busy}>
            重新读取
          </Button>
        </div>
      )}
      {saved === undefined ? (
        <p>正在读取已保存的规则…</p>
      ) : (
        <div className="family-actions">
          <InputNumber
            aria-label="每日积分上限"
            min={1}
            max={100}
            value={value}
            disabled={busy}
            onChange={setValue}
          />
          <Button
            loading={busy}
            disabled={value == null || value === saved}
            onClick={() => void save()}
            type="primary"
          >
            保存奖励上限
          </Button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  )
}
