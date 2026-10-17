import {expect,test} from 'bun:test';
import {pickPrimaryAsset,applicationReleases,platformForAsset,platformKeyForName,type GitHubReleaseAsset,type GitHubRelease} from '../src/lib/github';
const asset=(name:string)=>({name,browser_download_url:'https://example.invalid/'+name,size:1,download_count:0,content_type:'application/vnd.android.package-archive'} as GitHubReleaseAsset);
test('mobile downloads never select the TV APK, regardless of GitHub asset order',()=>{
 const tv=asset('Tatakai-v6.2.0-android-tv.apk'),mobile=asset('Tatakai-v6.2.0-android.apk');
 expect(pickPrimaryAsset([tv,mobile],'android')).toBe(mobile);
 expect(pickPrimaryAsset([mobile,tv],'android')).toBe(mobile);
 expect(pickPrimaryAsset([tv],'android')).toBeUndefined();
 expect(platformForAsset(tv.name)).toBe('android-tv');
 expect(platformKeyForName('Android TV')).toBe('android-tv');
 expect(pickPrimaryAsset([mobile,tv],'android-tv')).toBe(tv);
 expect(pickPrimaryAsset([mobile],'android-tv')).toBeUndefined();
});
test('internal server build archives do not become application releases',()=>{
 const release=(tag_name:string)=>({tag_name,draft:false} as GitHubRelease);
 expect(applicationReleases([release('server-build-012345'),release('v6.2.0'),release('v6.1.2')]).map(r=>r.tag_name)).toEqual(['v6.2.0','v6.1.2']);
});
