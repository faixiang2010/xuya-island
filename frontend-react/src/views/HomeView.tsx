import LearningMap from '../components/LearningMap'
import LearningAtmosphere from '../components/LearningAtmosphere'
import { Settings2 } from 'lucide-react'
import styles from './HomeView.module.css'

export default function HomeView() {
  return (
    <main className={'page home-page ' + styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>我的探险手册</h1>
          <p>学习地图 · 从第一条线索开始</p>
        </div>
        <details className={styles.settings}>
          <summary aria-label="学习设置">
            <Settings2 size={21} aria-hidden="true" />
            <span>设置</span>
          </summary>
          <LearningAtmosphere compact />
        </details>
      </header>
      <LearningMap />
    </main>
  )
}
