import { useEffect, useRef, type ReactNode } from 'react'
import { X, PanelRightClose } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

/** 功能抽屉复用同一工作台上下文，不卸载聊天或终端。 */
export default function WorkbenchDrawer({ title, onClose, children }: Props) {
  const dialog = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const host = dialog.current
    host?.focus()
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !host) return
      const controls = Array.from(
        host.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ),
      ).filter((control) => control.getClientRects().length > 0)
      const first = controls[0]
      const last = controls.at(-1)
      if (!first) {
        event.preventDefault()
        host.focus()
        return
      }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === host)) {
        event.preventDefault()
        last?.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === host)
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      previous?.focus()
    }
  }, [])
  return (
    <div className="cx-drawer-layer">
      <div className="cx-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <section
        ref={dialog}
        tabIndex={-1}
        className="cx-workbench-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="cx-drawer-heading">
          <span>
            <PanelRightClose size={17} />
            工作台工具 <i>/</i> {title}
          </span>
          <button className="cx-icon" onClick={onClose} aria-label="关闭工具面板">
            <X size={18} />
          </button>
        </header>
        <div className="cx-drawer-content">{children}</div>
      </section>
    </div>
  )
}
