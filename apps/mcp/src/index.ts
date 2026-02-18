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

		this.server.tool(
			'query',
			'Search facts within a knowledge brain. Returns relevant facts ranked by relevance using hybrid semantic + keyword search.',
			{
				organizationId: z.string().describe('The organization ID the brain belongs to'),
				brainId: z.string().describe('The brain ID to search within'),
				queries: z
					.array(z.string().min(1))
					.min(1)
					.describe(
						'Search queries to find relevant facts. Use multiple queries to capture different aspects of what you are looking for.',
					),
				type: z
					.enum(['general', 'policy', 'procedure', 'definition', 'decision', 'insight'])
					.optional()
					.describe('Filter results to a specific fact type'),
				status: z.string().optional().describe('Filter results by status (e.g. active, archived)'),
				minTrustScore: z
					.number()
					.min(0)
					.max(1)
					.optional()
					.describe('Minimum trust score (0-1) to filter results'),
				limit: z
					.number()
					.int()
					.min(1)
					.max(100)
					.optional()
					.describe('Maximum number of results to return (default 20)'),
			},
			async ({ organizationId, brainId, queries, type, status, minTrustScore, limit }) => {
				const org = this.props?.organizations?.find((o) => o.id === organizationId);
				if (!org) {
					return {
						content: [
							{ text: 'Organization not found or you do not have access', type: 'text' as const },
						],
						isError: true,
					};
				}

				const response = await this.env.WEB_APP.fetch(
					new Request('http://internal/api/internal/search/facts', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							userId: this.props!.loredUserId,
							organizationId,
							brainId,
							queries,
							type,
							status,
							minTrustScore,
							limit,
						}),
					}),
				);

				if (!response.ok) {
					const errorText = await response.text();
					return {
						content: [{ text: `Search failed: ${errorText}`, type: 'text' as const }],
						isError: true,
					};
				}

				const results = await response.json();
				return {
					content: [{ text: JSON.stringify(results), type: 'text' as const }],
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
