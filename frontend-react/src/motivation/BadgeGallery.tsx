import {
  Blocks,
  Bomb,
  BookOpen,
  Brush,
  CalendarDays,
  CheckCircle2,
  Gamepad2,
  Hand,
  Images,
  Keyboard,
  Languages,
  Music,
  Palette,
  Piano,
  Radar,
  Search,
  Sprout,
  WandSparkles,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { earnedBadges, type Badge, type BadgeIcon } from './badges'
import './motivation.css'

const icons: Record<BadgeIcon, LucideIcon> = {
  keyboard: Keyboard,
  pinyin: Languages,
  hand: Hand,
  meteor: Zap,
  sprout: Sprout,
  book: BookOpen,
  palette: Palette,
  gamepad: Gamepad2,
  search: Search,
  wand: WandSparkles,
  calendar: CalendarDays,
  blocks: Blocks,
  bomb: Bomb,
  radar: Radar,
  wind: Wind,
  music: Music,
  piano: Piano,
  brush: Brush,
  images: Images,
}

export default function BadgeGallery({ badges }: { badges: Badge[] }) {
  const earned = earnedBadges(badges)
  return (
    <section className="badge-wall" aria-label="我的徽章">
      <header className="badge-wall-heading">
        <div>
          <h2>我的徽章</h2>
          <p>
            {earned.length
              ? `已经收集 ${earned.length} 枚徽章，都是真做过才拿到的。`
              : '第一枚徽章，就藏在下一张练习卡里。'}
          </p>
        </div>
        <span
          className="badge-wall-count"
          aria-label={`徽章进度 ${earned.length} / ${badges.length}`}
        >
          {earned.length} / {badges.length}
        </span>
      </header>
      <ul className="badge-grid">
        {badges.map((item) => {
          const Icon = icons[item.icon]
          return (
            <li key={item.id} className="badge-item" data-earned={item.earned}>
              <span className="badge-medal">
                <Icon size={22} aria-hidden="true" />
              </span>
              <div className="badge-copy">
                <strong>
                  {item.title}
                  {item.earned && <CheckCircle2 size={15} aria-label="已获得" />}
                </strong>
                <p>{item.description}</p>
                {!item.earned && (
                  <small>
                    进度 {item.current} / {item.total}
                  </small>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
