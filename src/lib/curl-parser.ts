/**
 * Curl command parser for extracting Slack authentication tokens
 */

export interface ParsedCurlResult {
  workspaceName: string;
  workspaceUrl: string;
  xoxd: string;
  xoxc: string;
}

export interface ParseError {
  field: 'workspace' | 'xoxd' | 'xoxc';
  message: string;
}

/**
 * Extract the workspace name (first subdomain segment) from a Slack workspace URL.
 * Handles both standard (myorg.slack.com) and enterprise (myorg.enterprise.slack.com) URLs.
 * Returns 'workspace' if the URL does not match.
 */
export function extractSlackWorkspaceName(url: string): string {
  const match = url.match(/https?:\/\/([\w.-]+)\.slack\.com/);
  return match ? match[1].split('.')[0] : 'workspace';
}

/**
 * Parse a cURL command and extract Slack authentication tokens
 */
export function parseCurlCommand(curlInput: string): ParsedCurlResult {
  // Extract workspace URL — domain can be myorg.slack.com or myorg.enterprise.slack.com.
  // The URL may be positional (curl 'https://...') or flagged (curl --url 'https://...');
  // anchor to curl or a URL-bearing flag so the origin/referer headers can't be mismatched.
  const urlMatch = curlInput.match(
    /(?:curl|--url|--location|-L)\s+'?(https?:\/\/([\w.-]+)\.slack\.com[^'"\s]*)/
  );
  if (!urlMatch) {
    throw new CurlParseError('workspace', 'Could not find Slack workspace URL in cURL command');
  }
  const fullSubdomain = urlMatch[2];
  const workspaceUrl = `https://${fullSubdomain}.slack.com`;
  const workspaceName = extractSlackWorkspaceName(workspaceUrl);

  // Extract xoxd token from cookie header
  // Supports: -b 'cookies', --cookie 'cookies', -H 'Cookie: cookies'
  const cookieMatch = curlInput.match(
    /-b\s+'([^']+)'|--cookie\s+'([^']+)'|-H\s+'[Cc]ookie:\s*([^']+)'/
  );
  const cookieHeader = cookieMatch ? (cookieMatch[1] || cookieMatch[2] || cookieMatch[3]) : '';

  const xoxdMatch = cookieHeader.match(/(?:^|;\s*)d=(xoxd-[^;]+)/);
  if (!xoxdMatch) {
    throw new CurlParseError('xoxd', 'Could not find xoxd token in cookie header (d=xoxd-...)');
  }
  const xoxdEncoded = xoxdMatch[1];
  const xoxd = decodeURIComponent(xoxdEncoded);

  // Extract xoxc token from data
  // Supports: --data-raw 'data', --data-raw $'data', --data 'data', --data $'data'
  const dataMatch = curlInput.match(
    /--data-raw\s+\$?'([^']+)'|--data-raw\s+\$?"([^"]+)"|--data\s+\$?'([^']+)'|--data\s+\$?"([^"]+)"/
  );
  const dataContent = dataMatch
    ? (dataMatch[1] || dataMatch[2] || dataMatch[3] || dataMatch[4])
    : '';

  const xoxcMatch =
    dataContent.match(/name="token".*?(xoxc-[a-zA-Z0-9-]+)/) ||   // multipart/form-data
    dataContent.match(/"token"\s*:\s*"(xoxc-[a-zA-Z0-9-]+)"/) ||   // JSON body
    dataContent.match(/(?:^|[&?])token=(xoxc-[a-zA-Z0-9-]+)/);     // urlencoded body (token=xoxc-...)
  if (!xoxcMatch) {
    throw new CurlParseError('xoxc', 'Could not find xoxc token in request data');
  }
  const xoxc = xoxcMatch[1];

  return {
    workspaceName,
    workspaceUrl,
    xoxd,
    xoxc,
  };
}

/**
 * Custom error class for cURL parsing errors
 */
export class CurlParseError extends Error {
  public field: ParseError['field'];

  constructor(field: ParseError['field'], message: string) {
    super(message);
    this.name = 'CurlParseError';
    this.field = field;
  }
}

/**
 * Validate that a string looks like a cURL command
 */
export function looksLikeCurlCommand(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith('curl ') || trimmed.startsWith('curl\t');
}

/**
 * Detect a cURL command that was pasted INLINE and UNQUOTED after `parse-curl`.
 *
 * A browser "Copy as cURL" pasted unquoted explodes into many argv tokens — a bare `curl`, the
 * request URL, and curl's own flags (`-H`, `--compressed`, `-b`, …) — so Commander parses those
 * flags as unknown slackcli options and dies with `unknown option '--compressed'`. Any of these
 * curl-signature tokens appearing as its OWN argv token means the paste was not quoted as a single
 * argument. A correctly quoted single-argument paste stays one token (starting `curl `) and does
 * not match, so the normal inline path still parses.
 *
 * `args` is the argv slice AFTER the `parse-curl` subcommand token.
 */
export function looksLikeInlineCurlPaste(args: string[]): boolean {
  return args.some(
    (a) =>
      a === 'curl' ||
      a === '-H' ||
      a === '--header' ||
      a === '-b' ||
      a === '--cookie' ||
      a === '--compressed' ||
      /^https?:\/\//.test(a),
  );
}
