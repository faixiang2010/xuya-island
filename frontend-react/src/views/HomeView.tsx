import { useMemo } from 'react'
import LearningMap from '../components/LearningMap'
import LearningAtmosphere from '../components/LearningAtmosphere'
import { Settings2 } from 'lucide-react'
import { useClassroomStore } from '../stores/classroom'
import { useGameProgress } from '../games/progress'
import { stationSummary } from '../learning/stations'
import styles from './HomeView.module.css'

export default function HomeView() {
  const lessons = useClassroomStore((state) => state.lessons)
  const progress = useClassroomStore((state) => state.progress)
  const records = useGameProgress((state) => state.records)
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
          <details className={styles.settings}>
            <summary aria-label="学习设置">
              <Settings2 size={21} aria-hidden="true" />
              <span>设置</span>
            </summary>
            <LearningAtmosphere compact />
          </details>
        </div>
      </header>
      <LearningMap />
    </main>
  )
}
