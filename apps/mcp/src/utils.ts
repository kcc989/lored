/**
 * Constructs an authorization URL for an upstream service.
 */
export function getUpstreamAuthorizeUrl({
	upstream_url,
	client_id,
	scope,
	redirect_uri,
	state,
}: {
	upstream_url: string;
	client_id: string;
	scope: string;
	redirect_uri: string;
	state?: string;
}) {
	const upstream = new URL(upstream_url);
	upstream.searchParams.set('client_id', client_id);
	upstream.searchParams.set('redirect_uri', redirect_uri);
	upstream.searchParams.set('scope', scope);
	if (state) upstream.searchParams.set('state', state);
	upstream.searchParams.set('response_type', 'code');
	return upstream.href;
}

/**
 * Fetches an authorization token from an upstream service.
 */
export async function fetchUpstreamAuthToken({
	client_id,
	client_secret,
	code,
	redirect_uri,
	upstream_url,
}: {
	code: string | undefined;
	upstream_url: string;
	client_secret: string;
	redirect_uri: string;
	client_id: string;
}): Promise<[string, null] | [null, Response]> {
	if (!code) {
		return [null, new Response('Missing code', { status: 400 })];
	}

	const resp = await fetch(upstream_url, {
		body: new URLSearchParams({ client_id, client_secret, code, redirect_uri }).toString(),
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		method: 'POST',
	});
	if (!resp.ok) {
		console.log(await resp.text());
		return [null, new Response('Failed to fetch access token', { status: 500 })];
	}
	const body = await resp.formData();
	const accessToken = body.get('access_token') as string;
	if (!accessToken) {
		return [null, new Response('Missing access token', { status: 400 })];
	}
	return [accessToken, null];
}

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
export type Props = {
	loredUserId: string;
	login: string;
	name: string;
	email: string;
	username: string | null;
	accessToken: string;
	organizations: Array<{
		id: string;
		name: string;
		slug: string;
		role: string;
		teams: Array<{
			id: string;
			name: string;
			parentTeamId: string | null;
		}>;
	}>;
};

// Response shape from the web app's internal user lookup endpoint
export type LoredUser = {
	id: string;
	email: string | null;
	name: string | null;
	image: string | null;
	username: string | null;
};
