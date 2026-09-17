const test=require('node:test');
const assert=require('node:assert/strict');
const SessionProfile=require('../ui/chart/session-profile');

function utc(s){return Date.parse(s);}

test('converts UTC to New York local time across DST start without manual table',()=>{
  const before=SessionProfile.toNewYorkParts(utc('2026-03-08T06:30:00Z'));
  const after=SessionProfile.toNewYorkParts(utc('2026-03-08T07:30:00Z'));
  assert.equal(before.hour,1);
  assert.equal(before.day,8);
  assert.equal(after.hour,3);
  assert.equal(after.day,8);
});

test('converts UTC to New York local time across DST end',()=>{
  const first=SessionProfile.toNewYorkParts(utc('2026-11-01T05:30:00Z'));
  const second=SessionProfile.toNewYorkParts(utc('2026-11-01T06:30:00Z'));
  assert.equal(first.hour,1);
  assert.equal(second.hour,1);
  assert.equal(first.day,1);
  assert.equal(second.day,1);
});

test('exports stable versioned session and killzone profiles',()=>{
  assert.equal(SessionProfile.SESSION_PROFILE_v1.version,'SESSION_PROFILE_v1');
  assert.equal(SessionProfile.KILLZONE_PROFILE_v1.version,'KILLZONE_PROFILE_v1');
  for(const key of ['asia','london','newYork','londonClose']){
    assert.ok(SessionProfile.KILLZONE_PROFILE_v1.windows[key],key);
    assert.equal(typeof SessionProfile.KILLZONE_PROFILE_v1.windows[key].start,'string');
    assert.equal(typeof SessionProfile.KILLZONE_PROFILE_v1.windows[key].end,'string');
  }
});

test('resolves configured windows from the provided profile',()=>{
  const profile={version:'custom',timeZone:'America/New_York',windows:{probe:{start:'07:00',end:'10:00'}}};
  const inside=SessionProfile.resolveSession(utc('2026-07-15T12:30:00Z'),profile);
  const outside=SessionProfile.resolveSession(utc('2026-07-15T16:30:00Z'),profile);
  assert.deepEqual(inside,['probe']);
  assert.deepEqual(outside,[]);
});
