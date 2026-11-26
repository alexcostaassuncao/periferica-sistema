import {createHash} from 'node:crypto';

type CalendarMeeting={
  id:string;
  title:string;
  date:string;
  start_time:string;
  end_time:string;
  place:string;
  meet_url:string;
};

const PLACE_NAMES:Record<string,string>={online:'Online',sala:'Sala de Reunião',estudio:'Estúdio',cliente:'No cliente',mesa:'Minha mesa'};
const TIME_ZONE='America/Sao_Paulo';

export function googleCalendarConfigured(){
  return Boolean(process.env.GOOGLE_CALENDAR_ID&&process.env.GOOGLE_CALENDAR_CLIENT_ID&&
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET&&process.env.GOOGLE_CALENDAR_REFRESH_TOKEN);
}

async function accessToken(){
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    body:new URLSearchParams({
      grant_type:'refresh_token',
      client_id:process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret:process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      refresh_token:process.env.GOOGLE_CALENDAR_REFRESH_TOKEN!,
    }),
    signal:AbortSignal.timeout(8000),
    cache:'no-store',
  });
  if(!response.ok)throw new Error('Google Calendar token request failed: '+response.status);
  const result=await response.json();
  if(typeof result.access_token!=='string'||!result.access_token)throw new Error('Google Calendar access token is missing');
  return result.access_token;
}

export async function writeGoogleCalendarMeeting(meeting:CalendarMeeting,remove=false){
  const token=await accessToken();
  const calendarId=encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!);
  const collection=`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
  // Hexadecimal is a subset of the event ID alphabet accepted by Calendar.
  const id=createHash('sha256').update('periferica:meeting:'+meeting.id).digest('hex');
  const request=(url:string,method:string,payload?:object)=>fetch(url,{
    method,cache:'no-store',signal:AbortSignal.timeout(8000),
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:payload?JSON.stringify(payload):undefined,
  });
  const item=collection+'/'+id+'?sendUpdates=none';
  if(remove){
    const response=await request(item,'DELETE');
    if(!response.ok&&response.status!==404&&response.status!==410)throw new Error('Google Calendar delete failed: '+response.status);
    return;
  }
  const event={
    summary:meeting.title,
    location:meeting.meet_url||PLACE_NAMES[meeting.place]||'',
    start:{dateTime:`${meeting.date}T${meeting.start_time}:00`,timeZone:TIME_ZONE},
    end:{dateTime:`${meeting.date}T${meeting.end_time}:00`,timeZone:TIME_ZONE},
  };
  let response=await request(collection+'?sendUpdates=none','POST',{...event,id});
  if(response.status===409)response=await request(item,'PATCH',event);
  if(!response.ok)throw new Error('Google Calendar write failed: '+response.status);
}
