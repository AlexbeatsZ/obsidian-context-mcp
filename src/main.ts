import { Plugin, PluginSettingTab, Setting, App, Notice, editorInfoField, FileSystemAdapter } from "obsidian";
import { EditorView } from "@codemirror/view";
import path from "node:path";
import fs from "node:fs/promises";
import { ObsidianPort } from "./obsidian-port";
import { ReviewEngine } from "./engine";
import { PluginService } from "./service";
import { ContextTracker } from "./context";
import { startPluginServer } from "./http";
import { REVIEW_VIEW, ReviewView } from "./review";

const DEFAULT_PROJECT="C:/Users/Meta/Project/Workspaces/obsidian-context-mcp";
export default class ContextPlugin extends Plugin {
  project="";engine!:ReviewEngine;context!:ContextTracker;connected=false;
  private stop:(()=>Promise<void>)|null=null;
  async onload(){
    this.project=this.app.loadLocalStorage("obsidian-context-mcp.project")??DEFAULT_PROJECT;
    this.addSettingTab(new ContextSettings(this.app,this));
    this.addCommand({id:"open-review",name:"审阅候选修改",callback:()=>this.openReview()});
    this.addRibbonIcon("git-compare-arrows","审阅候选修改",()=>this.openReview());
    if(!(this.app.vault.adapter instanceof FileSystemAdapter)){new Notice("Obsidian Context MCP 仅支持桌面文件仓库。");return;}
    try{
      const config=JSON.parse(await fs.readFile(path.join(this.project,".local","config.json"),"utf8")) as {vault:string;root:string};
      const root=this.app.vault.adapter.getBasePath();
      if(path.resolve(root).toLowerCase()!==path.resolve(config.root).toLowerCase())return;
      const port=new ObsidianPort(this.app,root);this.engine=new ReviewEngine(port,path.join(this.project,".local"),config.vault);
      await this.engine.load();this.context=new ContextTracker(this.app,port,config.vault);
      this.registerView(REVIEW_VIEW,leaf=>new ReviewView(leaf,this.engine,this.project));
      this.engine.onChange=()=>this.app.workspace.getLeavesOfType(REVIEW_VIEW).forEach(l=>(l.view as ReviewView).render());
      this.registerEditorExtension(EditorView.updateListener.of(update=>{
        if(update.docChanged||update.selectionSet){const info=update.state.field(editorInfoField,false);if(info)this.context.capture(info);if(update.docChanged&&info?.file)void this.engine.invalidate(info.file.path);}
      }));
      this.registerEvent(this.app.workspace.on("active-leaf-change",()=>this.context.captureLeaf()));
      this.registerEvent(this.app.workspace.on("editor-change",(_,info)=>{this.context.capture(info);if(info.file)void this.engine.invalidate(info.file.path);}));
      this.registerEvent(this.app.vault.on("modify",f=>void this.engine.invalidate(f.path)));
      this.registerEvent(this.app.vault.on("delete",f=>void this.engine.invalidate(f.path)));
      this.registerEvent(this.app.vault.on("rename",(f,old)=>{void this.engine.invalidate(old);this.context.captureLeaf();}));
      this.registerDomEvent(document,"selectionchange",()=>this.context.captureReadingSelection(document));
      this.registerDomEvent(window,"blur",()=>this.context.captureLeaf());
      this.app.workspace.onLayoutReady(()=>this.context.captureLeaf());
      const service=new PluginService(port,this.engine,n=>this.context.get(n));
      const runtime=await startPluginServer(path.join(this.project,".local"),config.vault,root,async(name,args)=>{
        const result=await service.call(name,args);if(name==="obsidian_propose_changes"&&"proposal_id" in result)await this.openReview(String(result.proposal_id));return result;
      });
      this.stop=runtime.close;this.connected=true;const status=this.addStatusBarItem();status.setText("笔记 MCP 已连接");status.onclick=()=>this.openReview();
    }catch(e){new Notice(`笔记 MCP 未连接：${(e as Error).message}`,10000);console.error("Obsidian Context MCP",e);}
  }
  async openReview(id?:string){if(!this.engine){new Notice("请先检查笔记 MCP 的项目配置。");return;}let leaf=this.app.workspace.getLeavesOfType(REVIEW_VIEW)[0];if(!leaf){leaf=this.app.workspace.getLeaf("tab");await leaf.setViewState({type:REVIEW_VIEW,active:true});}if(id)(leaf.view as ReviewView).select(id);await this.app.workspace.revealLeaf(leaf);}
  onunload(){this.connected=false;if(this.stop)void this.stop();}
}
class ContextSettings extends PluginSettingTab {
  constructor(app:App,public plugin:ContextPlugin){super(app,plugin);}
  display(){const el=this.containerEl;el.empty();el.createEl("h2",{text:"Obsidian Context MCP"});new Setting(el).setName("连接状态").setDesc(this.plugin.connected?"STEM 已连接，修改需要在审阅页接受。":"未连接，请检查项目路径并重新加载插件。");new Setting(el).setName("本机项目目录").setDesc("只在本机保存，不随仓库同步。更改后重新加载插件。").addText(t=>t.setValue(this.plugin.project).onChange(value=>{this.app.saveLocalStorage("obsidian-context-mcp.project",value);}));new Setting(el).setName("候选修改").addButton(b=>b.setButtonText("打开审阅").onClick(()=>this.plugin.openReview()));}
}
