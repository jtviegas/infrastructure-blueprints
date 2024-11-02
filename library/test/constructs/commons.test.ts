import { Capture, Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";


describe("StateMachineStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // // Since the StateMachineStack consumes resources from a separate stack
    // // (cross-stack references), we create a stack for our SNS topics to live
    // // in here. These topics can then be passed to the StateMachineStack later,
    // // creating a cross-stack reference.
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