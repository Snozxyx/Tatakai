import {expect,test} from 'bun:test';
import {mergeChaptersWithExtensions} from '../src/core/content/manga-extension-runtime';
const source=(key:string,provider='mangadex')=>({provider,chapterKey:key,providerChapterId:key,language:'en',scanlator:'Group',releaseDate:null});
test('MangaDex answers retain every working provider and alternate release identity',()=>{
 const result=mergeChaptersWithExtensions({anilistId:42,partial:false,failedProviders:[],chapters:[],mappedChapters:[{chapterNumber:1,chapterTitle:'Real chapter title',volume:1,canonicalOrder:0,sources:[source('md-a')]}]},
  {chapters:[{number:1,title:'Chapter 1',sources:[source('md-b'),source('pill','mangapill')]},{number:2,title:'Next title',sources:[source('katana','mangakatana')]}],providersAvailable:['toko'],failedProviders:[]});
 expect(result.mappedChapters[0].sources.map(s=>s.chapterKey)).toEqual(['md-b','pill','md-a']);
 expect(result.mappedChapters[0].chapterTitle).toBe('Real chapter title');
 expect(result.mappedChapters[1].sources[0].provider).toBe('mangakatana');
});
