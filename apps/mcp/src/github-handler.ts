import { env } from 'cloudflare:workers';
import type { AuthRequest, OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { Hono } from 'hono';
import { Octokit } from 'octokit';

import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl, type LoredUser, type Props } from './utils';
import {
	addApprovedClient,
	bindStateToSession,
	createOAuthState,
	generateCSRFProtection,
	isClientApproved,
	OAuthError,
	renderApprovalDialog,
	validateCSRFToken,
	validateOAuthState,
} from './workers-oauth-utils';

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get('/authorize', async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const { clientId } = oauthReqInfo;
	if (!clientId) {
		return c.text('Invalid request', 400);
	}

	// Check if client is already approved
	if (await isClientApproved(c.req.raw, clientId, env.COOKIE_ENCRYPTION_KEY)) {
		// Skip approval dialog but still create secure state and bind to session
		const { stateToken } = await createOAuthState(oauthReqInfo, c.env.OAUTH_KV);
		const { setCookie: sessionBindingCookie } = await bindStateToSession(stateToken);
		return redirectToGithub(c.req.raw, stateToken, { 'Set-Cookie': sessionBindingCookie });
	}

	// Generate CSRF protection for the approval form
	const { token: csrfToken, setCookie } = generateCSRFProtection();

	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		csrfToken,
		server: {
			description: 'Authenticate with your GitHub account to use the Lored MCP server.',
			name: 'Lored MCP Server',
		},
		setCookie,
		state: { oauthReqInfo },
	});
});

app.post('/authorize', async (c) => {
	try {
		const formData = await c.req.raw.formData();

		// Validate CSRF token
		validateCSRFToken(formData, c.req.raw);

		// Extract state from form data
		const encodedState = formData.get('state');
		if (!encodedState || typeof encodedState !== 'string') {
			return c.text('Missing state in form data', 400);
		}

		let state: { oauthReqInfo?: AuthRequest };
		try {
			state = JSON.parse(atob(encodedState));
		} catch (_e) {
			return c.text('Invalid state data', 400);
		}

		if (!state.oauthReqInfo || !state.oauthReqInfo.clientId) {
			return c.text('Invalid request', 400);
		}

		// Add client to approved list
		const approvedClientCookie = await addApprovedClient(
			c.req.raw,
			state.oauthReqInfo.clientId,
			c.env.COOKIE_ENCRYPTION_KEY,
		);

		// Create OAuth state and bind it to this user's session
		const { stateToken } = await createOAuthState(state.oauthReqInfo, c.env.OAUTH_KV);
		const { setCookie: sessionBindingCookie } = await bindStateToSession(stateToken);

		// Set both cookies: approved client list + session binding
		const headers = new Headers();
		headers.append('Set-Cookie', approvedClientCookie);
		headers.append('Set-Cookie', sessionBindingCookie);

		return redirectToGithub(c.req.raw, stateToken, Object.fromEntries(headers));
	} catch (error: unknown) {
		console.error('POST /authorize error:', error);
		if (error instanceof OAuthError) {
			return error.toResponse();
		}
		const message = error instanceof Error ? error.message : 'Unknown error';
		return c.text(`Internal server error: ${message}`, 500);
	}
});

async function redirectToGithub(
	request: Request,
	stateToken: string,
	headers: Record<string, string> = {},
) {
	return new Response(null, {
		headers: {
			...headers,
			location: getUpstreamAuthorizeUrl({
				client_id: env.GITHUB_CLIENT_ID,
				redirect_uri: new URL('/callback', request.url).href,
				scope: 'read:user',
				state: stateToken,
				upstream_url: 'https://github.com/login/oauth/authorize',
			}),
		},
		status: 302,
	});
}

/**
 * OAuth Callback Endpoint
 *
 * Handles the callback from GitHub after user authentication.
 * Exchanges the temporary code for an access token, then stores user
 * metadata & the auth token as part of the 'props' on the token passed
 * down to the client.
 */
app.get('/callback', async (c) => {
	// Validate OAuth state with session binding
	let oauthReqInfo: AuthRequest;
	let clearSessionCookie: string;

	try {
		const result = await validateOAuthState(c.req.raw, c.env.OAUTH_KV);
		oauthReqInfo = result.oauthReqInfo;
		clearSessionCookie = result.clearCookie;
	} catch (error: unknown) {
		if (error instanceof OAuthError) {
			return error.toResponse();
		}
		return c.text('Internal server error', 500);
	}

	if (!oauthReqInfo.clientId) {
		return c.text('Invalid OAuth request data', 400);
	}

	// Exchange the code for an access token
	const [accessToken, errResponse] = await fetchUpstreamAuthToken({
		client_id: c.env.GITHUB_CLIENT_ID,
		client_secret: c.env.GITHUB_CLIENT_SECRET,
		code: c.req.query('code'),
		redirect_uri: new URL('/callback', c.req.url).href,
		upstream_url: 'https://github.com/login/oauth/access_token',
	});
	if (errResponse) return errResponse;

	// Fetch the user info from GitHub
	const user = await new Octokit({ auth: accessToken }).rest.users.getAuthenticated();
	const { id: githubId, login, name, email } = user.data;

	// Validate the GitHub user has a lored account via service binding
	const loredResponse = await c.env.WEB_APP.fetch(
		new Request(`http://internal/api/internal/users/by-github/${githubId}`),
	);

	if (!loredResponse.ok) {
		return c.text(
			'You need a lored account to use this MCP server. Sign up at lored first, then try again.',
			403,
		);
	}

	const loredUser = (await loredResponse.json()) as LoredUser;

	// Fetch orgs+teams for this user via service binding
	const orgsResponse = await c.env.WEB_APP.fetch(
		new Request(`http://internal/api/internal/users/${loredUser.id}/organizations`),
	);
	const organizations = orgsResponse.ok ? await orgsResponse.json() : [];

	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: {
			label: name,
		},
		props: {
			accessToken,
			email,
			login,
			loredUserId: loredUser.id,
			name,
			organizations,
			username: loredUser.username,
		} as Props,
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: login,
	});

	// Clear the session binding cookie (one-time use)
	const responseHeaders = new Headers({ Location: redirectTo });
	if (clearSessionCookie) {
		responseHeaders.set('Set-Cookie', clearSessionCookie);
	}

	return new Response(null, {
		status: 302,
		headers: responseHeaders,
	});
});

export { app as GitHubHandler };
