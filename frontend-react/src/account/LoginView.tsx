import { useEffect, useState, type FormEvent } from 'react'
import { familyApi, type FamilyState } from './api'
import './login.css'

export default function LoginView({
  state,
  onSignedIn,
}: {
  state: FamilyState
  onSignedIn: (state: FamilyState) => void
}) {
  const setup = !state.initialized && state.localSetup
  const change = !!state.user?.changePassword
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [challenge, setChallenge] = useState<{ id: string; image: string }>()
  const [showCaptcha, setShowCaptcha] = useState(state.captchaMode === 'always')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [shy, setShy] = useState(false)
  const [quiet, setQuiet] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )
  async function refreshCaptcha() {
    try {
      setChallenge(await familyApi('/auth/captcha', 'POST', {}))
      setCaptcha('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '验证码暂时没有准备好')
    }
  }
  useEffect(() => {
    if (!setup && !change && showCaptcha) void refreshCaptcha()
  }, [setup, change, showCaptcha])
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (change) {
        await familyApi('/auth/password', 'POST', { oldPassword: password, newPassword })
        window.location.reload()
        return
      }
      const next = await familyApi<FamilyState>(
        setup ? '/auth/setup' : '/auth/login',
        'POST',
        setup
          ? { username, nickname, password }
          : { username, password, captchaId: challenge?.id, captcha },
      )
      setPassword('')
      onSignedIn(next)
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : '小岛暂时没连接好，请重试。'
      setError(message)
      if (message.includes('验证码')) {
        setShowCaptcha(true)
        await refreshCaptcha()
      } else if (showCaptcha) await refreshCaptcha()
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="passport-page" data-quiet={quiet}>
      <header className="passport-brand">
        <span>芽</span>
        <div>
          叙芽岛<small>XUYA ISLAND · 探险手册</small>
        </div>
        <button type="button" onClick={() => setQuiet(!quiet)} aria-pressed={quiet}>
          {quiet ? '轻轻陪伴' : '小奇动一动'}
        </button>
      </header>
      <section className="passport-spread">
        <div className="passport-story">
          <span className="passport-stamp">小岛探险队</span>
          <p className="passport-eyebrow">每一个“如果”，都值得试一试。</p>
          <h1>
            带上好奇心，
            <br />
            我们一起出发！
          </h1>
          <p>
            一行代码，一点魔法。
            <br />
            今天的小岛，会因为你变得不一样。
          </p>
          <div
            className={'xiaoqi-sticker' + (shy ? ' shy' : '')}
            role="img"
            aria-label={shy ? '小奇捂住眼睛，保护你的密码' : '小奇挥手欢迎你'}
          />
          <div className="xiaoqi-speech" aria-live="polite">
            {shy ? '嘘——密码是你的小秘密。' : '嗨！我是小奇，想和你一起探险。'}
          </div>
          <span className="passport-footnote">允许犯错 · 欢迎怪点子 · 慢慢来就好</span>
        </div>
        <div className="passport-card">
          <span className="passport-ticket">ISLAND PASSPORT / 小岛通行证</span>
          <h2>{setup ? '先请大人准备小岛' : change ? '给通行证换个新密码' : '欢迎回到你的小岛'}</h2>
          <p>
            {setup
              ? '首次使用：在这台主机上设置家庭超级管理员。'
              : change
                ? '初始密码由管理员提供，请换成你自己的秘密。'
                : '输入自己的账号，让小奇认出你。'}
          </p>
          {!state.initialized && !state.localSetup ? (
            <p role="status">请先在安装叙芽岛的电脑上，由大人设置管理员。</p>
          ) : (
            <form onSubmit={(event) => void submit(event)}>
              {!change && (
                <label>
                  账号
                  <input
                    required
                    autoComplete="username"
                    maxLength={40}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="你的探险账号"
                  />
                </label>
              )}
              {setup && (
                <label>
                  管理员昵称
                  <input
                    required
                    maxLength={40}
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    placeholder="家人们怎么称呼你"
                  />
                </label>
              )}
              <label>
                {change ? '初始密码' : '密码'}
                <input
                  required
                  type="password"
                  minLength={setup ? 8 : undefined}
                  maxLength={64}
                  autoComplete={setup ? 'new-password' : 'current-password'}
                  value={password}
                  onFocus={() => setShy(true)}
                  onBlur={() => setShy(false)}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={setup ? '至少8个字符' : '你的秘密口令'}
                />
              </label>
              {change && (
                <label>
                  新密码
                  <input
                    required
                    type="password"
                    minLength={8}
                    maxLength={64}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    onFocus={() => setShy(true)}
                    onBlur={() => setShy(false)}
                    placeholder="至少8个字符"
                  />
                </label>
              )}
              {!setup && !change && showCaptcha && (
                <div className="passport-captcha">
                  <label>
                    验证码
                    <input
                      required
                      value={captcha}
                      onChange={(event) => setCaptcha(event.target.value)}
                      maxLength={5}
                      autoComplete="off"
                      placeholder="右边图片里的字符"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void refreshCaptcha()}
                    aria-label="换一张验证码"
                  >
                    {challenge ? <img src={challenge.image} alt="验证码，点击换一张" /> : '准备中…'}
                    <small>看不清？换一张</small>
                  </button>
                </div>
              )}
              {error && (
                <p className="passport-error" role="alert">
                  {error}
                </p>
              )}
              <button className="passport-submit" disabled={busy} type="submit">
                {busy
                  ? '小奇正在打开小岛…'
                  : setup
                    ? '准备好我的小岛'
                    : change
                      ? '保存新密码并重新登录'
                      : '出发，去探险'}
                <span aria-hidden="true">→</span>
              </button>
            </form>
          )}
          <p className="passport-help">账号和忘记的密码，请找家庭管理员帮忙。</p>
          <div className="passport-seal">
            好奇心
            <br />
            已就位
          </div>
        </div>
      </section>
      <footer className="passport-footer">
        这是属于你和家人的学习小岛。每个人都有自己的作品与足迹。
      </footer>
    </main>
  )
}
