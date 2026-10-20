declare module '*fake-services.mjs' {
  export const createFakeApps: (opts?: { deployedUrl?: string }) => any;
  export const loadServer: (apps?: any) => { server: any; apps: any };
  export const tabValues: (apps: any, name: string) => any;
}
