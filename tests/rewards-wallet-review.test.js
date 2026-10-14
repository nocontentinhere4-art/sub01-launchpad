import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {reviewWalletAdjustedReward} from '../src/rewards-wallet-review.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/reward-wallet-adjustments.json',import.meta.url)));
const options={baseNetworkFeeLamports:'5000',maxNetworkFeeLamports:'100000'};
test('reviewed funding allows only bounded wallet priority fees while preserving all actions',()=>{
 assert.equal(reviewWalletAdjustedReward(fixtures.original,fixtures.allowed,options),true);
 for(const name of ['highFee','hiddenTransfer','changedRoot','changedBlockhash','writableSystem','duplicateBudget'])assert.equal(reviewWalletAdjustedReward(fixtures.original,fixtures[name],options),false,name);
 assert.equal(reviewWalletAdjustedReward(fixtures.original,fixtures.allowed,{...options,maxNetworkFeeLamports:'75000'}),false);
 assert.equal(reviewWalletAdjustedReward(fixtures.original,fixtures.allowed,{...options,maxNetworkFeeLamports:'100001'}),false);
});
