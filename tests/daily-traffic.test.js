const test=require('node:test'),assert=require('node:assert/strict');
const {dailyTraffic}=require('../lib/daily-traffic');
test('daily views use Eastern midnight, count sessions per day and include zero days',()=>{
 const result=dailyTraffic([
  {created_at:'2026-10-07T03:59:59Z',session_id:'same'},
  {created_at:'2026-10-07T04:00:00Z',session_id:'same'},
  {created_at:'2026-10-07T05:00:00Z',session_id:'same'},
  {created_at:'2026-10-07T06:00:00Z',session_id:''},
 ],new Date('2026-10-07T12:00:00Z'));
 assert.equal(result.timeZone,'America/New_York');assert.equal(result.daily.length,30);
 assert.deepEqual(result.today,{day:'2026-10-07',views:3,visits:1});
 assert.deepEqual(result.daily.at(-2),{day:'2026-10-06',views:1,visits:1});
 assert.equal(result.daily[0].views,0);
});
test('daily grouping handles daylight saving transition without duplicate dates',()=>{
 const result=dailyTraffic([
  {created_at:'2026-11-01T05:30:00Z',session_id:'one'},
  {created_at:'2026-11-01T06:30:00Z',session_id:'two'},
  {created_at:'2026-11-02T04:59:59Z',session_id:'one'},
  {created_at:'2026-11-02T05:00:00Z',session_id:'three'},
 ],new Date('2026-11-02T12:00:00Z'));
 assert.deepEqual(result.today,{day:'2026-11-02',views:1,visits:1});
 assert.deepEqual(result.daily.at(-2),{day:'2026-11-01',views:3,visits:2});
 assert.equal(new Set(result.daily.map(row=>row.day)).size,30);
});

test('tracking calendar starts at its first recorded day and retains subsequent zero days',()=>{
 const result=dailyTraffic([{created_at:'2026-10-06T16:00:00Z',session_id:'a'}],new Date('2026-10-08T16:00:00Z'),30,'2026-10-06T16:00:00Z');
 assert.deepEqual(result.daily.map(r=>r.day),['2026-10-06','2026-10-07','2026-10-08']);
 assert.equal(result.daily[1].views,0);
});
