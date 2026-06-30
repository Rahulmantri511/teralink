import { ProxyAgent } from 'undici';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function run() {
  const surl = 'ZypsOmvsynexAcJuae5foA';
  const cookies = 'ndus=YSUCgBNpeHuiQmtO2YHamfRgkGLnLDKWbG5XrOlT; ndut_fmt=322A330D98AFCEAA75F4D488D84EDFC5E6736DB207E4C703D1F6BD6FB7378430; ndut_fmv=749f7b379a942c8a528fb21640bdb926e2188cf92f4d8b9807d72708b721dc895a6ee88394ccebca57cd9d4314d660c18cc1a097a95f8f7df0581748059c86f2f24796456edd2e67311889178119275533eed3f2b2f4ac19154233502e6df32d7e7f73594723cfe57142014076be6e6d; csrfToken=IPq4pZNS4T14lGkTu2553zP0; browserid=7Ytc2VreLh4OSq9EfbGMhYnfJMdwcjssoOhNbJjfK3s0yHmZikVqfG0h8rU=';
  
  const headers = {
    'User-Agent': UA,
    'Cookie': cookies,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  };
  
  const resp = await fetch(`https://dm.1024tera.com/sharing/link?surl=${surl}`, { headers });
  const html = await resp.text();
  
  const templateDataMatch = html.match(/var templateData = (\{[\s\S]*?\});\s*<\/script>/);
  if (templateDataMatch) {
    console.log('Found templateData!');
    const data = JSON.parse(templateDataMatch[1]);
    console.log('Keys in templateData:', Object.keys(data));
    console.log('file_list or list inside templateData:', data.file_list || data.list || data.fileList ? 'Found' : 'Not found');
    
    // Log the entire templateData to file to inspect
    const fs = require('fs');
    fs.writeFileSync('scratch/templateData.json', JSON.stringify(data, null, 2));
    console.log('Saved templateData.json to scratch/templateData.json');
  } else {
    console.log('templateData not found.');
  }
}

run().catch(console.error);
