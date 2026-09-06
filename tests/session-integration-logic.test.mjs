import assert from 'node:assert/strict';
import { calculateSessionAggregates, assertOpenSessionShape } from '../api/sessionCore.js';
const open={sessionId:'s1',sellerId:'seller1',status:'OPEN',openedAt:new Date().toISOString(),openedByUid:'u1'};
assert.doesNotThrow(()=>assertOpenSessionShape(open));
const a=calculateSessionAggregates([{totalAmount:100,profit:30,orderStatus:'DELIVERED'},{totalAmount:50,profit:999,orderStatus:'PENDING'}]);
assert.deepEqual(a,{orderCount:2,deliveredOrderCount:1,totalSales:150,deliveredSales:100,totalProfit:30,settlementAmount:100});
assert.throws(()=>assertOpenSessionShape({...open,status:'CLOSED'}),/SESSION_NOT_OPEN/);
console.log('E3-G-D SESSION INTEGRATION LOGIC: PASS (open/closed invariants + canonical aggregate semantics + settlement fields)');
