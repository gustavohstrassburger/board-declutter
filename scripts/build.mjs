import * as esbuild from 'esbuild'
import { cpSync, mkdirSync, rmSync } from 'node:fs'

const watch = process.argv.includes('--watch')
const outdir = 'dist'

rmSync(outdir, { recursive: true, force: true })
mkdirSync(outdir, { recursive: true })

const copyStatic = {
  name: 'copy-static',
  setup(build) {
    build.onEnd(() => {
      cpSync('src/manifest.json', `${outdir}/manifest.json`)
      cpSync('src/content/content.css', `${outdir}/content.css`)
      cpSync('src/options/options.html', `${outdir}/options.html`)
      cpSync('src/options/options.css', `${outdir}/options.css`)
      cpSync('src/icons', `${outdir}/icons`, { recursive: true })
    })
  },
}

const ctx = await esbuild.context({
  entryPoints: {
    content: 'src/content/index.ts',
    background: 'src/background/index.ts',
    options: 'src/options/options.ts',
  },
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  outdir,
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
  plugins: [copyStatic],
})

if (watch) {
  await ctx.watch()
} else {
  await ctx.rebuild()
  await ctx.dispose()
}
