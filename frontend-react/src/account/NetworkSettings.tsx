import { useEffect, useRef, useState } from 'react'
import { Button, Switch } from 'antd'
import { familyApi } from './api'
interface Network {
  enabled: boolean
  active: boolean
  restartRequired: boolean
  localConfiguration: boolean
  addresses: string[]
}
export default function NetworkSettings() {
  const [state, setState] = useState<Network>(),
    [enabled, setEnabled] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const pending = useRef(false)
  async function load() {
    setError('')
    try {
      const value = await familyApi<Network>('/system/network')
      setState(value)
      setEnabled(value.enabled)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '共享设置没有读到。')
    }
  }
  useEffect(() => {
    void load()
  }, [])
  async function save() {
    if (!state || pending.current || enabled === state.enabled) return
    pending.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const value = await familyApi<Network>('/system/network', 'PUT', { enabled })
      setState(value)
      setEnabled(value.enabled)
      setNotice(
        value.restartRequired
          ? '已保存，需重启主机上的叙芽岛服务后生效。'
          : '已保存，共享状态已经生效。',
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '没有保存，请重试。')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  async function copy(address: string) {
    try {
      if (!navigator.clipboard) throw new Error()
      await navigator.clipboard.writeText(address)
      setNotice('地址已复制，可以发给同一家庭网络的家人。')
    } catch {
      setNotice('暂时不能自动复制，请选中下面的完整地址手动复制。')
    }
  }
  return (
    <section className="family-paper">
      <h2>局域网共享</h2>
      <p>让同一家庭网络中的其他设备一起学习，主机需保持运行。</p>
      <span className="family-status">
        {!state
          ? '正在读取…'
          : state.restartRequired
            ? '等待重启'
            : state.active
              ? '已开启共享'
              : '仅本机访问'}
      </span>
      <div className="family-actions">
        <Switch
          aria-label="启用局域网共享"
          checked={enabled}
          disabled={busy || !state?.localConfiguration}
          onChange={(value) => {
            setEnabled(value)
            setNotice('')
          }}
        />
        <span>启用局域网共享</span>
        <Button
          type="primary"
          loading={busy}
          disabled={!state?.localConfiguration || enabled === state.enabled}
          onClick={() => void save()}
        >
          保存共享设置
        </Button>
      </div>
      {state && !state.localConfiguration && (
        <p className="family-secondary">请在主机本地修改共享设置。</p>
      )}
      {state?.active &&
        state.addresses.map((address) => (
          <div key={address} className="family-actions">
            <a className="family-address" href={address} target="_blank" rel="noreferrer">
              {address}
            </a>
            <Button onClick={() => void copy(address)}>复制地址</Button>
          </div>
        ))}
      {state?.restartRequired && (
        <p>安装版请从托盘明确退出后重新打开；源码开发请停止并重新启动服务。</p>
      )}
      {error && (
        <p className="family-error" role="alert">
          {error}
          <Button disabled={busy} onClick={() => void load()}>
            重新读取共享设置
          </Button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <details>
        <summary>共享使用说明</summary>
        <p>
          家人使用各自账户登录，其他设备无需安装Python。家庭HTTP连接不加密，仅用于可信家庭网络；防火墙选择私有网络。软件不会自动开放公网或配置路由器。
        </p>
      </details>
    </section>
  )
}
