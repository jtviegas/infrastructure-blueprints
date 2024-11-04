import * as cdk from 'aws-cdk-lib';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone, NsRecord, PrivateHostedZone, PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { CommonStackProps, deriveOutput, deriveParameter } from '../constructs/commons';
import { removeNonTextChars } from '..';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { ParameterDataType, ParameterTier, StringParameter } from 'aws-cdk-lib/aws-ssm';


export interface SubdomainSpec {
  name: string;
  private?: boolean;
  createCertificate?: boolean;
  vpc?: {
    name: string;
    id: string;
  }
}
export interface SubdomainsStackProps extends CommonStackProps {
  readonly subdomains: SubdomainSpec[];
  readonly domain: {
    name: string;
    private?: boolean;
  }
}


export class SubdomainsStack extends Stack {


  constructor(scope: Construct, id: string, props: SubdomainsStackProps) {
    super(scope, id, { ...props, env: { ...props.env, region: "us-east-1" } });

    if ((props.crossRegionReferences === undefined) || (props.crossRegionReferences === false)){
      throw new Error("please allow crossRegionReferences")
    }

    const hostedZoneDomain = HostedZone.fromLookup(this, 
      `${id}-${removeNonTextChars(props.domain.name)}-hz`, 
      {domainName: props.domain.name, 
        privateZone: props.domain.private ? props.domain.private : false});

    for(const subdomain of props.subdomains){
      let idAffix = `${id}-${removeNonTextChars(subdomain.name)}`

      let hostedZone = null;
      if ((subdomain.private === undefined) ||  (subdomain.private === false)){
        hostedZone = new PublicHostedZone(this, 
          `${idAffix}-hz`, {
          zoneName: subdomain.name
        })
      }
      else {
        if (subdomain.vpc === undefined){
          throw new Error("must provide vpc info when creating a private zone")
        }

        const vpc = Vpc.fromLookup(this, `${idAffix}-vpc`, {
          vpcId: subdomain.vpc.id,
          vpcName: subdomain.vpc.name
        })

        hostedZone = new PrivateHostedZone(this, 
          `${idAffix}-hz`, {
          zoneName: subdomain.name,
          vpc: vpc
        })
      }

      new StringParameter(this, `${idAffix}-paramHostedZoneId`, {
        parameterName: deriveParameter(props, `${removeNonTextChars(subdomain.name)}/hostedZoneId`),
        stringValue: hostedZone.hostedZoneId,
        tier: ParameterTier.STANDARD,
        dataType: ParameterDataType.TEXT
      }).applyRemovalPolicy(RemovalPolicy.DESTROY);
      new cdk.CfnOutput(this, `${idAffix}-outputHostedZoneId`, {value: hostedZone.hostedZoneId,
        exportName: deriveOutput(props, `${removeNonTextChars(subdomain.name)}-hostedZoneId`)});

      new StringParameter(this, `${idAffix}-paramHostedZoneArn`, {
        parameterName: deriveParameter(props, `${removeNonTextChars(subdomain.name)}/hostedZoneArn`),
        stringValue: hostedZone.hostedZoneArn,
        tier: ParameterTier.STANDARD,
        dataType: ParameterDataType.TEXT
      }).applyRemovalPolicy(RemovalPolicy.DESTROY);
      new cdk.CfnOutput(this, `${idAffix}-outputHostedZoneArn`, {value: hostedZone.hostedZoneArn,
        exportName: deriveOutput(props, `${removeNonTextChars(subdomain.name)}-hostedZoneArn`)});

      let nsRecord = new NsRecord(this, `${idAffix}-nsRecord`, {
        zone: hostedZoneDomain,
        recordName: subdomain.name,
        values: hostedZone.hostedZoneNameServers!,
        ttl: Duration.seconds(172800),
      });
      nsRecord.applyRemovalPolicy(RemovalPolicy.DESTROY);

      if ((subdomain.createCertificate !== undefined) && (subdomain.createCertificate)){
        let certificate = new Certificate(this, `${idAffix}-certificate`, {
          domainName: subdomain.name,
          certificateName: subdomain.name,
          validation: CertificateValidation.fromDns(hostedZone),
        });

        new StringParameter(this, `${idAffix}-paramCertificateArn`, {
          parameterName: deriveParameter(props, `${removeNonTextChars(subdomain.name)}/certificateArn`),
          stringValue: certificate.certificateArn,
          tier: ParameterTier.STANDARD,
          dataType: ParameterDataType.TEXT
        }).applyRemovalPolicy(RemovalPolicy.DESTROY);
        new cdk.CfnOutput(this, `${idAffix}-outputCertificateArn`, {value: certificate.certificateArn,
          exportName: deriveOutput(props, `${removeNonTextChars(subdomain.name)}-certificateArn`)});

      }
      
    }
   
  }
}
