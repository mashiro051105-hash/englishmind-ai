// getRandomValues 在普通局域网 HTTP 页面也可用；randomUUID 通常要求安全上下文。
export function requestId(cryptoSource:Pick<Crypto,'getRandomValues'>=globalThis.crypto):string{
 const bytes=cryptoSource.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
