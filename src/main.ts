import { Plugin, PluginSettingTab, Setting, App, Notice, editorInfoField, FileSystemAdapter } from "obsidian";
import { EditorView } from "@codemirror/view";
import path from "node:path";
import fs from "node:fs/promises";
import { ObsidianPort } from "./obsidian-port";
import { ReviewEngine } from "./engine";
import { PluginService } from "./service";
import { ContextTracker } from "./context";
import { startPluginServer } from "./http";
import { InlineReview } from "./inline-review";
import { defaultProjectDir, sameVaultRoot } from "./platform";

const LEGACY_REVIEW_VIEW="obsidian-context-mcp-review";
export default class ContextPlugin extends Plugin {
  project="";engine!:ReviewEngine;context!:ContextTracker;connected=false;
  private stop:(()=>Promise<void>)|null=null;
  private inline:InlineReview|null=null;
  async onload(){
    this.project=this.app.loadLocalStorage("obsidian-context-mcp.project")??defaultProjectDir();
    this.addSettingTab(new ContextSettings(this.app,this));
    this.addCommand({id:"open-review",name:"审阅候选修改",callback:()=>this.openReview()});
    this.addRibbonIcon("git-compare-arrows","审阅候选修改",()=>this.openReview());
    if(!(this.app.vault.adapter instanceof FileSystemAdapter)){new Notice("Obsidian Context MCP 仅支持桌面文件仓库。");return;}
    try{
      const config=JSON.parse(await fs.readFile(path.join(this.project,".local","config.json"),"utf8")) as {vault:string;root:string};
      const root=this.app.vault.adapter.getBasePath();
      if(!await sameVaultRoot(root,config.root))return;
      const port=new ObsidianPort(this.app,root);this.engine=new ReviewEngine(port,path.join(this.project,".local"),config.vault);
      await this.engine.load(false);this.context=new ContextTracker(this.app,port,config.vault);
      // UI failures go to a local log; screen capture is not always available for diagnosis.
      const logged=new Set<string>();
      const report=(where:string,error:unknown)=>{
        const message=error instanceof Error?error.stack??error.message:String(error);
        console.error(`Obsidian Context MCP (${where})`,error);
        if(logged.has(where+message))return;logged.add(where+message);
        void fs.appendFile(path.join(this.project,".local","ui-errors.log"),`${new Date().toISOString()} [${where}] ${message}\n`).catch(()=>{});
      };
      this.inline=new InlineReview(this.app,this.engine,()=>this.context.pauseForReview(),()=>this.context.last?.path??null,report);
      this.registerEditorExtension(this.inline.extension());
      this.addCommand({id:"show-review-bar",name:"显示当前笔记的审阅栏",checkCallback:checking=>this.inline?.showActive(checking)??false});
      this.addCommand({id:"accept-all-active",name:"接受当前提案的全部候选",checkCallback:checking=>this.inline?.decideActive("accepted",checking)??false});
      this.addCommand({id:"reject-all-active",name:"拒绝当前提案的全部候选",checkCallback:checking=>this.inline?.decideActive("rejected",checking)??false});
      this.engine.onChange=()=>this.inline?.refresh();
      const resumeContext=(event:Event)=>{const target=event.target;if(target instanceof Element&&!target.closest(".ocm-inline-block, .ocm-inline-toolbar"))this.context.resumeForUserEdit();};
      this.registerDomEvent(document,"pointerdown",resumeContext,true);
      this.registerDomEvent(document,"keydown",resumeContext,true);
      this.registerEditorExtension(EditorView.updateListener.of(update=>{
        if(update.docChanged||update.selectionSet){const info=update.state.field(editorInfoField,false);if(info&&document.hasFocus())this.context.capture(info);if(update.docChanged&&info?.file)void this.engine.invalidate(info.file.path);}
      }));
      this.registerEvent(this.app.workspace.on("active-leaf-change",()=>this.context.captureLeaf()));
      this.registerEvent(this.app.workspace.on("editor-change",(_,info)=>{this.context.capture(info);if(info.file)void this.engine.invalidate(info.file.path);}));
      this.registerEvent(this.app.vault.on("modify",f=>void this.engine.invalidate(f.path)));
      this.registerEvent(this.app.vault.on("delete",f=>void this.engine.invalidate(f.path)));
      this.registerEvent(this.app.vault.on("rename",(f,old)=>{void this.engine.invalidate(old);this.context.captureLeaf();}));
      this.registerDomEvent(document,"selectionchange",()=>this.context.captureReadingSelection(document));
      this.registerDomEvent(window,"blur",()=>this.context.captureLeaf());
      // Vault/editor hydration completes after plugin onload; preflight sooner
      // falsely treats restored files as missing. Do not await layout in onload.
      this.app.workspace.onLayoutReady(()=>{void (async()=>{
        this.app.workspace.detachLeavesOfType(LEGACY_REVIEW_VIEW);
        await this.engine.validatePending();this.context.captureLeaf();
        const service=new PluginService(port,this.engine,n=>this.context.get(n));
        const runtime=await startPluginServer(path.join(this.project,".local"),config.vault,root,async(name,args)=>{
          const result=await service.call(name,args);
          if(name==="obsidian_propose_changes"&&"proposal_id" in result)void this.announceProposal(String(result.proposal_id)).catch(e=>new Notice(`无法打开审阅：${(e as Error).message}`,8000));
          return result;
        });
        this.stop=runtime.close;this.connected=true;const status=this.addStatusBarItem();status.setText("笔记 MCP 已连接");status.onclick=()=>this.openReview();
      })().catch(e=>{new Notice(`笔记 MCP 未连接：${e.message}`,10000);console.error("Obsidian Context MCP",e);});});
    }catch(e){new Notice(`笔记 MCP 未连接：${(e as Error).message}`,10000);console.error("Obsidian Context MCP",e);}
  }
  async openReview(id?:string){if(!this.engine){new Notice("请先检查笔记 MCP 的项目配置。");return;}await this.inline?.open(id);}
  async announceProposal(id:string){await this.inline?.announce(id);}
  onunload(){this.connected=false;this.inline?.close();if(this.stop)void this.stop();}
}
class ContextSettings extends PluginSettingTab {
  constructor(app:App,public plugin:ContextPlugin){super(app,plugin);}
  display(){const el=this.containerEl;el.empty();el.createEl("h2",{text:"Obsidian Context MCP"});new Setting(el).setName("连接状态").setDesc(this.plugin.connected?"笔记仓库已连接":"未连接");new Setting(el).setName("本机项目目录").addText(t=>t.setValue(this.plugin.project).onChange(value=>{this.app.saveLocalStorage("obsidian-context-mcp.project",value);}));new Setting(el).setName("候选修改").addButton(b=>b.setButtonText("打开审阅").onClick(()=>this.plugin.openReview()));}
}
