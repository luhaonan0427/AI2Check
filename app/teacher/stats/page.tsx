import Campus from '@/app/campus';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{id?:string}>}){const {id}=await searchParams;return <Campus initialView='grades' initialCourseId={id||''}/> }
