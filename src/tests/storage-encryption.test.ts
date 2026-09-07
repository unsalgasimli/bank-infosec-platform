import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../server/config/index.js';
import { storageService } from '../server/services/storage.service.js';

test('object storage requires explicit encryption confirmation on upload and promotion',async t=>{
  const previous={provider:config.STORAGE_PROVIDER,encryption:config.S3_ENCRYPTION,key:config.S3_KMS_KEY_ID,client:(storageService as any).s3Client};
  t.after(()=>{config.STORAGE_PROVIDER=previous.provider;config.S3_ENCRYPTION=previous.encryption;config.S3_KMS_KEY_ID=previous.key;(storageService as any).s3Client=previous.client;});
  config.STORAGE_PROVIDER='s3';config.S3_ENCRYPTION='AES256';config.S3_KMS_KEY_ID=undefined;
  const calls:any[]=[];let confirmed=true;
  (storageService as any).s3Client={send:async(command:any)=>{calls.push({name:command.constructor.name,input:command.input});return confirmed?{ServerSideEncryption:config.S3_ENCRYPTION}:{};}};
  const uploaded=await storageService.stageUpload('security.txt',Buffer.from('test'),'text/plain');
  assert.equal(uploaded.encryption,'AES256');assert.equal(calls[0].input.ServerSideEncryption,'AES256');assert.equal(calls[0].input.ChecksumSHA256,Buffer.from(uploaded.sha256Hash,'hex').toString('base64'));
  await storageService.promoteQuarantinedObject(uploaded.quarantineStorageKey,uploaded.storageKey);
  assert.equal(calls[1].name,'CopyObjectCommand');assert.equal(calls[1].input.ServerSideEncryption,'AES256');assert.equal(calls[2].name,'DeleteObjectCommand');
  confirmed=false;await assert.rejects(storageService.stageUpload('unconfirmed.txt',Buffer.from('test'),'text/plain'),/did not confirm/);
  const before=calls.filter(call=>call.name==='DeleteObjectCommand').length;
  await assert.rejects(storageService.promoteQuarantinedObject(uploaded.quarantineStorageKey,uploaded.storageKey),/did not confirm/);
  assert.equal(calls.filter(call=>call.name==='DeleteObjectCommand').length,before,'Failed promotion must retain the quarantined source');
  confirmed=true;config.S3_ENCRYPTION='aws:kms';config.S3_KMS_KEY_ID='fixture-kms-key';
  const kms=await storageService.stageUpload('kms.txt',Buffer.from('test'),'text/plain');assert.equal(kms.encryption,'aws:kms');assert.equal(calls.at(-1).input.SSEKMSKeyId,'fixture-kms-key');
});
