// Real custom pages, grouped toolbar and catalogue/link persistence. Device and external services are fixtures.
import { createServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import { chromium } from "playwright";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
const root = path.resolve(".cache/custom-provider-ui");
await mkdir(root, { recursive: true });
await writeFile(
  path.join(root, "auth.ts"),
  `export const useAuth=()=>({user:null,profile:null,isAdmin:false,isBanned:false,isLoading:false,signOut:async()=>{}});`
);
await writeFile(
  path.join(root, "layout.tsx"),
  `export const Header=()=>null;export const Sidebar=()=>null;export const MobileNav=()=>null;`
);
await writeFile(
  path.join(root, "comments.tsx"),
  `export const Comments=p=><div data-comments-id={p.entityId}>Shared {p.entityType} comments: {p.entityId}</div>;`
);
await writeFile(
  path.join(root, "index.html"),
  '<html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>'
);
await writeFile(
  path.join(root, "main.tsx"),
  `import React from 'react';import{createRoot}from 'react-dom/client';import{MemoryRouter,Routes,Route,useLocation,useNavigate}from 'react-router-dom';import{QueryClient,QueryClientProvider}from '@tanstack/react-query';
import{HelmetProvider}from'react-helmet-async';import{SettingsModalProvider}from'/src/contexts/SettingsModalContext.tsx';import{getPreferredTitleLanguage}from'/src/lib/titleLanguage.ts';import Directory from'/src/pages/custom/CustomProvidersPage.tsx';import Home from '/src/pages/custom/CustomHomePage.tsx';import Info from '/src/pages/custom/CustomInfoPage.tsx';import{updateExtensionLibrary}from '/src/core/extensions/compatibility/library.ts';import{db}from '/src/core/db/tatakai-db.ts';import '/src/index.css';
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});window.testClient=client;window.testDb=db;
client.setQueryData(['custom-sources'],window.fixtureSources.filter(s=>s.enabled!==false));
client.setQueryData(['custom-provider-inventory'],window.fixtureSources);
client.setQueryData(['anime','20',getPreferredTitleLanguage()],{info:{id:'20',name:'Naruto',poster:window.cover,description:'Naruto Uzumaki, a spirited young ninja from the Hidden Leaf Village, dreams of becoming Hokage. Together with Sasuke and Sakura, he trains under Kakashi and discovers what it means to protect the people he cares about.',stats:{rating:'PG-13',quality:'HD',episodes:{sub:220,dub:220},type:'TV',duration:'23 min'},promotionalVideos:[],characterVoiceActor:[]},moreInfo:{anilistId:20,malId:20,titleRomaji:'Naruto',titleNative:'NARUTO -ナルト-',titleAliases:['Naruto','NARUTO -ナルト-'],aired:'Oct 3, 2002',genres:['Action','Adventure','Comedy'],status:'Finished Airing',studios:'Studio Pierrot',duration:'23 min',relations:[],staff:[],externalLinks:[],averageScore:79,episodesTotal:220,formatRaw:'TV',statusRaw:'FINISHED',season:'FALL',seasonYear:2002,source:'MANGA',bannerImage:window.banner}});

await updateExtensionLibrary('guest',{namespace:'compat-aniyomi',sourceId:'original-en',id:'original-title',title:'Naruto',kind:'watch',sourceName:'Fixture provider',image:'/placeholder.svg',catalog:[{id:'entry-1',label:'Episode 1',number:1}]},{progress:{id:'entry-1',label:'Episode 1',position:30,duration:120,completed:false,updatedAt:new Date().toISOString()}});
await updateExtensionLibrary('guest',{namespace:'compat-mihon',sourceId:'manga-en',id:'read-title',title:'Reading fixture',kind:'read',sourceName:'Manga provider',catalog:[{id:'chapter-1',label:'Chapter 1',number:1}]},{progress:{id:'chapter-1',label:'Chapter 1',position:4,duration:20,completed:false,updatedAt:new Date().toISOString()}});
function Location(){const location=useLocation();window.fixtureNavigate=useNavigate();return <><a href='#' data-directory onClick={e=>{e.preventDefault();window.fixtureNavigate('/custom-providers')}}>All providers</a><output data-route>{location.pathname+location.search}</output></>};
createRoot(document.getElementById('root')).render(<HelmetProvider><QueryClientProvider client={client}><SettingsModalProvider><MemoryRouter initialEntries={['/x/compat-aniyomi/original-en']}><Routes><Route path="/custom-providers" element={<Directory/>}/><Route path="/x/:namespace/:sourceId" element={<Home/>}/><Route path="/x/:namespace/:sourceId/info/:id" element={<Info/>}/><Route path="/x/:namespace/:sourceId/watch/:id/:entry" element={<p>Exact extension playback route</p>}/><Route path="/x/:namespace/:sourceId/read/:id/:entry" element={<p>Exact extension reader route</p>}/></Routes><Location/></MemoryRouter></SettingsModalProvider></QueryClientProvider></HelmetProvider>);`
);
function fixture() {
  window.cover='https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20-dE6UHbFFg1A5.jpg';
  window.banner='https://s4.anilist.co/file/anilistcdn/media/anime/banner/20-HHxhPj5JD13a.jpg';
  const source = (id, lang, namespace = "compat-aniyomi") => ({
    namespace,
    id,
    extensionId: "pkg",
    providerGroup: namespace + "/pkg/provider",
    name: namespace === "compat-mihon" ? "Manga provider" : "Fixture provider",
    language: lang,
    kind: namespace === "compat-mihon" ? "read" : "watch",
    catalogMediaType: namespace === "compat-mihon" ? "manga" : "anime",
    enabled: namespace !== "compat-mihon",
  });
  window.fixtureSources = [
    source("original-en", "en"),
    source("original-fr", "fr"),
    source("manga-en", "en", "compat-mihon"),
  ];
  window.calls = [];
  window.electron = {
    compatibilityRequest: async (p) => {
      window.calls.push(p);
      let result;
      if (p.op === "cancel") return { ok: true };
      if (p.op === "sources")
        result = window.fixtureSources
          .filter(
            (s) => !p.ecosystem || s.namespace === "compat-" + p.ecosystem
          )
          .map((s) => ({
            ...s,
            enabled: s.enabled !== false,
            ecosystem: s.namespace.slice(7),
            packageId: "pkg",
            upstreamId: s.id,
            repository: "https://fixture.invalid/repo.json",
            extensionName: "Fixture package",
            lang: s.language,
          }));
      else if (p.op === "setEnabled") { window.fixtureSources.find(s=>s.id===p.sourceId).enabled=p.enabled; result=true; }
      else if (p.op === "status")
        result = {
          platform: "win32",
          runtimes: [{ ecosystem: "aniyomi", authentication: false }],
        };
      else if (p.op === "preferences")
        result = [
          {
            position: 0,
            title: "Trim title",
            kind: "boolean",
            value: false,
            visible: true,
            enabled: s.enabled !== false,
            options: [],
          },
        ];
      else if (p.op === "browse" || p.op === "search") {
        if (p.query === "failure")
          return { ok: false, error: "Fixture HTTP 503" };
        result = {
          results: [
            {
              id: "original-title",
              title: p.query === "noart" ? "Collection without artwork" : p.page === 2 ? "Second page title" : "Naruto",
              image: window.cover,
            },
          ],
          hasNextPage: p.page !== 2,
        };
      } else if (p.op === "info")
        result = {
          id: "original-title",
          title: "Naruto",
          image: window.cover,
          description:
            "Naruto Uzumaki dreams of becoming Hokage. Follow his adventures in the Hidden Leaf Village.",
          meta: { Status: "Finished", Genres: "Action, Adventure" },
          entries: Array.from({ length: 125 }, (_, i) => ({
            id: "entry-" + (i + 1),
            label: "Episode " + (i + 1),
            number: i + 1,
          })),
        };
      else throw Error("Unexpected fixture operation " + p.op);
      return { ok: true, result };
    },
  };
}
const aliases = [
  { find: "@/contexts/AuthContext", replacement: path.join(root, "auth.ts") },
  ...["Sidebar", "MobileNav"].map((name) => ({
    find: "@/components/layout/" + name,
    replacement: path.join(root, "layout.tsx"),
  })),
  {
    find: "@/components/comments/Comments",
    replacement: path.join(root, "comments.tsx"),
  },
  { find: "@", replacement: path.resolve("src") },
  {
    find: "@tatakai/release-parser",
    replacement: path.resolve(
      "desktop/runtime/torrent/naming/release-parser.cjs"
    ),
  },
  {
    find: "@tatakai/candidate-scorer",
    replacement: path.resolve("src/core/download/candidate-scorer.cjs"),
  },
  {
    find: "@tatakai/candidate-evaluator",
    replacement: path.resolve("src/core/download/candidate-evaluator.cjs"),
  },
];
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  cacheDir: ".cache/custom-provider-vite",
  plugins: [react()],
  resolve: {
    alias: aliases,
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  optimizeDeps: { noDiscovery: true, include: ['react','react/jsx-runtime','react-dom/client','react-dom','react-router-dom','@tanstack/react-query','react-helmet-async','react-i18next','i18next','dexie','hls.js','js-cookie','dompurify','dayjs','lodash','prop-types','react-fast-compare','invariant'] },
  server: { host: "127.0.0.1", port: 19437, hmr: false },
});
let browser, page;
const errors = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(60000);
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("Page error:", error.message);
  });
  await page.addInitScript(fixture);
  await page.route("**/anilist/graphql", async (route) => {
    const body = route.request().postDataJSON();
    const media = {
      id: 20,
      idMal: 20,
      type: "ANIME",
      format: "TV",
      title: { romaji: "Naruto" },
      episodes: 220,
      startDate: { year: 2002 },
      coverImage: { large: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20-dE6UHbFFg1A5.jpg" },
      bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/20-HHxhPj5JD13a.jpg",
    };
    await route.fulfill({
      json: {
        data: body.query.includes("Page(")
          ? { Page: { media: [media] } }
          : { Media: media },
      },
    });
  });
  await page.route('**/rest/v1/**', route => route.fulfill({json:[]}));
  await page.route('**/api/v3/content/**', route => route.fulfill({json:{}}));
  await page.route('**/api/v3/anime/**', route => route.fulfill({json:{}}));
  await page.route('**/api/v3/preview/**', route => route.fulfill({status:404,json:{error:'No fixture preview'}}));
  await page.goto(
    "http://127.0.0.1:19437/.cache/custom-provider-ui/index.html",
    { waitUntil: "domcontentloaded", timeout: 180000 }
  );
  console.log("Checking provider home and header");
  await page.locator("[data-custom-hero]").waitFor();
  await page.getByText("Continue watching · Extensions").waitFor();
  await page.locator("summary").click();
  await page
    .getByRole("combobox", { name: "Provider language", exact: true })
    .click();
  await page.getByRole("option", { name: "French" }).click();
  await page.waitForFunction(() =>
    document.querySelector("[data-route]").textContent.includes("original-fr")
  );
  await page.locator("summary").click();
  await page
    .getByRole("combobox", { name: "Provider language", exact: true })
    .click();
  await page.getByRole("option", { name: "English" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Second page title", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.getByRole("textbox", { name: "Search provider" }).fill("Naruto");
  await page.getByRole("button", { name: "Submit provider search", exact: true }).click();
  await page.waitForFunction(() =>
    window.calls.some((p) => p.op === "search" && p.page === 1)
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Second page title", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Search provider" }).fill("failure");
  await page.getByRole("button", { name: "Submit provider search", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Fixture HTTP 503" })
    .waitFor();
  await page.getByRole("textbox", { name: "Search provider" }).fill("Naruto");
  await page.getByRole("button", { name: "Submit provider search", exact: true }).click();
  await page
    .getByRole("link", { name: /Naruto/ })
    .last()
    .click();
  await page.getByRole("heading", { name: "Naruto", exact: true }).waitFor();
  console.log("Checking automatic catalogue page");
  await page.getByText('Studio Pierrot', {exact:true}).waitFor();
  await page.locator('[data-comments-id="20"]').waitFor();
  await page.waitForFunction(async () => (await window.testDb.kv.toArray()).some(row=>row.key.startsWith('custom-catalog:') && JSON.parse(row.value).link?.verifiedBy==='title-match'));
  if (
    (await page.getByRole("button", { name: /^Mark completed:/ }).count()) !==
    60
  )
    throw Error("Entry list is not bounded to 60 rows");
  await page
    .getByRole("textbox", { name: "Filter episodes" })
    .fill("Episode 125");
  await page
    .getByRole("button", { name: "Mark completed: Episode 125", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mark unfinished: Episode 125", exact: true })
    .waitFor();
  await page.getByRole("textbox", { name: "Filter episodes" }).fill("");
  await page.getByRole("switch", { name: "Track completed episodes" }).click();
  await page.waitForFunction(async () => {
    const rows = await window.testDb.kv.toArray();
    return rows.some(
      (row) =>
        row.key.startsWith("custom-catalog:") &&
        JSON.parse(row.value).link?.syncEnabled
    );
  });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: ".cache/extension-feasibility/custom-info-desktop.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: ".cache/extension-feasibility/custom-info-mobile.png",
    fullPage: false,
  });
  if (
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1
    )
  )
    throw Error("Info page overflows phone viewport");
  await page.getByRole("button", { name: "Disconnect catalogue link" }).click();
  await page.waitForFunction(
    () => !document.querySelector("[data-linked-comments]")
  );
  if (await page.locator("[data-mapped-catalog-actions]").count())
    throw Error("Disconnected title kept mapped actions");
  await page.locator("summary").click();
  await page.getByRole("button", { name: "Source settings" }).click();
  await page.getByRole("dialog").waitFor();
  if (
    (await page
      .getByRole("switch")
      .evaluate((element) => element.getBoundingClientRect().width)) > 60
  )
    throw Error("Source preference switch is oversized");
  await page.keyboard.press("Escape");
  console.log('Checking provider directory and manga');
  await page.locator('[data-directory]').click();
  await page.getByRole('heading',{name:'Custom providers',exact:true}).waitFor();
  if(await page.locator('article').count()!==2) throw Error('Language variants were split in the directory');
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:'.cache/extension-feasibility/custom-provider-directory-desktop.png'});
  await page.getByRole('button',{name:/^Manga/}).click();
  await page.getByRole('heading',{name:'Manga provider',exact:true}).waitFor();
  await page.getByRole('button',{name:'Enable & browse'}).click();
  await page.getByText("Continue reading · Extensions").waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({
    path: ".cache/extension-feasibility/custom-home-mobile.png",
    fullPage: false,
  });
  if (
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1
    )
  )
    throw Error("Home page overflows phone viewport");
  await page.getByRole("link").filter({ hasText: "Reading fixture" }).click();
  await page.getByText("Exact extension reader route").waitFor();
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Custom provider UI passed: grouped language dispatch, browse/search pages, errors, 60-entry bounds, completion, automatic unique AniList mapping and full catalogue detail rendering, sync opt-in, disconnect, compact preferences, disabled manga discovery and enable, continue reading, and 390px/1280px layouts."
  );
} catch (error) {
  console.error("Custom provider UI failed:", error);
  if (page)
    console.error((await page.locator("body").innerText()).slice(-4500));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
