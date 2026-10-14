import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useClassroomStore } from '../stores/classroom'
import type { Lesson } from '../types'
import { lessonStatus, nextLesson, phaseSkills } from '../learning/path'
import styles from './ClassroomCatalogView.module.css'

const progressNames: Record<string, string> = {
  'not-started': '未开始',
  'in-progress': '学习中',
  completed: '已完成',
  'needs-review': '建议复习',
}

export default function ClassroomCatalogView() {
  const allLessons = useClassroomStore((state) => state.lessons)
  const curriculum = useClassroomStore((state) => state.curriculum)
  const progress = useClassroomStore((state) => state.progress)
  const [phaseId, setPhaseId] = useState('all')

  const lessons = allLessons
    .filter((lesson) => lesson.number > 0)
    .sort((a, b) => a.number - b.number)
  const phases = curriculum?.phases ?? []
  const groups = phases
    .filter((phase) => phaseId === 'all' || phase.id === phaseId)
    .map((phase) => ({
      ...phase,
      lessons: lessons.filter((lesson) => lesson.phaseId === phase.id),
    }))
  const coreCount = lessons.filter((lesson) => lesson.track === 'core').length
  const extraLessons = allLessons.filter((lesson) => lesson.number === 0)
  const suggested = nextLesson(lessons, progress)

  function progressLabel(lesson: Lesson) {
    const status = progress.find(
      (item) => item.lessonId === lesson.id && item.lessonVersion === lesson.version,
    )?.status
    return progressNames[status ?? 'not-started']
  }

  return (
    <main className="page catalog-page">
      <div className="page-heading">
        <div>
          <Link to="/" className="back-link">
            ← 返回学习地图
          </Link>
          <h1>编程课堂</h1>
          <p>先让程序说话，再学条件、循环和函数。跟着主线，一步一步做出自己的作品。</p>
        </div>
      </div>
      <section className={styles['catalog-overview']} aria-label="课程概览">
        <div>
          <strong>{lessons.length}</strong>
          <span>个完整活动</span>
        </div>
        <div>
          <strong>{phases.length}</strong>
          <span>个学习阶段</span>
        </div>
        <div>
          <strong>{coreCount}</strong>
          <span>个推荐主线活动</span>
        </div>
        <div>
          <strong>{lessons.length - coreCount}</strong>
          <span>个可选探索活动</span>
        </div>
      </section>
      <section className={styles.recommendation} aria-label="建议下一课">
        <div>
          <h2>
            {suggested
              ? lessonStatus(suggested, progress) === 'needs-review'
                ? '先复习这一课'
                : '建议从这一课继续'
              : '推荐主线已完成'}
          </h2>
          <p>
            {suggested
              ? `${String(suggested.number).padStart(2, '0')} · ${suggested.title}`
              : '可以探索数据小侦探，也可以去创作室做自己的作品。'}
          </p>
          <small>第一次写代码？先运行，观察结果，再改一个地方。完整活动可以分几次完成。</small>
        </div>
        <Link className="button primary" to={suggested ? `/classroom/${suggested.id}` : '/studio'}>
          {suggested ? '打开这一课 →' : '去创作 →'}
        </Link>
        <Link className="button secondary" to="/games">
          先练打字 →
        </Link>
      </section>
      <div className={styles['catalog-toolbar']}>
        <p>零基础建议从第 01 课按顺序学习；后两个阶段是可选探索。每课约 50 分钟，可分段进行。</p>
        <label>
          学习阶段
          <select
            value={phaseId}
            aria-label="学习阶段"
            onChange={(event) => setPhaseId(event.target.value)}
          >
            <option value="all">全部阶段</option>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phaseSkills[phase.id] ?? phase.title} ·{' '}
                {phase.track === 'core' ? '推荐主线' : '可选探索'}
              </option>
            ))}
          </select>
        </label>
      </div>
      {groups.map((phase) => (
        <section
          key={phase.id}
          className={styles['catalog-phase']}
          aria-labelledby={`phase-${phase.id}`}
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                {phase.track === 'core' ? '推荐主线' : '可选探索'} · {phase.lessons.length} 个活动
              </span>
              <h2 id={`phase-${phase.id}`}>
                {phaseSkills[phase.id] ?? phase.title} · {phase.title}
              </h2>
              <p>
                {phase.description} 阶段作品：{phase.project}
              </p>
            </div>
          </div>
          <div className="lesson-grid">
            {phase.lessons.map((lesson) => (
              <Link
                key={lesson.id}
                to={`/classroom/${lesson.id}`}
                className={'lesson-card ' + styles['catalog-lesson']}
              >
                <div className="lesson-card-body">
                  <div className={styles['catalog-lesson-meta']}>
                    <span className={styles['catalog-number']}>
                      {String(lesson.number).padStart(2, '0')}
                    </span>
                    <span>
                      {progressLabel(lesson)} · 约 {lesson.minutes} 分钟
                    </span>
                  </div>
                  <h3>{lesson.title}</h3>
                  <p>{lesson.subtitle}</p>
                  <p className={styles.prerequisites}>
                    {lesson.prerequisites.length === 0
                      ? '起点活动 · 不需要编程基础'
                      : '建议先学：' +
                        lesson.prerequisites
                          .map((id) => allLessons.find((item) => item.id === id)?.title ?? id)
                          .join('、')}
                  </p>
                  <span className="card-link">
                    {lesson.previewType === 'drawing' ? '去画画' : '去创作'} ↗
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {extraLessons.length > 0 && (
        <section className={styles['catalog-extra']} aria-label="自由试验">
          <h2>自由试验</h2>
          <p>还想随手画一画？打开画笔试验场，试试你的新点子。</p>
          {extraLessons.map((lesson) => (
            <Link key={lesson.id} to={`/classroom/${lesson.id}`} className="button secondary">
              {lesson.title} →
            </Link>
          ))}
        </section>
      )}
    </main>
  )
}
