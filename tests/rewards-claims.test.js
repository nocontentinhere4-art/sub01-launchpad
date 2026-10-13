import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyClaimProof, reviewClaimTransaction, explorerLink, unsignedAmount } from '../src/rewards-claims.js';
import { gateReason } from '../src/guest.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/reward-claim.json',import.meta.url),'utf8'));

test('browser independently verifies the Merkle allocation and rejects altered claims',async()=>{
  assert(await verifyClaimProof(fixture.expected));
  assert(!await verifyClaimProof({...fixture.expected,amountLamports:'1'}));
  assert(!await verifyClaimProof({...fixture.expected,epochId:1}));
  assert(!await verifyClaimProof({...fixture.expected,proof:['javascript:alert(1)']}));
});
test('wallet review allows only the exact known claim transaction, no hidden outgoing transfer',()=>{
  assert(reviewClaimTransaction(fixture.transaction,fixture.expected));
  assert(!reviewClaimTransaction(fixture.extraTransfer,fixture.expected));
  assert(!reviewClaimTransaction(fixture.transaction,{...fixture.expected,amountLamports:'1'}));
  assert(!reviewClaimTransaction(fixture.transaction,{...fixture.expected,epochId:1}));
  const bytes=Buffer.from(fixture.transaction,'base64');bytes[1]=1;
  assert(!reviewClaimTransaction(bytes.toString('base64'),fixture.expected));
});
test('only expected explorer links and exact uint64 amounts are accepted',()=>{
  assert(explorerLink('https://explorer.solana.com/address/'+fixture.expected.escrow+'?cluster=devnet'));
  assert.equal(explorerLink('javascript:alert(1)'),null);
  assert.equal(explorerLink('https://example.com/address/'+fixture.expected.escrow),null);
  assert.equal(unsignedAmount('18446744073709551616'),null);
  assert.equal(unsignedAmount('-1'),null);
  assert.equal(unsignedAmount('0'),0n);
});
test('reward sign-in remains independent of the city guest gate; server authenticates claims',()=>{
  assert.equal(gateReason('/api/rewards/claims/prepare','POST'),null);
  assert.equal(gateReason('/api/rewards/claims/submit','POST'),null);
  assert.equal(gateReason('/api/rooms/me','PUT'),'save');
});
