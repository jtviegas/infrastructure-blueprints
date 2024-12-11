import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone, IHostedZone, NsRecord, PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { ParameterDataType, ParameterTier, StringParameter } from 'aws-cdk-lib/aws-ssm';
import { DNS_GLOBAL_RESOURCES_REGION } from '../commons/constants';
import { toParameter } from '../commons/utils';
import { CommonStackProps } from '../commons/props';


export interface PublicSubdomainProps extends CommonStackProps {
  readonly name: string;
}

export interface IPublicSubdomain {
  readonly hostedZoneDomain: IHostedZone;
  readonly hostedZoneSubdomain: IHostedZone;
}

export class PublicSubdomain extends Construct implements IPublicSubdomain {

  readonly hostedZoneDomain: IHostedZone;
  readonly hostedZoneSubdomain: IHostedZone;

  constructor(scope: Construct, id: string, props: PublicSubdomainProps) {
    super(scope, id);

    if (props.env.region != DNS_GLOBAL_RESOURCES_REGION) {
      throw new Error(`region must be: ${DNS_GLOBAL_RESOURCES_REGION}`)
    }
    if (props.env.domain === undefined) {
      throw new Error("the root domain must be defined in sytem environment (domain variable)")
    }
    if ((props.crossRegionReferences === undefined) || (props.crossRegionReferences === false)) {
      throw new Error("please allow crossRegionReferences")
    }

    this.hostedZoneDomain = HostedZone.fromLookup(this, `${id}HzRootDomain`, {domainName: props.env.domain.name});
    this.hostedZoneSubdomain = new PublicHostedZone(this, `${id}Hz`, { zoneName: props.name });

    new StringParameter(this, `${id}ParamHz`, {
      parameterName: toParameter(props, props.name, "hostedZoneId"),
      stringValue: this.hostedZoneSubdomain.hostedZoneId,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);
    
    new NsRecord(this, `${id}NsRecord`, {
      zone: this.hostedZoneDomain,
      recordName: props.name,
      values: this.hostedZoneSubdomain.hostedZoneNameServers!,
      ttl: Duration.seconds(172800),
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);

    const certificate = new Certificate(this, `${id}Cert`, {
      domainName: props.name,
      certificateName: props.name,
      validation: CertificateValidation.fromDns(this.hostedZoneSubdomain)
    });

    new StringParameter(this, `${id}ParamCert`, {
      parameterName: toParameter(props, props.name, "certificateArn"),
      stringValue: certificate.certificateArn,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);

  }
}
