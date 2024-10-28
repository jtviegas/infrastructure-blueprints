#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack, SolutionProps } from '../lib/infrastructure-stack';

const stackName = process.env.INFRA_STACK!
const stackCertName = process.env.CERT_STACK!
const app = new cdk.App();
const environment_ctx = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

// export const createCsr = () => {
//   console.log("[createCsr|in]")
//   // generate a private and public key
//   const { privateKey, publicKey } = forge.pki.rsa.generateKeyPair(2048);
//   const attributes = [
//     { name: "commonName", value: process.env.CN! },
//     { name: "countryName", value: process.env.COUNTRY! },
//     { name: "localityName", value: process.env.LOCAL! },
//     { name: "organizationName", value: process.env.ORGANISATION! }
//   ]

//   // create a csr
//   const csr = forge.pki.createCertificationRequest();
//   csr.publicKey = publicKey;
//   csr.setSubject(attributes);
 
  
//   // certificate
//   let cer = forge.pki.createCertificate();
//   cer.publicKey = csr.publicKey;
//   cer.setSubject(attributes);
//   const today = new Date()
//   const after = new Date()
//   after.setFullYear(today.getFullYear() + 1)
//   cer.validity.notBefore = today;
//   cer.validity.notAfter = after;
//   cer.setIssuer(attributes)
//   cer.setExtensions([{
//     name: 'basicConstraints',
//     cA: true, critical: true
//   },{
//     name: 'keyUsage',
//     keyCertSign: true,
//     digitalSignature: true,
//     nonRepudiation: true,
//     keyEncipherment: true,
//     dataEncipherment: true
//   }]);

//   cer.sign(privateKey)
//   const cerPem = forge.pki.certificateToPem(cer);
  
//    // sign the CSR
//    csr.sign(privateKey);
//   // convert csr to pem file
//   const csrPem = forge.pki.certificationRequestToPem(csr);

//   /**
//    * save this somewhere safe like AWS Secret Manager
//    * we need it to issue client certificate
//    * */ 
//   const privateKeyPem = forge.pki.privateKeyToPem(privateKey);

//   const result = {
//     csr: csrPem,
//     pk: privateKeyPem,
//     cer: cerPem
//   }

//   console.log("[createCsr|out] => %o", result)
//   return result;
// };

// const certProps: SolutionCertProps = {
//   dnsName: process.env.DNS_NAME!,
//   hostedZoneId: process.env.HOSTED_ZONE_ID!,
// }

// const certificateStack = new CertificateStack(app, stackCertName, certProps)

const props: SolutionProps = {
  env: environment_ctx,
  tags: {
    organisation: process.env.ORGANISATION!,
    domain: process.env.DOMAIN!,
    solution: process.env.SOLUTION!,
    environment: environment_ctx["name"]
  },
  solution: process.env.SOLUTION!,
  organisation: process.env.ORGANISATION!,
  domain: process.env.DOMAIN!,
  appImage: process.env.APP_IMAGE!,
  outputAppImageUri: process.env.OUTPUT_APP_IMAGE_URI!,
  // outputCaPkPemSecretName: process.env.OUTPUT_CA_PK_PEM_SECRET_NAME!,
  // certificate: certificateStack.certificate
  dnsName: process.env.DNS_NAME!,
  hostedZoneId: process.env.DNS_HOSTED_ZONE_ID!,
  hostedZone: process.env.DNS_HOSTED_ZONE!,
}


new InfrastructureStack(app, stackName, props);
