import {NextResponse,type NextRequest} from 'next/server';
import {cookies} from 'next/headers';
import {requireAccess} from '../../../../lib/access-server';
import {createAdminClient} from '../../../../lib/supabase/admin';
import {gmailClient,gmailConfig,GMAIL_COOKIE,GMAIL_SCOPE} from '../../../../lib/gmail';
import {gmailStateHash,openGmail,sealGmail} from '../../../../lib/gmail-crypto';
export const runtime='nodejs';
function done(status:string){
 const response=new NextResponse(null,{status:303,headers:{Location:`/perfil?gmail=${status}`,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 response.cookies.set(GMAIL_COOKIE,'',{path:'/api/gmail/callback',maxAge:0});return response;
}
export async function GET(request:NextRequest){
 try{
  const {user}=await requireAccess();const config=gmailConfig();
  const state=request.nextUrl.searchParams.get('state'),saved=(await cookies()).get(GMAIL_COOKIE)?.value;
  if(!state||!saved||state!==saved||state.length>100)return done('expired');
  const admin=createAdminClient();
  const {data:attempt,error}=await admin.from('gmail_oauth_attempts').select('verifier_encrypted,expires_at').eq('state_hash',gmailStateHash(state)).eq('user_id',user.id).maybeSingle();
  if(error||!attempt||new Date(attempt.expires_at).getTime()<Date.now())return done('expired');
  if(request.nextUrl.searchParams.has('error')){
   await admin.from('gmail_oauth_attempts').delete().eq('state_hash',gmailStateHash(state)).eq('user_id',user.id);
   return done('cancelled');
  }
  const code=request.nextUrl.searchParams.get('code');if(!code||code.length>4096)return done('failed');
  const client=gmailClient();
  const {tokens}=await client.getToken({code,codeVerifier:openGmail(attempt.verifier_encrypted,user.id)});
  if(!tokens.id_token||!tokens.access_token||!tokens.refresh_token)return done('permission');
  const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:config.id});
  const identity=ticket.getPayload();
  const info=await client.getTokenInfo(tokens.access_token);
  if(!identity?.sub||!identity.email||!identity.email_verified||(identity as unknown as {nonce?:string}).nonce!==state||!info.scopes.includes(GMAIL_SCOPE))return done('permission');
  // Recheck active status after Google returns and before persisting credentials.
  await requireAccess();
  const {error:saveError}=await admin.rpc('finish_gmail_connection',{attempt_hash:gmailStateHash(state),owner_id:user.id,subject:identity.sub,address:identity.email,encrypted_token:sealGmail(tokens.refresh_token,user.id)});
  return done(saveError?'failed':'connected');
 }catch{return done('failed');}
}
