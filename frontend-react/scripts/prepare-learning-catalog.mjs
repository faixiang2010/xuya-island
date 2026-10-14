import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { typingGames, missionSize } from '../src/games/content.ts'

// 游戏内容仍以现有版本化定义为唯一来源，Java的固定校验读取构建时投影。
const directory = path.resolve(
  fileURLToPath(new URL('../../backend/target/generated-resources/learning/', import.meta.url)),
)
await mkdir(directory, { recursive: true })
await writeFile(
  path.join(directory, 'typing-v1.json'),
  JSON.stringify({ version: 1, missionSize, games: typingGames }),
  'utf8',
)
