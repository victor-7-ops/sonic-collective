export function emailSession(fragment: string): { access_token:string; refresh_token:string } | null {
  const params=new URLSearchParams(fragment.replace(/^#/,''));
  const access_token=params.get('access_token');
  const refresh_token=params.get('refresh_token');
  if(!access_token||!refresh_token||access_token.length>8192||refresh_token.length>2048) return null;
  return {access_token,refresh_token};
}

export function emailLinkError(fragment:string): string|null {
  const params=new URLSearchParams(fragment.replace(/^#/,''));
  if(!params.has('error')&&!params.has('error_code')) return null;
  return params.get('error_code')==='otp_expired'
    ? 'This link has expired or was already used. Request a new recovery email and open its latest link.'
    : 'This sign-in link could not be verified. Request a new recovery email.';
}
