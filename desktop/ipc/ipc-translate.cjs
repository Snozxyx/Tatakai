"use strict";
const {
  TranslationEngine,
  engineOptions,
} = require("../runtime/translate/supervisor.cjs");

module.exports = function registerTranslation({
  ipcMain,
  app,
  dialog,
  getMainWindow,
}) {
  const engine = new TranslationEngine(engineOptions(app));
  const {LocalModel}=require('../runtime/translate/local-model.cjs');
  const localModel=new LocalModel(require('node:path').join(app.getPath('userData'),'translate-runtimes'),message=>{const window=getMainWindow();if(window&&!window.isDestroyed())window.webContents.send('translate:event',{event:'progress',pageId:'',stage:'model',message});});
  const {OfflinePack}=require('../runtime/translate/offline-model-manager.cjs');
  const nodePath=require('node:path');
  const offlinePack=new OfflinePack(nodePath.join(app.getPath('userData'),'yomi-models'),nodePath.join(app.getPath('userData'),'translate-runtimes'),localModel,message=>{
    const window=getMainWindow();if(window&&!window.isDestroyed())window.webContents.send('translate:event',{event:'progress',pageId:'',stage:'model',message});
  });
  const ensureOffline=async(command,args)=>{
    const settings=await engine.request('settings');
    if(!settings.offlineOnly)return;
    const stages=Array.isArray(args?.stages)?args.stages:[];
    const usesManaged=command==='assistant'?settings.translationProvider==='tatakai-local':
      ((stages.some(s=>s==='detect'||s==='ocr')&&settings.visionProvider==='tatakai-local')||(stages.includes('translate')&&settings.translationProvider==='tatakai-local'));
    if(!usesManaged)return; // Native policy rejects external providers.
    const connection=localModel.connection||await offlinePack.load();
    if(stages.some(s=>s==='detect'||s==='ocr')&&!connection.vision)throw Error('The loaded model cannot read images. Unload it and load an offline vision model.');
    await engine.request('attachLocalModel',connection);
  };
  engine.on("event", (message) => {
    const window = getMainWindow();
    if (window && !window.isDestroyed())
      window.webContents.send("translate:event", message);
  });
  const commands = new Set([
    "list",
    "create",
    "open",
    "close",
    "delete",
    "status",
    "resources",
    "commit",
    "undo",
    "redo",
    "render",
    "stroke",
    "settings",
    "saveSettings",
    "setKey",
    "process",
    "assistant",
    "cancel",
  ]);
  const checkSender = (event) => {
    const window = getMainWindow();
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error(
        "Translation is available only in the main Tatakai window."
      );
  };
  ipcMain.handle("translate:request", async (event, payload) => {
    checkSender(event);
    if (
      !payload ||
      typeof payload.command !== "string" ||
      !commands.has(payload.command)
    )
      throw new Error("Unsupported translation request.");
    if(payload.command==='cancel')offlinePack.cancel();
    if(payload.command==='process'||payload.command==='assistant')await ensureOffline(payload.command,payload.args||{});
    return engine.request(payload.command, payload.args || {});
  });
  ipcMain.handle(
    "translate:import",
    async (event, { revision, folder = false }) => {
      checkSender(event);
      const result = await dialog.showOpenDialog(getMainWindow(), {
        title: "Import manga pages",
        properties: folder
          ? ["openDirectory"]
          : ["openFile", "multiSelections"],
        filters: folder
          ? undefined
          : [
              {
                name: "Manga pages",
                extensions: [
                  "png",
                  "jpg",
                  "jpeg",
                  "webp",
                  "gif",
                  "bmp",
                  "zip",
                  "cbz",
                  "rar",
                  "pdf",
                ],
              },
            ],
      });
      if (result.canceled) return null;
      return engine.request("import", { paths: result.filePaths, revision });
    }
  );
  ipcMain.handle("translate:export", async (event, args) => {
    checkSender(event);
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: "Export translated pages",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return null;
    if (args.format==='psd') return require('../runtime/translate/psd.cjs').exportPsd(engine,{revision:args.revision,pageIds:args.pageIds,path:result.filePaths[0]});
    return engine.request("export", {
      revision: args.revision,
      pageIds: args.pageIds,
      format: args.format,
      path: result.filePaths[0],
    });
  });
  ipcMain.handle('translate:restore', async event => {
    checkSender(event);
    const result=await dialog.showOpenDialog(getMainWindow(),{title:'Open portable translation project',properties:['openFile'],filters:[{name:'Tatakai project backup',extensions:['zip']}]});
    if(result.canceled)return null;
    return engine.request('restore',{path:result.filePaths[0]});
  });
  ipcMain.handle('translate:font',async(event,{revision})=>{
    checkSender(event);
    const result=await dialog.showOpenDialog(getMainWindow(),{title:'Add a project font',properties:['openFile'],filters:[{name:'Font files',extensions:['ttf','otf','ttc']}]});
    if(result.canceled)return null;
    return engine.request('importFont',{path:result.filePaths[0],revision});
  });
  ipcMain.handle("translate:backup", async (event) => {
    checkSender(event);
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: "Back up translation project",
      defaultPath: "translation.tatakaiproj.zip",
      filters: [{ name: "Portable Tatakai project", extensions: ["zip"] }],
    });
    if (result.canceled || !result.filePath) return null;
    return engine.request("backup", { path: result.filePath });
  });
  ipcMain.handle("translate:chapter", async (event, args) => {
    checkSender(event);
    const path = require("node:path");
    const { resolveChapter } = require("../runtime/translate/reader.cjs");
    const root = path.join(
      typeof args.customRoot === "string" && args.customRoot.trim()
        ? args.customRoot.trim()
        : path.join(app.getPath("videos"), "Tatakai"),
      "Manga"
    );
    const chapter = resolveChapter(root, args.anilistId, args.chapterKey);
    if (!chapter) return { success: false, reason: "download_required" };
    const state = await engine.request("status");
    if (state.busy)
      throw new Error(
        "Stop the active translation job before importing another chapter."
      );
    const project = await engine.request("create", {
      name: `${chapter.title} — ${args.chapterLabel || "Chapter"}`.slice(
        0,
        200
      ),
      credit: args.credit,
      targetLanguage: args.targetLanguage || "en",
      mapping: {
        mangaId: String(args.anilistId),
        chapterId: args.chapterKey,
        sourceId: chapter.source,
        title: chapter.title,
      },
    });
    const imported = await engine.request("import", {
      paths: chapter.paths,
      revision: project.revision,
    });
    return { success: true, project: imported };
  });
  ipcMain.handle('translate:offline-status',async event=>{checkSender(event);return {...await offlinePack.status(),...localModel.status()};});
  ipcMain.handle('translate:offline-cancel',event=>{checkSender(event);offlinePack.cancel();return {stopping:true};});
  ipcMain.handle('translate:offline-setup',async(event,{download=false}={})=>{
    checkSender(event);if((await engine.request('status')).busy)throw Error('Stop processing before setting up offline models.');
    if(localModel.status().running)throw Error('Unload the current model before setting up the offline model.');
    if(download)await offlinePack.install();
    const connection=await offlinePack.load();
    try{
      await engine.request('attachLocalModel',connection);
      const settings=await engine.request('settings');
      await engine.request('saveSettings',{settings:{...settings,offlineOnly:true}});
      return {...await offlinePack.status(),...localModel.status()};
    }catch(error){localModel.stop();throw error;}
  });
  ipcMain.handle('translate:model-status',event=>{checkSender(event);return localModel.status();});
  ipcMain.handle('translate:model-start',async(event,{vision=false}={})=>{
    checkSender(event);if((await engine.request('status')).busy)throw Error('Stop processing before loading another model.');
    const result=await dialog.showOpenDialog(getMainWindow(),{title:'Choose a local GGUF model',properties:['openFile'],filters:[{name:'GGUF model',extensions:['gguf']}]});if(result.canceled)return null;
    let projection;
    if(vision){const selected=await dialog.showOpenDialog(getMainWindow(),{title:'Choose the model’s vision projection',properties:['openFile'],filters:[{name:'GGUF vision projection',extensions:['gguf']}]});if(selected.canceled)return null;projection=selected.filePaths[0];}
    try{const connection=await localModel.start(result.filePaths[0],projection,{offline:(await engine.request('settings')).offlineOnly===true});await engine.request('attachLocalModel',connection);return localModel.status();}catch(error){localModel.stop();throw error;}
  });
  ipcMain.handle('translate:model-stop',async event=>{checkSender(event);if((await engine.request('status')).busy)throw Error('Stop processing before unloading the model.');localModel.stop();await engine.request('detachLocalModel');return localModel.status();});
  app.once("before-quit", () => {offlinePack.cancel();localModel.stop();engine.stop();});
  return engine;
};
