import { RemovalPolicy } from 'aws-cdk-lib';
import { Certificate, CertificateValidation, ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { IHostedZone, PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { ParameterDataType, ParameterTier, StringParameter } from 'aws-cdk-lib/aws-ssm';
import { DNS_GLOBAL_RESOURCES_REGION } from '../commons/constants';
import { toParameter } from '../commons/utils';
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

    new StringParameter(this, `${id}ParamHostedZone`, {
      parameterName: toParameter(props, props.name, "hostedZoneId"),
      stringValue: this.hostedZoneDomain.hostedZoneId,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);

    new StringParameter(this, `${id}ParamCertificate`, {
      parameterName: toParameter(props, props.name, "certificateArn"),
      stringValue: this.certificateDomain.certificateArn,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);

  }
}
