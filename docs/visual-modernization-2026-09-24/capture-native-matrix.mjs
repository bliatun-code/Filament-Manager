// Independent critic capture harness. Run from repository root after code freeze
// and after the interactive test application has been closed. Never opens the
// production application or production database.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runLaunchedDesktopScreenshotGate } from '../../scripts/run-desktop-screenshot-gate.mjs';

const root = process.cwd();
const base = resolve(root, 'tmp/visual-modernization');
const executable = process.env.CRITIC_CAPTURE_EXECUTABLE || '/private/tmp/filament-modernization-20260924/Filament Visual Review.app/Contents/MacOS/filament-visual-review';
const sourcePath = resolve(base, 'review.db');
const outputRoot = resolve(base, process.env.CRITIC_CAPTURE_ROUND || 'critic-r2');
const themes = (process.env.CRITIC_CAPTURE_THEMES || 'light,dark,bambu,prusa').split(',');
const locale = process.env.CRITIC_CAPTURE_LOCALE || 'en';
const manifest = JSON.parse(readFileSync(resolve(root, 'ui/src/lib/desktop_visual_qa_scenarios.json'), 'utf8')).scenarios;
const requested = process.env.CRITIC_CAPTURE_SCENARIOS?.split(',');
const scenarios = requested ? manifest.filter(s => requested.includes(s.id)) : manifest;
if (!existsSync(executable) || !existsSync(sourcePath)) throw new Error('Missing isolated test bundle or synthetic review.db.');
if (!['en','nb'].includes(locale)) throw new Error('This review harness only expects en or nb.');
if (themes.some(t => !['light','dark','bambu','prusa','auto'].includes(t))) throw new Error('Unsupported theme.');
if (requested && scenarios.length !== requested.length) throw new Error('Unknown or duplicate scenario.');
mkdirSync(outputRoot,{recursive:true});
const results=[];
for (const themeMode of themes) {
  for (const scenario of scenarios) {
    const outputDir=resolve(outputRoot, `native-${locale}-${themeMode}`);
    mkdirSync(outputDir,{recursive:true});
    const resultFile=resolve(outputDir,scenario.id+'.json');
    // Explicit resume: existing evidence is retained, never silently replaced.
    if (existsSync(resultFile)) { console.log('EXISTS',themeMode,scenario.id); continue; }
    let result;
    try {
      result=await runLaunchedDesktopScreenshotGate({
        sourcePath, profile:'rich', processName:'Filament Visual Review',
        scenario:scenario.id, themeMode, locale, outputDir, name:scenario.id,
        captureDelayMs:3500, startupTimeoutMs:45000,
        keep:false, keepAppOnFail:false,
        spawnFn:(_command,_args,options)=>spawn(executable,[],{
          ...options,
          env:{...options.env,
            FILAMENT_MANAGER_VISUAL_QA_WINDOW_SIZE:process.env.CRITIC_CAPTURE_SIZE || '1440x960',
          },
        }),
      });
    } catch(error) {
      result={scenario:scenario.id,themeMode,locale,errors:[String(error?.message||error)],
        launchOwnershipUnresolved: Boolean(error?.launchOwnershipUnresolved),
        status:'not evaluated: capture failed'};
    }
    result.criticInspection='pending';
    writeFileSync(resultFile,JSON.stringify(result,null,2)+'\n');
    results.push(result);
    console.log(result.errors?.length?'FAIL':'CAPTURED',themeMode,scenario.id,result.errors?.join(' | ')||'');
    // Failed ownership is a real safety boundary: no second process is launched
    // until the previous one is known stopped. Readiness failure alone is logged
    // as an evidence gap and does not fabricate a screenshot.
    if(result.launchOwnershipUnresolved || result.appKept || result.terminationConfirmed===false) {
      throw new Error('Capture process ownership unresolved; inspect saved result before resuming.');
    }
  }
}
writeFileSync(resolve(outputRoot,`native-matrix-${locale}-${themes.join('-')}.json`),JSON.stringify(results,null,2)+'\n');
