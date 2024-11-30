import { Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import { BaseConstructs, AppGwDistributedServiceProps, AppGwDistributedService } from "../../../src";
const util = require("util")

describe("AppGwDistributedServiceStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();
    const props: AppGwDistributedServiceProps = {
      organisation: "corp",
      department: "main",
      solution: "abc",
      env: { name: "dev", region: "eu-north-1", account: "123456" },
      docker: {
        imageUri: "strm/helloworld-http"
      }
    };

    const testStack = new cdk.Stack(app, "TestStack", props);
    const base = new BaseConstructs(testStack, "TestStack-baseconstructs", {...props, logsBucketOn: true});
    const service = new AppGwDistributedService(testStack, "TestStack-service", props, base);
    const template = Template.fromStack(testStack);

    // console.log(util.inspect(template.toJSON(), {showHidden: false, depth: null, colors: true}))

    template.hasResourceProperties("AWS::ECS::Cluster", {
      ClusterName: 'abc-dev-eunorth1-cluster',
    });

    template.hasResourceProperties("AWS::ECS::TaskDefinition", {
      ContainerDefinitions: [{Image: 'strm/helloworld-http'}],
      Family: 'AbcDevEunorth1'
    });

    template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      Description: "Load balancer to target",
      FromPort: 80,
      ToPort: 80
    });

    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
      Port: 80,
      Protocol: 'HTTP'
    });

    template.hasResourceProperties("AWS::ECS::Service", {
      ServiceName: 'abc-dev-eunorth1-fargate-srv',
      Cluster: { Ref: 'TestStackserviceTestStackserviceclusterD4914B63' },
      DeploymentController: { Type: 'ECS' },
      LoadBalancers: [{ContainerName: 'abc-dev-eunorth1-image-srv',
        ContainerPort: 80}]
    });

    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      Port: 80,
      Protocol: 'TCP',
      TargetType: 'alb'
    });


})
})