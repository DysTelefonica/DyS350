declare interface IE2eBrandingApplicationCustomizerStrings {
  Title: string;
}

declare module "E2eBrandingApplicationCustomizerStrings" {
  const strings: IE2eBrandingApplicationCustomizerStrings;
  export = strings;
}

declare module "*.scss" {
  const content: Record<string, string>;
  export default content;
}
