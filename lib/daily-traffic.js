const TIME_ZONE = 'America/New_York';
const formatter = new Intl.DateTimeFormat('en-CA', {timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
function calendarDay(value) {
  const parts=Object.fromEntries(formatter.formatToParts(new Date(value)).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function dailyTraffic(events, now=new Date(), days=30) {
  const today=calendarDay(now), buckets=new Map();
  const date=new Date(today+'T12:00:00Z');
  for(let i=0;i<days;i++) {
    const day=date.toISOString().slice(0,10);
    buckets.set(day,{day,views:0,sessions:new Set()}); date.setUTCDate(date.getUTCDate()-1);
  }
  for(const event of events) {
    const timestamp=new Date(event.created_at);
    if(!Number.isFinite(timestamp.getTime()))continue;
    const bucket=buckets.get(calendarDay(timestamp)); if(!bucket)continue;
    bucket.views++; if(event.session_id)bucket.sessions.add(event.session_id);
  }
  const daily=[...buckets.values()].map(row=>({day:row.day,views:row.views,visits:row.sessions.size})).reverse();
  return {timeZone:TIME_ZONE,today:daily.find(row=>row.day===today),daily};
}
module.exports={dailyTraffic};
