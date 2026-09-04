import test from 'node:test';
import assert from 'node:assert/strict';
import { emergencyDeadline, emergencySlaState } from '../server/services/threat-emergency-policy.js';
import type { BusinessCalendar } from '../shared/types/orchestration.js';
const calendar: BusinessCalendar = {id:'bank',name:'Bank',timezone:'Asia/Baku',workdays:[1,2,3,4,5],businessStart:'09:00',businessEnd:'18:00',holidays:['2026-09-07'],is24x7:false};
test('emergency deadlines honor bank weekdays, holidays and local date at UTC rollover',()=>{
  assert.equal(emergencyDeadline(new Date('2026-09-04T08:00:00Z'),2,calendar),'2026-09-09T08:00:00.000Z');
  assert.equal(emergencyDeadline(new Date('2026-09-04T08:00:00Z'),5,calendar),'2026-09-14T08:00:00.000Z');
  assert.equal(emergencyDeadline(new Date('2026-09-06T21:00:00Z'),2,{...calendar,holidays:[]}),'2026-09-08T21:00:00.000Z');
  assert.equal(emergencyDeadline(new Date('2026-03-06T14:00:00Z'),1,{...calendar,timezone:'America/New_York',holidays:[]}),'2026-03-09T13:00:00.000Z');
});
test('emergency calendar is bounded and rejects non-business configuration',()=>{
  assert.throws(()=>emergencyDeadline(new Date(),6,calendar),/Invalid/);
  assert.throws(()=>emergencyDeadline(new Date(),2,{...calendar,workdays:[]}),/calendar/);
  assert.throws(()=>emergencyDeadline(new Date(),2,{...calendar,is24x7:true}),/calendar/);
});
test('late completion cannot erase a breach; on-time update does not depend on closure time',()=>{
  const due='2026-09-09T08:00:00Z'; const now=new Date('2026-09-12T08:00:00Z');
  assert.deepEqual(emergencySlaState({review_due_at:due,model_update_due_at:due},now),{reviewBreached:true,modelUpdateBreached:true});
  assert.deepEqual(emergencySlaState({review_due_at:due,model_update_due_at:due,reviewed_at:due,model_updated_at:due},now),{reviewBreached:false,modelUpdateBreached:false});
  assert.equal(emergencySlaState({review_due_at:due,reviewed_at:'2026-09-10T08:00:00Z'},now).reviewBreached,true);
  assert.equal(emergencySlaState({review_breached_at:due,reviewed_at:due},now).reviewBreached,true);
});
