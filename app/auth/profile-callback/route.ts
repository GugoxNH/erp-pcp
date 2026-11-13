import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '../../../lib/supabase/server';
export async function GET(request:NextRequest){
 let success=false;
 const code=request.nextUrl.searchParams.get('code');
 if(code){try{const db=await createClient();const {error}=await db.auth.exchangeCodeForSession(code);success=!error;}catch{}}
 return new NextResponse(null,{status:303,headers:{Location:success?'/perfil':'/perfil?email=expired','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
