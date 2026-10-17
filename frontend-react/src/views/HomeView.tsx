import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import LearningMap from '../components/LearningMap'
import LearningAtmosphere from '../components/LearningAtmosphere'
import { familyApi } from '../account/api'
import { useFamily } from '../account/AuthGate'
import { useClassroomStore } from '../stores/classroom'
import { useGameProgress } from '../games/progress'
import { stationSummary } from '../learning/stations'
import styles from './HomeView.module.css'

export default function HomeView() {
  const lessons = useClassroomStore((state) => state.lessons)
  const progress = useClassroomStore((state) => state.progress)
  const records = useGameProgress((state) => state.records)
  const family = useFamily()
  // 提前告知，免得孩子点进课堂才发现跑不起来；只有能进家庭管理的人才给直达入口。
  const [runtimeMissing, setRuntimeMissing] = useState(false)
  const canManageRuntime =
    family.user?.permissions.some(
      (permission) => permission === '*' || permission === 'system:manage',
    ) ?? false
  useEffect(() => {
    let alive = true
    void familyApi<{ configured: boolean }>('/execution/environment')
      .then((value) => {
        if (alive) setRuntimeMissing(value.configured === false)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  const { done, total } = useMemo(
    () => stationSummary({ lessons, progress, records }),
    [lessons, progress, records],
  )
  return (
    <main className={'page home-page ' + styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>我的探险手册</h1>
          <p>学习地图 · 从第一条线索开始</p>
        </div>
        <div className={styles.tools}>
          <p className={styles.journey}>
            <span className={styles.journeyBar} aria-hidden="true">
              <i style={{ width: `${Math.round((done / total) * 100)}%` }} />
            </span>
            <strong>
              已走完 {done} / {total} 站
            </strong>
          </p>
          <LearningAtmosphere />
        </div>
      </header>
      {runtimeMissing && (
        <div className="runtime-setup">
          <strong>这台电脑还没有可用的 Python</strong>
          <p>课堂和创作室暂时不能运行代码。请大人打开「家庭管理 → 运行与共享」选择一个 Python。</p>
          {canManageRuntime && (
            <div className="runtime-setup-actions">
              <Link className="button secondary" to="/admin?section=running">
                现在去准备 →
              </Link>
            </div>
          )}
        </div>
      )}
      <LearningMap />
    </main>
  )
}
