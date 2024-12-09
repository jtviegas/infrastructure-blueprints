import * as CustomResource from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface PrefixListIpFinderProps {
  readonly prefixListId: string;
}

export class PrefixListIpFinder extends CustomResource.AwsCustomResource {

  constructor(scope: Construct, name: string, props: PrefixListIpFinderProps) {

    const parameters: any = {};
    parameters["PrefixListId"] =  props.prefixListId;

    const call: CustomResource.AwsSdkCall = {
      service: "EC2",
      action: "getManagedPrefixListEntries",
      parameters: parameters,
      physicalResourceId: PhysicalResourceId.of(Date.now().toString()),
      
    };
    const policy = CustomResource.AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          actions: ["ec2:GetManagedPrefixListEntries"],
          resources: ["*"],
        }),
      ],
    );
    super(scope, name, { onCreate: call, onUpdate: call, policy: policy });

  }

  // prefix_list_id=$(aws ec2 describe-managed-prefix-lists | jq -r ".\"PrefixLists\" | .[] | select(.PrefixListName == \"com.amazonaws.global.cloudfront.origin-facing\") | .PrefixListId")
  // outputs=$(aws ec2 get-managed-prefix-list-entries --prefix-list-id "$prefix_list_id" --output json)
  // echo $outputs | jq -r ".\"Entries\"" > "$output_file"
  
  public getCidrs(): string {
    return this.getResponseField(`Entries.[].Cidr`);
  }
}


