/** Plain-language reason for a refused image archive, from the database error. */
export function assetArchiveError(error:{code?:string;message?:string}|null):string {
  const message=error?.message??'';
  if(error?.code==='23503') return 'This image is still used by current content or is part of a prepared release, so it cannot be archived. Remove it from the content first; images in a prepared release stay protected so that release can still go live.';
  if(message.includes('Multi-factor')) return 'Verify your authenticator in Account before archiving an image.';
  if(error?.code==='42501') return 'Only an editor or the person who uploaded an image can archive it.';
  if(error?.code==='22023') return 'This image cannot be archived (it was not found or is not ready).';
  return 'The image could not be archived. Try again later.';
}
