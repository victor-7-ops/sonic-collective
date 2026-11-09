export function readBuildInputs(root?:string,env?:NodeJS.ProcessEnv):Promise<{
  release:unknown|null;
  catalog:{artists:unknown[];performances:unknown[];clips:unknown[];series:unknown[];site:unknown};
  youtubeOverrides:unknown[];
  snapshot:unknown;
}>;
