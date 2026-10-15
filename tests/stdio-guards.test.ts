import {test,expect} from 'bun:test';
import {EventEmitter} from 'node:events';
const {installStdioGuards}=require('../desktop/services/stdio-guards.cjs');
test('closed launcher output pipes are harmless and other failures remain visible',()=>{
  const output=new EventEmitter();installStdioGuards([output]);installStdioGuards([output]);
  expect(output.listenerCount('error')).toBe(1);
  expect(()=>output.emit('error',Object.assign(new Error('pipe closed'),{code:'EPIPE'}))).not.toThrow();
  expect(()=>output.emit('error',Object.assign(new Error('disk failed'),{code:'EIO'}))).toThrow('disk failed');
});
