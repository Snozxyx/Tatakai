import { expect, test } from 'bun:test';
import { AccountContentSafetyState } from '../src/lib/contentSafetyAccount';
const safe = { showAdultEverywhere: false, warnBeforeAdultOpen: true, blurAdultInSearch: true };
const mature = { ...safe, showAdultEverywhere: true };
test('a new route cannot restore stale account data over an explicit Mature Mode choice', () => {
  const state = new AccountContentSafetyState(); state.read('member', safe);
  const revision = state.choose('member', safe, mature);
  expect(state.read('member', safe)).toEqual(mature);
  state.settled('member', revision);
  expect(state.read('member', safe)).toEqual(mature);
  expect(state.read('member', mature)).toEqual(mature);
  expect(state.read('member', safe)).toEqual(safe);
});
test('late save acknowledgements do not replace a newer choice', () => {
  const state = new AccountContentSafetyState();
  const first = state.choose('member', safe, mature);
  const second = state.choose('member', safe, safe);
  state.settled('member', first); expect(state.read('member', mature)).toEqual(safe);
  state.settled('member', second); expect(state.read('member', safe)).toEqual(safe);
});
test('Mature Mode choices remain scoped to their account', () => {
  const state = new AccountContentSafetyState(); state.choose('first', safe, mature);
  expect(state.read('second', safe)).toEqual(safe); expect(state.read('first', safe)).toEqual(mature);
});
