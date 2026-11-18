export function csvCell(value:unknown):string{
 let text=value==null?'':String(value);
 if(/^[=+@\-\t\r\n]/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
