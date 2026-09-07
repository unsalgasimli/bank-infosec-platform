import assert from 'node:assert/strict';
import { solarDay, dayPalette, gardenDayStart } from '../src/client/components/auth/garden/day-cycle.js';

const luminance=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(s=>s<=.04045?s/12.92:((s+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const contrast=(a:string,b:string)=>{const aa=luminance(a),bb=luminance(b);return(Math.max(aa,bb)+.05)/(Math.min(aa,bb)+.05);};
const summer=solarDay(Date.parse('2026-06-21T08:00:00Z'));
const winter=solarDay(Date.parse('2026-12-21T08:00:00Z'));
assert.ok(summer.elevation>winter.elevation+35);
assert.ok(summer.sunset-summer.sunrise>winter.sunset-winter.sunrise+250);
let minimum=Infinity;
for(const date of ['2026-03-20T00:00:00Z','2026-06-21T00:00:00Z','2026-09-04T00:00:00Z','2026-12-21T00:00:00Z']) {
  const base=gardenDayStart(Date.parse(date));const events=solarDay(base);
  for(let minute=0;minute<1440;minute++) {
    const day=solarDay(base+minute*60000);const palette=dayPalette(day);
    assert.ok(Math.abs(Math.hypot(...day.sunDirection)-1)<1e-10);
    assert.equal(day.sunrise,events.sunrise);assert.equal(day.sunset,events.sunset);
    for(const key of ['--garden-ink','--garden-muted','--garden-clay']) {
      const ratio=contrast(String(palette[key]),String(palette['--garden-paper']));minimum=Math.min(minimum,ratio);assert.ok(ratio>=4.5,`${date} ${minute}: ${key} contrast ${ratio}`);
    }
    assert.ok(contrast(String(palette['--garden-ink']),String(palette['--garden-field']))>=4.5);
    assert.ok(contrast(String(palette['--garden-button-ink']),String(palette['--garden-button']))>=4.5);
  }
}
console.log(JSON.stringify({solarSamples:5760,minimumTextContrast:minimum,summerDayMinutes:summer.sunset-summer.sunrise,winterDayMinutes:winter.sunset-winter.sunrise,status:'passed'},null,2));
