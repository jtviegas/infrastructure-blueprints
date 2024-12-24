import { Certificate, CertificateValidation, ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { IHostedZone, PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { DNS_GLOBAL_RESOURCES_REGION } from '../commons/constants';
import { CommonStackProps } from '../commons/props';
import { AccountPrincipal, CompositePrincipal, IRole, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { toResourceName } from '../commons/utils';


export interface PublicDomainProps extends CommonStackProps {
  readonly name: string;
  readonly accountIdsGuest: string[];
}

export interface IPublicDomain {
  readonly hostedZoneDomain: IHostedZone;
  readonly certificateDomain: ICertificate;
  //readonly publicDomainContributor: IRole;
}

export class PublicDomain extends Construct implements IPublicDomain {

  readonly hostedZoneDomain: IHostedZone;
  readonly certificateDomain: ICertificate;
  // readonly publicDomainContributor: IRole;

  constructor(scope: Construct, id: string, props: PublicDomainProps) {
    super(scope, id);

    if (props.env.region != DNS_GLOBAL_RESOURCES_REGION) {
      throw new Error(`region must be: ${DNS_GLOBAL_RESOURCES_REGION}`)
    }
    if ((props.crossRegionReferences === undefined) || (props.crossRegionReferences === false)) {
      throw new Error("please allow crossRegionReferences")
    }

    this.hostedZoneDomain = new PublicHostedZone(this, `HostedZone`, 
      { zoneName: props.name}
    );

    this.certificateDomain = new Certificate(this, `Certificate`, {
      domainName: `*.${props.name}`,
      certificateName: props.name,
      validation: CertificateValidation.fromDns(this.hostedZoneDomain)
    });
 
    const principals: AccountPrincipal[] = [];
    for(const guest of props.accountIdsGuest){
      principals.push(new AccountPrincipal(guest))
    }

    this.hostedZoneDomain.grantDelegation(new CompositePrincipal(...principals));

    // const rolePublicDomainContributor = new Role(this, 'rolePublicDomainContributor', {
    //   roleName: toResourceName(props, props.name, "Contributor"),
    //   description: "allows to add records to the domain hosted zone",
    //   assumedBy: new CompositePrincipal(...principals)
    // });

    // rolePublicDomainContributor.addToPolicy(new PolicyStatement({
    //   actions: [
    //     'route53:List*',
    //     'route53:ChangeTagsForResource',
    //     'route53:ChangeResourceRecordSets',
    // ],
    //   resources: [ this.hostedZoneDomain.hostedZoneArn ],
    // }));

    // this.publicDomainContributor = rolePublicDomainContributor;
  }
}
