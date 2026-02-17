import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { z } from 'zod';

import { GitHubHandler } from './github-handler';
import type { Props } from './utils';

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: 'Lored MCP Server',
		version: '1.0.0',
	});

	async init() {
		this.server.tool(
			'add',
			'Add two numbers together',
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ text: String(a + b), type: 'text' }],
			}),
		);

		this.server.tool('whoami', 'Get authenticated user info', {}, async () => ({
			content: [
				{
					text: JSON.stringify({
						loredUserId: this.props?.loredUserId,
						login: this.props?.login,
						name: this.props?.name,
						email: this.props?.email,
						username: this.props?.username,
						organizations: this.props?.organizations,
					}),
					type: 'text',
				},
			],
		}));

		this.server.tool(
			'list-organizations',
			'List your organizations and their teams',
			{},
			async () => ({
				content: [
					{
						text: JSON.stringify(this.props?.organizations ?? []),
						type: 'text',
					},
				],
			}),
		);

		this.server.tool(
			'list-teams',
			'List teams for a specific organization',
			{ organizationId: z.string().describe('The organization ID to list teams for') },
			async ({ organizationId }) => {
				const org = this.props?.organizations?.find((o) => o.id === organizationId);
				if (!org) {
					return {
						content: [{ text: 'Organization not found', type: 'text' as const }],
						isError: true,
					};
				}
				return {
					content: [{ text: JSON.stringify(org.teams), type: 'text' as const }],
				};
			},
		);
	}
}

export default new OAuthProvider({
	apiHandler: MyMCP.serve('/mcp'),
	apiRoute: '/mcp',
	authorizeEndpoint: '/authorize',
	clientRegistrationEndpoint: '/register',
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	defaultHandler: GitHubHandler as any,
	tokenEndpoint: '/token',
});
