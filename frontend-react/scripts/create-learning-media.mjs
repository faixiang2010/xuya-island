import { spawn } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Reproducible, original instructional diagrams. No downloaded footage or learner data.
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const output = path.join(root, 'public/media/learning')
const scratch = path.resolve(root, '.tmp', `learning-media-${randomUUID()}`)
if (path.dirname(scratch) !== path.join(root, '.tmp'))
  throw new Error('Media scratch path escaped the frontend.')
const font = (process.env.XUYA_MEDIA_FONT || 'C:/Windows/Fonts/msyh.ttc')
  .replaceAll('\\', '/')
  .replaceAll(':', '\\:')
const clips = [
  {
    file: 'case-switch',
    title: '大小写怎样切换',
    scenes: [
      {
        seconds: 3,
        key: 'A 键 → a',
        text: '英文模式：先试试小写字母',
        caption: '按字母键通常输入小写 a。',
      },
      {
        seconds: 3,
        key: 'Shift + A → A',
        text: '按住 Shift，再按字母键',
        caption: '按住 Shift 输入大写 A；松开后回到小写。',
      },
      {
        seconds: 3,
        key: '目标 A ≠ 输入 a',
        text: '大小写要和目标一致',
        caption: '目标是大写 A，小写 a 需要修正。',
      },
      {
        seconds: 3,
        key: 'Caps Lock',
        text: '连续大写也可以用 Caps Lock',
        caption: 'Caps Lock 切换持续大写，回到小写时关掉它。',
      },
    ],
  },
  {
    file: 'pinyin-entry',
    title: '拼音怎样变成汉字',
    scenes: [
      {
        seconds: 3,
        key: '中文拼音输入法',
        text: '先切换到设备上的中文拼音输入法',
        caption: '页面不会更改你的系统输入法。',
      },
      {
        seconds: 3,
        key: 'shan → 山',
        text: '输入拼音，选择目标汉字',
        caption: '候选界面因输入法而异，这里只演示选字步骤。',
      },
      {
        seconds: 3,
        key: '正在选字…',
        text: '程序会等你，不在选字时判错',
        caption: '短句也可以分几次选字，慢慢写完整。',
      },
      {
        seconds: 3,
        key: '山 → 自动送达',
        text: '选好的汉字进入输入框后自动校验',
        caption: '正确就前进，不用再点击检查答案。',
      },
    ],
  },
  {
    file: 'first-program',
    title: '改一个名字，看看程序的变化',
    scenes: [
      {
        seconds: 4,
        key: 'print("月光森林")',
        text: '先运行，再观察结果',
        caption: '输出：月光森林。先看看程序已经做了什么。',
      },
      {
        seconds: 4,
        key: 'print("云朵邮局")',
        text: '只改引号里的故事名',
        caption: '保留英文引号和括号，把名字换成自己的想法。',
      },
      {
        seconds: 4,
        key: '输出：云朵邮局',
        text: '再次运行，结果跟着改变',
        caption: '代码里改一处，作品里就有一个可见变化。',
      },
      {
        seconds: 3,
        key: '猜一猜 → 改一处 → 看变化',
        text: '接下来，让故事变成你的版本',
        caption: '说说你发现了什么，也可以邀请家人看看。',
      },
    ],
  },
]
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.XUYA_FFMPEG || 'ffmpeg', args, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let error = ''
    child.stderr.on('data', (chunk) => {
      error = (error + chunk).slice(-3000)
    })
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(error))))
  })
}
const timestamp = (value) => `00:00:${String(value).padStart(2, '0')}.000`
try {
  await mkdir(scratch, { recursive: true })
  await mkdir(output, { recursive: true })
  for (const clip of clips) {
    const duration = clip.scenes.reduce((total, scene) => total + scene.seconds, 0)
    const filters = [
      'drawbox=x=0:y=0:w=960:h=86:color=0x18243b:t=fill',
      'drawbox=x=44:y=120:w=872:h=330:color=white:t=fill',
    ]
    async function text(value, y, size, color, enabled, tag) {
      const file = path.join(scratch, `${clip.file}-${tag}.txt`)
      await writeFile(file, value, 'utf8')
      const relative = path.relative(root, file).replaceAll('\\', '/')
      filters.push(
        `drawtext=fontfile='${font}':textfile='${relative}':fontsize=${size}:fontcolor=${color}:x=(w-text_w)/2:y=${y}${enabled ? `:enable='${enabled}'` : ''}`,
      )
    }
    await text('叙芽岛 · 一小段演示，马上动手试', 26, 26, 'white', '', 'header')
    await text(clip.title, 144, 32, '0x7d3c5c', '', 'title')
    let start = 0
    let captions = 'WEBVTT\n\n'
    for (const [index, scene] of clip.scenes.entries()) {
      const end = start + scene.seconds
      const enabled = `gte(t,${start})*lt(t,${end})`
      await text(
        scene.key,
        242,
        scene.key.length > 18 ? 32 : 48,
        '0xb64e80',
        enabled,
        `key-${index}`,
      )
      await text(scene.text, 344, 25, '0x24334c', enabled, `step-${index}`)
      await text(scene.caption, 482, 22, '0x526178', enabled, `caption-${index}`)
      captions += `${index + 1}\n${timestamp(start)} --> ${timestamp(end)}\n${scene.caption}\n\n`
      start = end
    }
    filters.push('fade=t=in:st=0:d=0.25', `fade=t=out:st=${duration - 0.25}:d=0.25`)
    await run([
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=0xfff1f7:s=960x540:r=20:d=${duration}`,
      '-vf',
      filters.join(','),
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '25',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      path.join(output, `${clip.file}.mp4`),
    ])
    await writeFile(path.join(output, `${clip.file}.vtt`), captions, 'utf8')
    console.log(`Created ${clip.file}.mp4 (${duration}s) and Chinese captions.`)
  }
} finally {
  if (path.dirname(scratch) !== path.join(root, '.tmp'))
    throw new Error('Refusing unsafe scratch cleanup.')
  await rm(scratch, { recursive: true, force: true })
}
