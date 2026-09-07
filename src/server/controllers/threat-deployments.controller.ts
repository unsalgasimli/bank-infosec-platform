import type { Request,Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { ThreatDeploymentService } from '../services/threat-deployment.service.js';
export class ThreatDeploymentsController {
 static async machine(req:Request,res:Response){
  try{if(req.headers.cookie)throw new Error('Machine endpoint does not accept session cookies');const token=req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!token)throw new Error('Signed provider identity required');const mapping=String(req.params.mappingId),action=String(req.params.action);
   const result=action==='authorize'?await ThreatDeploymentService.authorize(mapping,token,req.body):action==='consume'?await ThreatDeploymentService.consume(mapping,token,req.body):action==='receipt'?await ThreatDeploymentService.callback(mapping,token,req.body):undefined;
   if(!result)throw new Error('Unsupported deployment operation');res.set('Cache-Control','no-store');res.json({success:true,...result});
  }catch(error){res.status(403).json({success:false,error:error instanceof Error?error.message:'Provider verification failed'});}
 }
 static async configure(req:AuthenticatedRequest,res:Response){try{res.json({success:true,...await ThreatDeploymentService.configure(req.body,req.user!)});}catch(error){res.status(403).json({success:false,error:error instanceof Error?error.message:'Configuration denied'});}}
 static async receipts(req:AuthenticatedRequest,res:Response){try{res.set('Cache-Control','no-store');res.json({success:true,...await ThreatDeploymentService.receipts(String(req.params.id),req.user!)});}catch{res.status(403).json({success:false,error:'Receipt access denied'});}}
}
