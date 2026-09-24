export type Assignment={id:string;course:string;title:string;chapter:string;due:string;max:number;weight:number;questions:string;rubric:string};
export type Submission={id:string;assignment:string;student:string;number:string;score:number|null;aiScore:number|null;status:'review'|'approved'|'pending';demo:boolean;category:string;feedback:string;files:string[];submitted:string};
export type Store={assignments:Assignment[];submissions:Submission[]};
export const courses=[{id:'analysis',name:'数学分析 I',code:'MATH 101',color:'purple'},{id:'algebra',name:'高等代数',code:'MATH 102',color:'blue'},{id:'probability',name:'概率论与数理统计',code:'MATH 203',color:'orange'}];
export const students=[['林知夏','2026010101'],['陈一舟','2026010102'],['王予安','2026010103'],['李沐晨','2026010104'],['周若宁','2026010105'],['许思远','2026010106']];
export function seed():Store {const assignments:Assignment[]=[
{id:'a1',course:'analysis',title:'第三次作业：极限与连续',chapter:'第二章 · 函数极限',due:'2026-09-28T23:59',max:100,weight:1,questions:'1. 计算 lim(x→0) sin(x)/x，并说明使用的定理。\n2. 求方程 x² = x 的所有实数解，写出推导过程。\n3. 利用定义证明 f(x)=x² 在 x=1 处连续。',rubric:'第1题30分；第2题20分（变形10分、完整解集10分）；第3题50分。认可正确的不同解法；同源错误不重复扣分。'},
{id:'a2',course:'analysis',title:'第二次作业：数列的极限',chapter:'第一章 · 数列',due:'2026-09-21T23:59',max:100,weight:1,questions:'证明收敛数列有界，并给出逆命题不成立的例子。',rubric:'证明70分，反例及解释30分。'},
{id:'a3',course:'analysis',title:'第一次作业：集合与映射',chapter:'第一章 · 基础知识',due:'2026-09-14T23:59',max:100,weight:1,questions:'说明单射、满射与双射的区别，并分别举例。',rubric:'定义60分，例子40分。'},
{id:'b1',course:'algebra',title:'第一次作业：行列式',chapter:'第一章 · 行列式',due:'2026-09-29T23:59',max:100,weight:1,questions:'计算三阶行列式并解释使用的性质。',rubric:'方法30分，过程50分，结果20分。'},
{id:'c1',course:'probability',title:'第一次作业：随机事件',chapter:'第一章 · 事件与概率',due:'2026-09-30T23:59',max:100,weight:1,questions:'用集合运算表达事件，并应用加法公式。',rubric:'事件表达50分，计算50分。'}];
const submissions:Submission[]=[];for(const [i,s] of students.entries())for(const [j,a] of assignments.slice(0,3).entries()){if(j===0&&i===5)continue;const score=j===0?[85,100,70,0,95][i]:[92,88,96,76,90,84][i]-(j===2?3:0);submissions.push({id:`s${i}${j}`,assignment:a.id,student:s[0],number:s[1],score:j===0?null:score,aiScore:score,status:j===0?'review':'approved',demo:true,category:score===100?'全对':score===0?'全错':'部分正确',feedback:j===0?'样例反馈：请依据评分细则核对完整解集及证明条件。':'样例反馈：本次作业已审核。',files:[],submitted:`2026-09-${j===0?'24':j===1?'20':'13'} 14:${10+i}`});}return{assignments,submissions};}
export function category(score:number,max:number){return score===max?'全对':score===0?'全错':'部分正确';}
