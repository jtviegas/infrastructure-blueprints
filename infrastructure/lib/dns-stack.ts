import * as cdk from 'aws-cdk-lib';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone, NsRecord, PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { BaseProps } from './props-stack';

import path = require('path');



export class DnsStack extends cdk.Stack {

  readonly appCertificate: Certificate;
  readonly loadBalancerHostedZone: PublicHostedZone;
  readonly appHostedZone: PublicHostedZone;

  constructor(scope: Construct, id: string, props: BaseProps) {
    super(scope, id, props);

    // --- dns ---

    this.loadBalancerHostedZone = new PublicHostedZone(this, `${id}-hzLB`, {
      zoneName: props.dnsLoadBalancerDomain
    });
    this.loadBalancerHostedZone.applyRemovalPolicy(RemovalPolicy.DESTROY);


    this.appHostedZone = new PublicHostedZone(this, `${id}-hzApp`, {
      zoneName: props.dnsAppDomain
    });
    this.appHostedZone.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const hostedZoneParentDomain = HostedZone.fromLookup(this, `${id}-hzParentDomain`, 
      {domainName: props.dnsParentDomain, privateZone: false});
    
    const nsRecordLoadBalancer = new NsRecord(this, `${id}-nsRecordLB`, {
      zone: hostedZoneParentDomain,
      recordName: props.dnsLoadBalancerDomain,
      values: this.loadBalancerHostedZone.hostedZoneNameServers!,
      ttl: Duration.seconds(172800),
    });
    nsRecordLoadBalancer.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const nsRecordApp = new NsRecord(this, `${id}-nsRecordApp`, {
      zone: hostedZoneParentDomain,
      recordName: props.dnsAppDomain,
      values: this.appHostedZone.hostedZoneNameServers!,
      ttl: Duration.seconds(172800),
    });
    nsRecordApp.applyRemovalPolicy(RemovalPolicy.DESTROY);

    this.appCertificate = new Certificate(this, `${id}-certificateApp`, {
      domainName: props.dnsAppDomain,
      certificateName: props.dnsAppDomain,
      validation: CertificateValidation.fromDns(this.appHostedZone),
    });

  }
}
