const fs = require('fs');
const path = require('path');
const po2json = require('po2json');

const localesPath = path.join(__dirname, '../weblate/locales');

const outputDir = path.join(localesPath, 'compiled');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.readdirSync(localesPath).forEach((langDir) => {
  const langPath = path.join(localesPath, langDir);
  const poFilePath = path.join(langPath, 'LC_MESSAGES/messages.po');

  if (fs.existsSync(poFilePath)) {
    try {
      // console.log(`Converting ${langDir} translations...`);
      const poContent = fs.readFileSync(poFilePath, 'utf8');
      const jsonContent = po2json.parse(poContent);

      const outputFile = path.join(outputDir, `${langDir}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(jsonContent, null, 2));
      // console.log(`Saved ${langDir} translations to ${outputFile}`);
    } catch (error) {
      // console.error(`Error processing ${langDir}:`, error);
    }
  }
});

// console.log('Conversion complete!');
