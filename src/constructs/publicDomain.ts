import { Certificate, CertificateValidation, ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { IHostedZone, PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { DNS_GLOBAL_RESOURCES_REGION } from '../commons/constants';
import { CommonStackProps } from '../commons/props';


export interface PublicDomainProps extends CommonStackProps {
  readonly name: string;
}

export interface IPublicDomain {
  readonly hostedZoneDomain: IHostedZone;
  readonly certificateDomain: ICertificate;
}

export class PublicDomain extends Construct implements IPublicDomain {

  readonly hostedZoneDomain: IHostedZone;
  readonly certificateDomain: ICertificate;

  constructor(scope: Construct, id: string, props: PublicDomainProps) {
    super(scope, id);

    if (props.env.region != DNS_GLOBAL_RESOURCES_REGION) {
      throw new Error(`region must be: ${DNS_GLOBAL_RESOURCES_REGION}`)
    }
    if ((props.crossRegionReferences === undefined) || (props.crossRegionReferences === false)) {
      throw new Error("please allow crossRegionReferences")
    }

    this.hostedZoneDomain = new PublicHostedZone(this, `HostedZone`, { zoneName: props.name });
    this.certificateDomain = new Certificate(this, `Certificate`, {
      domainName: props.name,
      certificateName: props.name,
      validation: CertificateValidation.fromDns(this.hostedZoneDomain)
    });

  }
}
