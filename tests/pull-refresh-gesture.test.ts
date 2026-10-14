import {test,expect} from 'bun:test';
import {PullRefreshGesture} from '../src/components/mobile/pull-refresh-gesture';

test('refresh requires a deliberate downward pull at the top and fires once',()=> {
  const gesture=new PullRefreshGesture();gesture.begin(10,10,true,false);
  expect(gesture.move(11,90)).toBeLessThan(56);expect(gesture.finish()).toBe(false);
  gesture.begin(10,10,true,false);expect(gesture.move(12,140)).toBeGreaterThanOrEqual(56);
  expect(gesture.finish()).toBe(true);expect(gesture.finish()).toBe(false);
});
test('scrolling, controls, horizontal swipes, upward swipes and multitouch never refresh',()=> {
  for(const [atTop,blocked,x,y,touches] of [[false,false,10,200,1],[true,true,10,200,1],[true,false,200,20,1],[true,false,10,-20,1],[true,false,10,200,2]] as const){
    const gesture=new PullRefreshGesture();gesture.begin(10,10,atTop,blocked);gesture.move(x,y,touches);expect(gesture.finish()).toBe(false);
  }
});
