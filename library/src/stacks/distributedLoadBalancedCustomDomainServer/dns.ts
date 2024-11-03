import * as cdk from 'aws-cdk-lib';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone, NsRecord, PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { CommonStackProps } from '../../constructs/commons';


export interface DnsStackProps extends CommonStackProps {
  readonly domainLoadBalancer: string;
  readonly domainDistribution: string;
  readonly parentDomain: string;
}

export class DnsStack extends cdk.Stack {

  readonly certificateSrv: Certificate;
  readonly hostedZoneLoadBalancer: PublicHostedZone;
  readonly hostedZoneSrv: PublicHostedZone;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, { ...props, env: { ...props.env, region: "us-east-1" } });

    // --- dns ---
    this.hostedZoneLoadBalancer = new PublicHostedZone(this, `${id}-hzLB`, {
      zoneName: props.domainLoadBalancer
    });
    this.hostedZoneLoadBalancer.applyRemovalPolicy(RemovalPolicy.DESTROY);


    this.hostedZoneSrv = new PublicHostedZone(this, `${id}-hzSrv`, {
      zoneName: props.domainDistribution
    });
    this.hostedZoneSrv.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const hostedZoneParentDomain = HostedZone.fromLookup(this, `${id}-hzParentDomain`, 
      {domainName: props.parentDomain, privateZone: false});
    
    const nsRecordLoadBalancer = new NsRecord(this, `${id}-nsRecordLB`, {
      zone: hostedZoneParentDomain,
      recordName: props.domainLoadBalancer,
      values: this.hostedZoneLoadBalancer.hostedZoneNameServers!,
      ttl: Duration.seconds(172800),
    });
    nsRecordLoadBalancer.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const nsRecordApp = new NsRecord(this, `${id}-nsRecordSrv`, {
      zone: hostedZoneParentDomain,
      recordName: props.domainDistribution,
      values: this.hostedZoneSrv.hostedZoneNameServers!,
      ttl: Duration.seconds(172800),
    });
    nsRecordApp.applyRemovalPolicy(RemovalPolicy.DESTROY);

    this.certificateSrv = new Certificate(this, `${id}-certificateSrv`, {
      domainName: props.domainDistribution,
      certificateName: props.domainDistribution,
      validation: CertificateValidation.fromDns(this.hostedZoneSrv),
    });

  }
}
