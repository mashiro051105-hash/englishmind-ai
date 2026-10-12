// Node fetch has no browser cookie jar; use one isolated jar per test client.
export function browserFetch(){let cookie='';return async(input:string,init:RequestInit={})=>{const headers=new Headers(init.headers);if(cookie)headers.set('Cookie',cookie);const res=await fetch(input,{...init,headers});const set=res.headers.getSetCookie().at(-1);if(set)cookie=set.split(';')[0];return res;};}
