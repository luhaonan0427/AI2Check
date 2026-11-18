'use client';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
export default function MathContent({children}:{children:string}){
 const source=children.replace(/\\\[([\s\S]*?)\\\]/g,(_,s)=>'\n$$\n'+s+'\n$$\n').replace(/\\\(([\s\S]*?)\\\)/g,(_,s)=>'$'+s+'$');
 return <div className="cm-math"><Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} skipHtml>{source}</Markdown></div>;
}
