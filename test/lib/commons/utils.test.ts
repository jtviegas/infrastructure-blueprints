import * as cdk from "aws-cdk-lib";
import { capitalizeFirstLetter, deriveAffix, deriveOutput, deriveParameter, deriveParameterPrefix, 
  deriveResourceAffix, deriveResourceName, removeLeadingSlash, removeNonTextChars } from "../../../src";

describe("commons utils", () => {
  test("methods work as expected", () => {
    const app = new cdk.App();

    expect( removeNonTextChars("a-b/c.d") ).toEqual( 'abcd' );
    expect( capitalizeFirstLetter("a-b/c.d") ).toEqual( 'A-b/c.d' );
    expect( capitalizeFirstLetter("-b/c.d") ).toEqual( '-b/c.d' );
    const props = {
      organisation: "corp",
      department: "main",
      solution: "abc",
      env: { name: "dev", region: "eu-north-1", account: "123456" }
    }
    expect( deriveParameterPrefix(props) ).toEqual( '/abc/dev' );
    expect( deriveParameter(props, "a-v") ).toEqual( '/abc/dev/av' );
    expect( deriveOutput(props, "a-v") ).toEqual( 'abc-dev-av' );
    expect( deriveAffix(props) ).toEqual( 'AbcDevEunorth1' );
    expect( deriveResourceAffix(props)).toEqual( 'abc-dev-eunorth1' );
    expect( deriveResourceName(props, "av") ).toEqual( 'abc-dev-eunorth1-av' );
    expect( deriveResourceName(props, "av", "xyz") ).toEqual( 'abc-dev-eunorth1-av-xyz' );
    expect( removeLeadingSlash("/xyz") ).toEqual( 'xyz' );
    expect( removeLeadingSlash("xyz") ).toEqual( 'xyz' );
})
})

