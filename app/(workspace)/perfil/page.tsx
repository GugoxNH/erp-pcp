import {requireAccess} from '../../../lib/access-server';
import {gmailStatus} from '../../../lib/gmail';
import {companyEmailStatus} from '../../../lib/company-email';
import ProfilePanel from '../../profile-panel';
import '../../products.css';
import '../../profile.css';

export default async function ProfilePage({searchParams}:{searchParams:Promise<{gmail?:string;email?:string}>}){
 const {user,profile}=await requireAccess();
 const [gmail,companyEmail,params]=await Promise.all([gmailStatus(user.id),companyEmailStatus(user.id),searchParams]);
 return <ProfilePanel companyEmail={companyEmail} profile={{username:profile.username,full_name:profile.full_name,updated_at:profile.updated_at}}
  email={user.email?.endsWith('.invalid')?'':user.email??''} pendingEmail={user.new_email??''} gmail={gmail} outcome={params.email==='expired'?'email_expired':params.gmail??''}/>;
}
