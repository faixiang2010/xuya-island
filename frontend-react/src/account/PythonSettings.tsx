import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Select } from 'antd'
import { familyApi } from './api'
interface Environment {
  executable: string
  version?: string
  available?: boolean
  prefix?: string
  basePrefix?: string
  source?: 'bundled' | 'custom'
  message?: string
}
interface EnvironmentState {
  configured: boolean
  executable: string
  source: 'bundled' | 'custom' | 'none'
  bundled: { available: boolean; executable: string; version: string }
  notice: string
}
export default function PythonSettings() {
  const [path, setPath] = useState(''),
    [choices, setChoices] = useState<Environment[]>([]),
    [environment, setEnvironment] = useState<EnvironmentState>(),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const pending = useRef(false),
    mounted = useRef(true)
  const reload = useCallback(async (discover = true) => {
    setError('')
    try {
      const current = await familyApi<EnvironmentState>('/execution/environment')
      if (mounted.current) {
        setEnvironment(current)
        setPath(
          current.source === 'bundled'
            ? 'bundled'
            : current.source === 'custom'
              ? current.executable
              : '',
        )
      }
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : '当前环境没有读到。')
    }
    if (!discover) return
    try {
      const values = await familyApi<Environment[]>('/system/python')
      if (mounted.current) setChoices(values)
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : '环境列表没有读到，可手动填写路径。')
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    void reload()
    return () => {
      mounted.current = false
    }
  }, [reload])
  async function save() {
    if (pending.current || !path) return
    pending.current = true
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await familyApi<Environment>('/system/python', 'PUT', { executable: path })
      if (mounted.current) {
        await reload(false)
        setStatus('已选择，之后的新运行使用这个环境。')
      }
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : '检查没有通过，仍保留原环境。')
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const bundled = environment?.bundled
  const currentLabel = !environment
    ? '正在读取…'
    : environment.source === 'bundled'
      ? `内置 Python ${bundled?.version || ''}`
      : environment.source === 'custom'
        ? '已选择主机Python'
        : '尚未配置'
  const options = [
    ...(bundled?.available
      ? [{ value: 'bundled', label: `内置 Python ${bundled.version} · 推荐` }]
      : []),
    ...choices
      .filter((value) => value.available && value.source !== 'bundled')
      .map((value) => ({
        value: value.executable,
        label: `Python ${value.version || ''} · ${value.executable}`,
      })),
  ]
  return (
    <section className="family-paper">
      <h2>Python运行环境</h2>
      <p>准备一次，家人就能在课堂里运行程序。</p>
      <span className="family-status">{currentLabel}</span>
      {environment?.source === 'custom' && (
        <p className="family-secondary family-address">{environment.executable}</p>
      )}
      {bundled && !bundled.available && (
        <p className="family-secondary">当前没有可用的内置Python，请选择主机上已安装的环境。</p>
      )}
      <div className="family-setting-width">
        <label htmlFor="python-environment">选择运行环境</label>
        <Select
          id="python-environment"
          aria-label="选择运行环境"
          style={{ width: '100%', marginTop: 8 }}
          value={options.some((option) => option.value === path) ? path : undefined}
          options={options}
          disabled={busy}
          onChange={(value) => {
            setPath(value)
            setStatus('')
            setError('')
          }}
          placeholder="选择已发现的Python"
        />
        <details>
          <summary>找不到环境？手动填写路径</summary>
          <label htmlFor="python-path">主机Python解释器完整路径</label>
          <Input
            id="python-path"
            aria-label="Python解释器完整路径"
            value={path === 'bundled' ? '' : path}
            disabled={busy}
            onChange={(event) => {
              setPath(event.target.value)
              setStatus('')
              setError('')
            }}
            placeholder="例如 C:\Python313\python.exe"
          />
          <p className="family-secondary">
            选择python.exe文件，不是安装文件夹；可填写已有虚拟环境的解释器。
          </p>
        </details>
      </div>
      <div className="family-actions">
        <Button
          type="primary"
          loading={busy}
          disabled={!path || !environment}
          onClick={() => void save()}
        >
          检查并使用
        </Button>
        <Button disabled={busy} onClick={() => void reload()}>
          重新发现环境
        </Button>
      </div>
      {error && (
        <p role="alert" className="family-error">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      <details>
        <summary>运行方式与环境说明</summary>
        <p>
          学习代码具有启动软件的Windows账户的文件与网络权限。独立目录不是安全沙箱；Windows进程组负责停止子进程和限制内存。
        </p>
        <p>
          内置Python包含标准库，不含pip和tkinter。需要额外库时选择管理员准备的环境；软件不会自动安装库或改变系统PATH。
        </p>
      </details>
    </section>
  )
}
