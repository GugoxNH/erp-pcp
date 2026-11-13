import {requireAccess} from "../../../lib/access-server";
import ServicesWorkspace from "../../services-workspace";
export default async function ServicesPage(){
  await requireAccess("services");
  return <ServicesWorkspace/>;
}
