#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack, SolutionProps } from '../lib/infrastructure-stack';
import * as forge from "node-forge";

const stackName = process.env.INFRA_STACK!
const app = new cdk.App();
const environment_ctx = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

export const createCsr = () => {
  // generate a private and public key
  const { privateKey, publicKey } = forge.pki.rsa.generateKeyPair(2048);
  // create a csr
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = publicKey;
  csr.setSubject([
    { name: "commonName", value: process.env.CN! },
    { name: "countryName", value: process.env.COUNTRY! },
    { name: "localityName", value: process.env.LOCAL! },
    { name: "organizationName", value: process.env.ORGANISATION! },
  ]);

  // sign the CSR
  csr.sign(privateKey);

  // convert csr to pem file
  const csrPem = forge.pki.certificationRequestToPem(csr);

  /**
   * save this somewhere safe like AWS Secret Manager
   * we need it to issue client certificate
   * */ 
  const privateKeyPem = forge.pki.privateKeyToPem(privateKey);

  return csrPem;
};

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
  outputCsrPkPemSecretName: process.env.OUTPUT_CSR_PK_PEM_SECRET_NAME!,

}


new InfrastructureStack(app, stackName, props);