import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * 页面级错误边界：某一页渲染失败时只替换内容区，侧边栏和顶栏仍然可用。
 * 边界按路由 pathname 重建，所以一页出错不会牵连其他页面，也不会整站白屏。
 */
export default class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 异常正文只留给本机排查，不展示给孩子，也不上报到界面。
    console.error('[叙芽岛] 页面渲染失败', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="page">
        <div className="page-crash">
          <span className="brand-mark">芽</span>
          <h1>这一页暂时没打开</h1>
          <p>多半是数据还没准备好。回学习地图继续，或者重新加载这一页试试。</p>
          <div className="page-crash-actions">
            <a className="button primary" href="#/">
              回到学习地图
            </a>
            <button type="button" className="button secondary" onClick={() => location.reload()}>
              重新加载
            </button>
          </div>
        </div>
      </main>
    )
  }
}
