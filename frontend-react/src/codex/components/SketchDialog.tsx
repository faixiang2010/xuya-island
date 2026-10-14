import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Undo2, Trash2, X } from 'lucide-react'

interface Props {
  onClose: () => void
  onSave: (file: File) => void
}

type Point = { x: number; y: number }

export default function SketchDialog({ onClose, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [color, setColor] = useState('#24262b')
  const [width, setWidth] = useState(3)
  const strokesRef = useRef<{ color: string; width: number; points: Point[] }[]>([])
  const drawingRef = useRef(false)

  function point(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * 1000) / rect.width,
      y: ((event.clientY - rect.top) * 620) / rect.height,
    }
  }

  function render() {
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 1000, 620)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of strokesRef.current) {
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
      ctx.beginPath()
      stroke.points.forEach((p, index) => (index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.stroke()
    }
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    canvasRef.current!.setPointerCapture(event.pointerId)
    drawingRef.current = true
    strokesRef.current.push({ color, width, points: [point(event)] })
    render()
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (drawingRef.current) {
      strokesRef.current.at(-1)!.points.push(point(event))
      render()
    }
  }

  function undo() {
    strokesRef.current.pop()
    render()
  }

  function clear() {
    strokesRef.current.length = 0
    render()
  }

  function save() {
    canvasRef.current!.toBlob((blob) => {
      if (blob) onSave(new File([blob], `草图-${Date.now()}.png`, { type: 'image/png' }))
    }, 'image/png')
  }

  useEffect(() => {
    render()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="cx-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section
        className="cx-dialog cx-sketch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sketch-title"
      >
        <header>
          <div>
            <h2 id="sketch-title">绘制草图</h2>
            <p>画出布局或交互，作为图片附件交给智能体。</p>
          </div>
          <button className="cx-icon" aria-label="关闭草图" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <div className="cx-sketch-tools">
          <label>
            画笔颜色
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <label>
            粗细
            <input
              type="range"
              min={1}
              max={16}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </label>
          <button onClick={undo}>
            <Undo2 size={16} />
            撤销
          </button>
          <button onClick={clear}>
            <Trash2 size={16} />
            清空
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={1000}
          height={620}
          aria-label="草图画布"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={() => {
            drawingRef.current = false
          }}
          onPointerCancel={() => {
            drawingRef.current = false
          }}
        />
        <footer>
          <button className="cx-button" onClick={onClose}>
            取消
          </button>
          <button className="cx-button cx-primary" onClick={save}>
            添加草图附件
          </button>
        </footer>
      </section>
    </div>
  )
}
