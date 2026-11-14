import { test, expect } from "bun:test";
import { textFrame, resizeFrame, clampFrame } from "../src/core/translate/geometry";

test("drawing small OCR regions preserves their size and clamps them inside a page",()=>{
  expect(textFrame({x:90,y:95},{x:80,y:88},100,100)).toEqual({x:80,y:88,width:10,height:7});
  expect(textFrame({x:98,y:99},{x:98,y:99},100,100)).toEqual({x:98,y:99,width:2,height:1});
  expect(clampFrame({x:-10,y:90,width:30,height:30},100,100)).toEqual({x:0,y:90,width:20,height:10});
});
test("resizing a rotated frame leaves the opposite corner anchored",()=>{
  const f={x:30,y:40,width:80,height:60,rotation:90};
  const resized=resizeFrame(f,"se",-20,30);
  expect(resized.width).toBeCloseTo(110);expect(resized.height).toBeCloseTo(80);
  const anchor=(r:typeof resized)=>({x:r.x+r.width/2+r.height/2,y:r.y+r.height/2-r.width/2});
  expect(anchor(resized).x).toBeCloseTo(anchor(f).x);expect(anchor(resized).y).toBeCloseTo(anchor(f).y);
  expect(resizeFrame(f,"nw",1000,1000).width).toBeGreaterThanOrEqual(1);
});
