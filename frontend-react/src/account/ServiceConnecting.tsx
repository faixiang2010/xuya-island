import { useState } from 'react'

interface Props {
  lastError?: string
  attempts: number
  nextRetryIn: number
  onRetry: () => void
}

/** 后端未启动时的连接等待界面。
 *  与登录页共享同一套通行证视觉语言（斜切卡片、品牌色、小奇吉祥物），
 *  让用户感觉"这不是报错，是在等小奇开门"。 */
export default function ServiceConnecting({ lastError, attempts, nextRetryIn, onRetry }: Props) {
  const [showDetail, setShowDetail] = useState(false)
  const severe = attempts >= 3

  return (
    <main className="connecting-screen">
      <div className="connecting-spread">
        <div className="connecting-left">
          <span className="passport-brand-mark">芽</span>
          <h1 className="connecting-title">{severe ? '叙芽岛还没有醒来' : '正在连接叙芽岛…'}</h1>
          <p className="connecting-subtitle">
            {severe
              ? '小奇已经等了好几次，叙芽岛的本地服务似乎还没启动。'
              : '小奇在等后端服务醒来，课程和作品马上就好。'}
          </p>
          <div className="connecting-status">
            <span
              className={
                'connecting-dot ' +
                (nextRetryIn === 0 ? 'connecting-dot--live' : 'connecting-dot--off')
              }
            />
            {severe
              ? `已尝试 ${attempts} 次 · ${nextRetryIn > 0 ? `${nextRetryIn} 秒后再试` : '正在重试…'}`
              : nextRetryIn > 0
                ? `${nextRetryIn} 秒后自动重试`
                : '正在尝试连接…'}
          </div>
        </div>
        <div className="connecting-right">
          <div className="connecting-mascot" aria-hidden="true">
            <div
              className={'xiaoqi-sticker' + (nextRetryIn > 0 ? ' shy' : '')}
              style={{ width: 'clamp(180px, 28vh, 260px)', margin: '0 auto' }}
              role="img"
            />
          </div>
          <div className="connecting-card">
            <h2>{severe ? '小奇在等你回来' : '叙芽岛是你的学习空间'}</h2>
            <p>
              {severe
                ? '前端页面已经打开，但本地后端服务还没响应。先让服务跑起来，全家就能一起学习创作了。'
                : '前后端都在你自己的电脑上跑，启动一次就能用好久。服务刚启动时需要十几秒准备。'}
            </p>
            {severe && (
              <button
                className="connecting-detail-toggle"
                type="button"
                onClick={() => setShowDetail((v) => !v)}
              >
                {showDetail ? '收起技术细节 ▲' : '查看技术细节 ▼'}
              </button>
            )}
            {severe && showDetail && lastError && (
              <pre className="connecting-detail">{lastError}</pre>
            )}
            <button
              className="passport-submit connecting-retry"
              onClick={onRetry}
              type="button"
              disabled={nextRetryIn === 0}
            >
              {nextRetryIn === 0 ? '正在重试…' : '立刻重试 →'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
