import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeNotices(project){
  const inputs=JSON.parse(await fs.readFile(path.join(project,'dist','bundle-inputs.json'),'utf8'));
  const packages=new Map();
  for(const input of inputs){
    if(!input.replaceAll('\\','/').includes('node_modules/'))continue;
    let dir=path.dirname(path.resolve(project,input));
    while(dir!==path.dirname(dir)){
      try{
        const pkg=JSON.parse(await fs.readFile(path.join(dir,'package.json'),'utf8'));
        if(pkg.name&&pkg.version){packages.set(pkg.name,{dir,pkg});break;}
      }catch(e){if(e.code!=='ENOENT')throw e;}
      dir=path.dirname(dir);
    }
  }
  let text='# Third-party notices\n\nGenerated from the packages included in the plugin, MCP bridge and CLI bundles.\nExternal Obsidian/Electron/CodeMirror APIs are provided by the host application.\nThe OpenAI tunnel-client is downloaded separately and is not redistributed here.\n';
  for(const [name,{dir,pkg}] of [...packages].sort(([a],[b])=>a.localeCompare(b))){
    const licenses=(await fs.readdir(dir)).filter(x=>/^(licen[sc]e|copying|notice)(\.|$)/i.test(x));
    if(!licenses.length)throw new Error(`Missing license text for bundled package ${name}`);
    text+=`\n## ${name} ${pkg.version}\n\nLicense: ${typeof pkg.license==='string'?pkg.license:JSON.stringify(pkg.license)}\n`;
    for(const file of licenses){if(!(await fs.stat(path.join(dir,file))).isFile())continue;text+=`\n### ${file}\n\n\`\`\`text\n${(await fs.readFile(path.join(dir,file),'utf8')).trim()}\n\`\`\`\n`;}
  }
  await fs.writeFile(path.join(project,'THIRD_PARTY_NOTICES.md'),text);
}
