const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { DOMParser } = require('linkedom');
const repo = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(repo, relative), 'utf8');
const xml = relative => new DOMParser().parseFromString(read(relative), 'application/xml');

test('actual Android branding plugin switches safely and restores failed changes', () => {
  const javaHome = process.env.JAVA_HOME;
  assert.ok(javaHome, 'JAVA_HOME is required to validate production Android methods');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tatakai-native-branding-'));
  const stubs = {
    'android/content/ComponentName.java': `package android.content; public record ComponentName(String packageName,String className) { public String getClassName(){return className;} }`,
    'android/content/SharedPreferences.java': `package android.content; public interface SharedPreferences { String getString(String key,String fallback); Editor edit(); interface Editor { Editor putString(String key,String value); boolean commit(); } }`,
    'android/content/Context.java': `package android.content; import android.content.pm.PackageManager; import java.util.*; public class Context {
      public final PackageManager pm=new PackageManager(); public final Prefs prefs=new Prefs();
      public String getPackageName(){return "app.tatakai.me";} public PackageManager getPackageManager(){return pm;} public SharedPreferences getSharedPreferences(String name,int mode){return prefs;}
      public static class Prefs implements SharedPreferences { public Map<String,String> values=new HashMap<>(); public boolean failNext;
        public String getString(String key,String fallback){return values.getOrDefault(key,fallback);} public Editor edit(){return new Editor(){ Map<String,String> patch=new HashMap<>(); public Editor putString(String k,String v){patch.put(k,v);return this;} public boolean commit(){values.putAll(patch); boolean result=!failNext;failNext=false;return result;} };}
      } }`,
    'android/content/pm/PackageManager.java': `package android.content.pm; import android.content.ComponentName; import java.util.*; public class PackageManager {
      public static final int COMPONENT_ENABLED_STATE_DEFAULT=0,COMPONENT_ENABLED_STATE_ENABLED=1,COMPONENT_ENABLED_STATE_DISABLED=2,DONT_KILL_APP=1;
      public final Map<ComponentName,Integer> states=new LinkedHashMap<>(); public final List<ComponentName> operations=new ArrayList<>(); public int batches, failAt;
      public int getComponentEnabledSetting(ComponentName c){return states.getOrDefault(c,0);}
      public boolean active(ComponentName c){int s=getComponentEnabledSetting(c);return s==1 || (s==0 && c.className().endsWith("$Dark"));}
      public void setComponentEnabledSetting(ComponentName c,int s,int flags){if(!c.className().contains(".branding.LauncherActivity$"))throw new AssertionError("MainActivity was modified"); if(flags!=DONT_KILL_APP)throw new AssertionError("App would be killed"); operations.add(c); if(failAt==operations.size()){failAt=0;throw new IllegalStateException("launcher rejected update");}states.put(c,s);}
      public record ComponentEnabledSetting(ComponentName componentName,int enabledState,int flags){}
      public void setComponentEnabledSettings(List<ComponentEnabledSetting> changes){batches++;for(var c:changes)setComponentEnabledSetting(c.componentName(),c.enabledState(),c.flags());}
    }`,
    'android/content/Intent.java': `package android.content; public class Intent { public static final int FLAG_ACTIVITY_NEW_TASK=1,FLAG_ACTIVITY_CLEAR_TOP=2; public Class<?> target; public int flags; public Intent(Object context,Class<?> target){this.target=target;} public void addFlags(int flags){this.flags|=flags;} }`,
    'android/app/Activity.java': `package android.app; import android.content.*; import android.os.Bundle; public class Activity extends Context { public Intent launched;public boolean finished; public void runOnUiThread(Runnable task){task.run();} public void onCreate(Bundle state){} public void startActivity(Intent intent){launched=intent;} public void finish(){finished=true;} }`,
    'android/os/Build.java': `package android.os; public class Build { public static class VERSION {public static int SDK_INT=32;} }`,
    'android/os/Bundle.java': `package android.os; public class Bundle {}`,
    'com/getcapacitor/Plugin.java': `package com.getcapacitor; import android.app.Activity; public class Plugin {public final Activity activity=new Activity(); public Activity getActivity(){return activity;} public Activity getContext(){return activity;} }`,
    'com/getcapacitor/JSObject.java': `package com.getcapacitor; public class JSObject extends java.util.HashMap<String,Object> {}`,
    'com/getcapacitor/JSArray.java': `package com.getcapacitor; public class JSArray extends java.util.ArrayList<Object> {public void put(Object value){add(value);} }`,
    'com/getcapacitor/PluginCall.java': `package com.getcapacitor; public class PluginCall { public java.util.Map<String,String> args=new java.util.HashMap<>();public JSObject result;public String error;public String getString(String key,String fallback){return args.getOrDefault(key,fallback);}public void resolve(JSObject value){result=value;}public void reject(String message,String code){error=code;} }`,
    'com/getcapacitor/PluginMethod.java': `package com.getcapacitor; public @interface PluginMethod {}`,
    'com/getcapacitor/annotation/CapacitorPlugin.java': `package com.getcapacitor.annotation; public @interface CapacitorPlugin {String name();}`,
    'app/tatakai/me/MainActivity.java': `package app.tatakai.me; public class MainActivity extends android.app.Activity {}`,
    'BrandingHarness.java': `import app.tatakai.me.branding.*;import android.content.*;import android.content.pm.*;import android.os.*;import com.getcapacitor.*;import java.util.*;
      public class BrandingHarness {
        static final String[] variants={"dark","light","monochrome","legacy"};
        static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
        static ComponentName component(String v){return new ComponentName("app.tatakai.me","app.tatakai.me.branding.LauncherActivity$"+v.substring(0,1).toUpperCase(Locale.ROOT)+v.substring(1));}
        static PluginCall set(TatakaiBrandingPlugin p,String mode,String resolved){PluginCall c=new PluginCall();c.args.put("mode",mode);if(resolved!=null)c.args.put("resolvedVariant",resolved);p.setSelection(c);return c;}
        static PluginCall selection(TatakaiBrandingPlugin p){PluginCall c=new PluginCall();p.getSelection(c);return c;}
        static void one(TatakaiBrandingPlugin p,String target){int n=0;for(String v:variants)if(p.activity.pm.active(component(v)))n++;check(n==1,"expected exactly one launcher");check(p.activity.pm.active(component(target)),"wrong active launcher");}
        public static void main(String[] args){
          for(int sdk:new int[]{32,33}){Build.VERSION.SDK_INT=sdk;TatakaiBrandingPlugin p=new TatakaiBrandingPlugin();one(p,"dark");
            check("INVALID_ICON".equals(set(p,"invalid",null).error),"invalid mode accepted");check("INVALID_ICON".equals(set(p,"auto","invalid").error),"invalid resolved variant accepted");check(p.activity.pm.operations.isEmpty(),"invalid mode changed launcher");
            for(String from:variants){check(Boolean.TRUE.equals(set(p,from,null).result.get("success")),"could not select source");for(String to:variants){int before=p.activity.pm.operations.size();check(Boolean.TRUE.equals(set(p,to,null).result.get("success")),"transition failed");one(p,to);if(sdk<33)check(p.activity.pm.operations.get(before).equals(component(to)),"target must enable before another launcher disables");set(p,from,null);}}
            check(Boolean.TRUE.equals(set(p,"auto","light").result.get("success")),"automatic resolved mode failed");one(p,"light");check("auto".equals(selection(p).result.get("mode")),"automatic mode lost");check(sdk<33?p.activity.pm.batches==0:p.activity.pm.batches>0,"wrong API switching path");
            set(p,"legacy",null);Map<ComponentName,Integer> previous=new LinkedHashMap<>(p.activity.pm.states);p.activity.pm.failAt=p.activity.pm.operations.size()+2;
            check(Boolean.FALSE.equals(set(p,"dark",null).result.get("success")),"launcher error reported success");check(previous.equals(p.activity.pm.states),"component rollback lost original state");one(p,"legacy");
            p.activity.prefs.failNext=true;check(Boolean.FALSE.equals(set(p,"light",null).result.get("success")),"preference failure reported success");one(p,"legacy");check("legacy".equals(selection(p).result.get("mode")),"failed commit changed saved mode");
          }
          for(LauncherActivity p:new LauncherActivity[]{new LauncherActivity.Dark(),new LauncherActivity.Light(),new LauncherActivity.Monochrome(),new LauncherActivity.Legacy()}){p.onCreate(new Bundle());check(p.finished,"launcher did not finish");check(p.launched.target==app.tatakai.me.MainActivity.class,"launcher destination changed");check(p.launched.flags==(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP),"launcher flags changed");}
          System.out.println("Android branding transitions and rollback verified");
        }
      }`,
  };
  try {
    const files = Object.entries(stubs).map(([name, source]) => { const target = path.join(directory, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, source); return target; });
    files.push(path.join(repo, 'android/app/src/main/java/app/tatakai/me/branding/TatakaiBrandingPlugin.java'), path.join(repo, 'android/app/src/main/java/app/tatakai/me/branding/LauncherActivity.java'));
    const compile = spawnSync(path.join(javaHome, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac'), ['-d', directory, ...files], { encoding: 'utf8', timeout: 30000 });
    assert.equal(compile.status, 0, compile.stderr || compile.error?.message);
    const run = spawnSync(path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'), ['-cp', directory, 'BrandingHarness'], { encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 0, run.stderr || run.error?.message);
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'tatakai-native-branding-')));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Android and TV manifests keep deep links while registering all selectable icon resources', () => {
  const manifest = xml('android/app/src/main/AndroidManifest.xml');
  const tv = xml('android/app/src/tv/AndroidManifest.xml');
  const activities = [...manifest.querySelectorAll('activity')];
  const main = activities.find(entry => entry.getAttribute('android:name') === '.MainActivity');
  assert.equal(main.querySelector('data').getAttribute('android:scheme'), 'tatakai');
  assert.equal([...main.querySelectorAll('category')].some(entry => entry.getAttribute('android:name').endsWith('LAUNCHER')), false);
  for (const [variant, suffix] of [['dark', 'Dark'], ['light', 'Light'], ['monochrome', 'Monochrome'], ['legacy', 'Legacy']]) {
    const name = `.branding.LauncherActivity$${suffix}`;
    const entry = activities.find(entry => entry.getAttribute('android:name') === name);
    assert.ok(entry, name); assert.equal(entry.getAttribute('android:enabled'), variant === 'dark' ? 'true' : 'false'); assert.equal(entry.getAttribute('android:exported'), 'true');
    assert.equal(entry.getAttribute('android:icon'), `@mipmap/ic_launcher_${variant}`);
    assert.ok(fs.existsSync(path.join(repo, `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_${variant}.png`)));
    const tvEntry = [...tv.querySelectorAll('activity')].find(entry => entry.getAttribute('android:name') === name);
    assert.equal(tvEntry.getAttribute('android:banner'), `@drawable/tv_banner_${variant}`);
    const banner = fs.readFileSync(path.join(repo, `android/app/src/tv/res/drawable/tv_banner_${variant}.png`));
    assert.equal(banner.readUInt32BE(16) * 9, banner.readUInt32BE(20) * 16);
  }
});

test('Xcode includes the native plugin and every alternate and automatic icon appearance', () => {
  const project = require('xcode').project(path.join(repo, 'ios/App/App.xcodeproj/project.pbxproj')); project.parseSync();
  const objects = project.hash.project.objects;
  const phases = Object.values(objects.PBXSourcesBuildPhase).filter(value => value && typeof value === 'object');
  assert.ok(phases.some(phase => phase.files.some(file => objects.PBXFileReference[objects.PBXBuildFile[file.value].fileRef]?.path === 'TatakaiBrandingPlugin.swift')));
  const configurations = Object.values(objects.XCBuildConfiguration).filter(value => value && typeof value === 'object' && value.buildSettings?.ASSETCATALOG_COMPILER_APPICON_NAME === 'AppIcon');
  assert.equal(configurations.length, 2);
  for (const config of configurations) for (const name of ['AppIconLight', 'AppIconDark', 'AppIconMonochrome', 'AppIconLegacy']) assert.ok(config.buildSettings.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES.includes(name));
  for (const name of ['AppIcon', 'AppIconLight', 'AppIconDark', 'AppIconMonochrome', 'AppIconLegacy']) {
    const folder = `ios/App/App/Assets.xcassets/${name}.appiconset`;
    const config = JSON.parse(read(`${folder}/Contents.json`));
    for (const image of config.images) { const bytes = fs.readFileSync(path.join(repo, folder, image.filename)); assert.equal(bytes.readUInt32BE(16), 1024); assert.equal(bytes.readUInt32BE(20), 1024); }
    if (name === 'AppIcon') assert.deepEqual(config.images.map(image => image.appearances?.[0]?.value ?? 'any'), ['any', 'dark', 'tinted']);
  }
});
