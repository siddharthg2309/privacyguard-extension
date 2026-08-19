declare module "mammoth/mammoth.browser.js" {
  type Result = { value: string; messages: readonly unknown[] };
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<Result>;
  };
  export default mammoth;
}
