import fs from 'fs';
import path from 'path';
import gettextParser from 'gettext-parser';

const base = path.resolve('weblate/locales');

function compilePoToMo(poPath) {
  const moPath = poPath.replace(/\.po$/, '.mo');
  const poContent = fs.readFileSync(poPath, 'utf8');
  const po = gettextParser.po.parse(poContent);
  const moBuffer = gettextParser.mo.compile(po);
  fs.writeFileSync(moPath, moBuffer);
}

function walkLocales() {
  if (!fs.existsSync(base)) return;
  for (const lang of fs.readdirSync(base)) {
    const lcDir = path.join(base, lang, 'LC_MESSAGES');
    if (!fs.existsSync(lcDir)) continue;
    for (const file of fs.readdirSync(lcDir)) {
      if (file.endsWith('.po')) {
        compilePoToMo(path.join(lcDir, file));
      }
    }
  }
}

// console.log('Compiling .po files...');
walkLocales();
