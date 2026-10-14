import { useEffect, useRef, type ReactNode } from 'react'
import { Drawer } from 'antd'
import '../views/FamilyPages.css'

/** 两个家庭页面共用侧边面板，关闭后回到原入口。 */
export default function FamilyPanel({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const returnFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open && document.activeElement instanceof HTMLElement)
      returnFocus.current = document.activeElement
  }, [open])
  return (
    <Drawer
      open={open}
      title={title}
      onClose={onClose}
      getContainer={false}
      rootClassName="family-panel"
      width="min(720px, 100vw)"
      keyboard
      afterOpenChange={(visible) => {
        if (!visible && returnFocus.current?.isConnected) returnFocus.current.focus()
      }}
    >
      {children}
    </Drawer>
  )
}
