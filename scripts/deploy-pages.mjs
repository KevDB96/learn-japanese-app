import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

const repo = process.cwd()
const branch = 'gh-pages'
const run = (args, options = {}) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe', ...options }).trim()
const isAncestor = (older, newer) => spawnSync('git', ['merge-base', '--is-ancestor', older, newer], { cwd: repo, stdio: 'ignore' }).status === 0
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const sourceSha = run(['rev-parse', 'HEAD'])
if (run(['branch', '--show-current']) !== 'main') throw new Error('Pages publication must start from main')
if (run(['status', '--porcelain', '--untracked-files=no'])) throw new Error('Commit tracked source changes before publishing')

// Vite exposes VITE_* variables to browser code. Reject administrative credentials before running a build.
for (const [name] of Object.entries(process.env)) {
  if (/^VITE_.*(SERVICE_ROLE|ADMIN|SECRET|PRIVATE_KEY)/i.test(name)) throw new Error('Unsafe browser environment variable is configured')
}
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  try {
    const content = await readFile(join(repo, name), 'utf8')
    if (/^\s*(?:export\s+)?VITE_[A-Z0-9_]*(?:SERVICE_ROLE|ADMIN|SECRET|PRIVATE_KEY)[A-Z0-9_]*\s*=/im.test(content)) throw new Error(`Unsafe browser variable is configured in ${name}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

for (const [label, args] of [
  ['tests', ['run', 'test']],
  ['typecheck', ['run', 'typecheck']],
  ['content validation', ['run', 'content:validate']],
  ['asset validation', ['run', 'assets:validate']],
  ['production build', ['run', 'build']],
]) {
  process.stdout.write(`Pages gate: ${label}\n`)
  execFileSync(npm, args, { cwd: repo, stdio: 'inherit' })
  if (run(['rev-parse', 'HEAD']) !== sourceSha) throw new Error('Source SHA changed during validation')
  if (run(['status', '--porcelain', '--untracked-files=no'])) throw new Error(`Tracked source changed during ${label}`)
}

const dist = join(repo, 'dist')
const html = await readFile(join(dist, 'index.html'), 'utf8')
const manifest = JSON.parse(await readFile(join(dist, 'manifest.webmanifest'), 'utf8'))
const sw = await readFile(join(dist, 'sw.js'), 'utf8')
if (!html.includes('/learn-japanese-app/manifest.webmanifest') || manifest.start_url !== './' || manifest.scope !== './') throw new Error('Pages base or PWA scope validation failed')
if (!sw.includes('/learn-japanese-app/') || sw.includes('"/assets/')) throw new Error('Service worker precache paths are outside Pages scope')

const temp = await mkdtemp(join(tmpdir(), 'jla-pages-'))
try {
  const stage = join(temp, 'site')
  await cp(dist, stage, { recursive: true })
  const metadata = { source_sha: sourceSha, published_at: new Date().toISOString(), branch }
  await writeFile(join(stage, 'DEPLOYMENT.json'), `${JSON.stringify(metadata, null, 2)}\n`)
  const gitDir = resolve(repo, run(['rev-parse', '--git-dir']))
  const index = join(temp, 'index')
  const env = { ...process.env, GIT_DIR: gitDir, GIT_WORK_TREE: stage, GIT_INDEX_FILE: index }
  execFileSync('git', ['read-tree', '--empty'], { cwd: stage, env, stdio: 'pipe' })
  execFileSync('git', ['add', '--all'], { cwd: stage, env, stdio: 'pipe' })
  const tree = execFileSync('git', ['write-tree'], { cwd: stage, env, encoding: 'utf8' }).trim()
  const localPrevious = (() => { try { return run(['rev-parse', `refs/heads/${branch}`]) } catch { return undefined } })()
  const remoteLine = execFileSync('git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], { cwd: repo, encoding: 'utf8' }).trim()
  const remotePrevious = remoteLine ? remoteLine.split(/\s+/)[0] : undefined
  if (remotePrevious) execFileSync('git', ['fetch', '--quiet', 'origin', `refs/heads/${branch}:refs/remotes/origin/${branch}`], { cwd: repo, stdio: 'inherit' })
  if (localPrevious && remotePrevious) {
    const localBehindOrEqual = isAncestor(localPrevious, remotePrevious)
    const remoteBehindOrEqual = isAncestor(remotePrevious, localPrevious)
    if (!localBehindOrEqual && !remoteBehindOrEqual) throw new Error('Local and remote Pages branches have diverged')
  }
  const previous = !localPrevious ? remotePrevious : !remotePrevious ? localPrevious :
    isAncestor(localPrevious, remotePrevious) ? remotePrevious : localPrevious
  const message = `Deploy ${sourceSha} to GitHub Pages`
  const commitArgs = ['commit-tree', tree]
  if (previous) commitArgs.push('-p', previous)
  const deployedSha = execFileSync('git', commitArgs, { cwd: repo, encoding: 'utf8', input: `${message}\n` }).trim()
  // Push the fully validated commit first. A non-fast-forward or unavailable remote leaves the deployed branch unchanged.
  execFileSync('git', ['push', 'origin', `${deployedSha}:refs/heads/${branch}`], { cwd: repo, stdio: 'inherit' })
  run(['update-ref', `refs/heads/${branch}`, deployedSha, localPrevious ?? '0000000000000000000000000000000000000000'])
  process.stdout.write(`Pages source SHA: ${sourceSha}\nPages deployed SHA: ${deployedSha}\n`)
} finally {
  await rm(temp, { recursive: true, force: true })
}
