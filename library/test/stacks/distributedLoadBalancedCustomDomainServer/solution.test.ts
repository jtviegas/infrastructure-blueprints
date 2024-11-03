import { Capture, Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import {SolutionStackProps, SolutionStack} from "../../../src/";


describe("StateMachineStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    const props: SolutionStackProps = {
      env: {
        account: "dummy",
        name: "dev",
        region: "eu-central-1"
      },
      organisation: process.env.ORGANISATION!,
      department: process.env.DEPARTMENT!,
      solution: process.env.SOLUTION!,
      stackName: "dummy-solutionStack",
      domainLoadBalancer: "lb.stuff.com",
      domainDistribution: "dist.stuff.com",
      parentDomain: "stuff.com",
      dockerfileDir: "./test/resources/docker"
    }

    const solutionStack = new SolutionStack(app, "dummy-solutionStack", props)

    

    // const topicsStack = new cdk.Stack(app, "TopicsStack");

    // // Create the topic the stack we're testing will reference.
    // const topics = [new sns.Topic(topicsStack, "Topic1", {})];

    // // Create the StateMachineStack.
    // const stateMachineStack = new StateMachineStack(app, "StateMachineStack", {
    //   topics: topics, // Cross-stack reference
    // });

    // // Prepare the stack for assertions.
    // const template = Template.fromStack(stateMachineStack);


})
})