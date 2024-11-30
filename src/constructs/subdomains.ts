import * as cdk from 'aws-cdk-lib';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone, IHostedZone, NsRecord, PrivateHostedZone, PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { ParameterDataType, ParameterTier, StringParameter } from 'aws-cdk-lib/aws-ssm';
import { DNS_GLOBAL_RESOURCES_REGION } from '../commons/constants';
import { deriveOutput, deriveParameter, removeNonTextChars } from '../commons/utils';
import { CommonStackProps, VpcLookupAttributes } from '../commons/props';

/*
class SubdomainsStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: SubdomainsProps, base: IBaseConstructs) {
    super(scope, id, props);

    // work out the subdomains vpc settings based on base constructs
    const subdomainspecs = []
    for(const subdomain of props.subdomains){
      subdomainspecs.push({...subdomain, vpc: base.getVpcLookupAttributes()})
    }
    const subdomainProps: SubdomainsProps ={
      ...props,
      subdomains: subdomainspecs
    }
    const subdomains = new Subdomains(this, `${id}-subdomains`, subdomainProps)
  }
}

const app = new cdk.App();
const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const subdomainsProps: SubdomainsProps = {
  ...baseProps,
  env: {...environment, 
    region: "us-east-1",
    domain: {
      name: "site.com",
      private: false
    }
  },
  subdomains: [
    { name: "ui.site.com", private: false, createCertificate: true}, 
    { name: "lb.site.com", private: false, createCertificate: false}
  ],
  stackName: "SubdomainsStack",
}

const subdomainsStack = new SubdomainsStack(app, "SubdomainsStack", subdomainsProps, baseStack.baseConstructs);
*/

export interface SubdomainSpec {
  readonly name: string;
  readonly private?: boolean;
  readonly createCertificate?: boolean;
  readonly vpc?: VpcLookupAttributes
}

export interface SubdomainsProps extends CommonStackProps {
  readonly subdomains: SubdomainSpec[];
}

export interface ISubdomains {
  readonly hostedZoneDomain: IHostedZone;
  readonly hostedZoneSubdomains: IHostedZone[]; 
}

export class Subdomains extends Construct implements ISubdomains {

  readonly hostedZoneDomain: IHostedZone;
  readonly hostedZoneSubdomains: IHostedZone[]; 

  constructor(scope: Construct, id: string, props: SubdomainsProps) {
    super(scope, id);
    if( props.env.region != DNS_GLOBAL_RESOURCES_REGION ){
      throw new Error(`region must be: ${DNS_GLOBAL_RESOURCES_REGION}`)
    }
    if( props.env.domain === undefined ){
      throw new Error("the domain must be defined in sytem environment" )
    }

    this.hostedZoneSubdomains = [];
    if ((props.crossRegionReferences === undefined) || (props.crossRegionReferences === false)){
      throw new Error("please allow crossRegionReferences")
    }
    this.hostedZoneDomain = HostedZone.fromLookup(this, 
      `${id}-${removeNonTextChars(props.env.domain.name)}-hz`, 
      {domainName: props.env.domain.name, 
        privateZone: props.env.domain.private ? props.env.domain.private : false});

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

        const vpc = Vpc.fromLookup(this, `${idAffix}-vpc`, subdomain.vpc)

        hostedZone = new PrivateHostedZone(this, 
          `${idAffix}-hz`, {
          zoneName: subdomain.name,
          vpc: vpc
        })
      }
      this.hostedZoneSubdomains.push(hostedZone);

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
        zone: this.hostedZoneDomain,
        recordName: subdomain.name,
        values: hostedZone.hostedZoneNameServers!,
        ttl: Duration.seconds(172800),
      });
      nsRecord.applyRemovalPolicy(RemovalPolicy.DESTROY);

      if ((subdomain.createCertificate !== undefined) && (subdomain.createCertificate === true)){
        let certificate = new Certificate(this, `${idAffix}-certificate`, {
          domainName: subdomain.name,
          certificateName: subdomain.name,
          validation: CertificateValidation.fromDns(hostedZone)
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
