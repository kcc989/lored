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

	private async ingestGoogleDocViaInternal(
		organizationId: string,
		brainId: string,
		documentUrl: string,
	) {
		const response = await this.env.WEB_APP.fetch(
			new Request('http://internal/api/internal/ingest/google-doc', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: this.props!.loredUserId,
					organizationId,
					brainId,
					documentUrl,
				}),
			}),
		);

		if (!response.ok) {
			const errorBody = (await response.json().catch(() => null)) as {
				error?: string;
				message?: string;
				connectUrl?: string;
			} | null;

			if (errorBody?.error === 'google_not_connected') {
				return {
					content: [
						{
							text: 'You need to connect your Google account first. Visit your Lored settings page to connect your Google account, then try again.',
							type: 'text' as const,
						},
					],
					isError: true,
				};
			}

			if (errorBody?.error === 'google_token_expired') {
				return {
					content: [
						{
							text: 'Your Google connection has expired. Please reconnect your Google account in settings, then try again.',
							type: 'text' as const,
						},
					],
					isError: true,
				};
			}

			if (errorBody?.error === 'google_access_denied') {
				return {
					content: [
						{
							text: 'Your Google account cannot access this document. Make sure the document is shared with your Google account.',
							type: 'text' as const,
						},
					],
					isError: true,
				};
			}

			if (errorBody?.error === 'google_doc_not_found') {
				return {
					content: [
						{
							text: 'Document not found. Check that the URL is correct and the document hasn\'t been deleted.',
							type: 'text' as const,
						},
					],
					isError: true,
				};
			}

			if (errorBody?.error === 'google_doc_too_large') {
				return {
					content: [
						{
							text: errorBody.message ?? 'Document exceeds the size limit for ingestion.',
							type: 'text' as const,
						},
					],
					isError: true,
				};
			}

			const errorText = errorBody?.message ?? `HTTP ${response.status}`;
			return {
				content: [{ text: `Google Doc ingestion failed: ${errorText}`, type: 'text' as const }],
				isError: true,
			};
		}

		const result = await response.json();
		return {
			content: [{ text: JSON.stringify(result), type: 'text' as const }],
		};
	}

	private async ingestLinearViaInternal(
		organizationId: string,
		brainId: string,
		resourceUrl: string,
	) {
		const response = await this.env.WEB_APP.fetch(
			new Request('http://internal/api/internal/ingest/linear', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: this.props!.loredUserId,
					organizationId,
					brainId,
					resourceUrl,
				}),
			}),
		);

		if (!response.ok) {
			const errorBody = (await response.json().catch(() => null)) as {
				error?: string;
				message?: string;
				connectUrl?: string;
			} | null;

			if (errorBody?.error === 'linear_not_connected') {
				return {
					content: [
						{
							text: 'You need to connect your Linear account first. Visit your Lored settings page to connect your Linear account, then try again.',
							type: 'text' as const,
						},
					],
					isError: true,
				};
			}

			if (errorBody?.error === 'linear_token_expired') {
				return {
					content: [
						{
							text: 'Your Linear connection has expired. Please reconnect your Linear account in settings, then try again.',
							type: 'text' as const,
						},
					],
					isError: true,
				};
			}

			if (errorBody?.error === 'linear_access_denied') {
				return {
					content: [
						{
							text: 'Your Linear account cannot access this resource. Make sure you have access in Linear.',
							type: 'text' as const,
						},
					],
					isError: true,
				};
			}

			if (errorBody?.error === 'linear_not_found') {
				return {
					content: [
						{
							text: 'Linear resource not found. Check that the URL is correct.',
							type: 'text' as const,
						},
					],
					isError: true,
				};
			}

			const errorText = errorBody?.message ?? `HTTP ${response.status}`;
			return {
				content: [{ text: `Linear ingestion failed: ${errorText}`, type: 'text' as const }],
				isError: true,
			};
		}

		const result = await response.json();
		return {
			content: [{ text: JSON.stringify(result), type: 'text' as const }],
		};
	}

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

		this.server.tool(
			'ingest',
			'Submit text, a Google Doc URL, or a Linear issue/project URL to a brain for fact extraction. The system will analyze the content, extract structured facts, identify topics, detect duplicates, and generate questions for knowledge gaps. Google Doc and Linear URLs are automatically detected and fetched.',
			{
				organizationId: z.string().describe('The organization ID the brain belongs to'),
				brainId: z.string().describe('The brain ID to ingest text into'),
				text: z
					.string()
					.min(1)
					.describe(
						'The raw text content to extract facts from, or a Google Docs / Linear URL to fetch and ingest',
					),
				title: z.string().optional().describe('Optional title describing the source of this text'),
			},
			async ({ organizationId, brainId, text, title }) => {
				const org = this.props?.organizations?.find((o) => o.id === organizationId);
				if (!org) {
					return {
						content: [
							{ text: 'Organization not found or you do not have access', type: 'text' as const },
						],
						isError: true,
					};
				}

				// Auto-detect Google Doc URLs
				const googleDocPattern =
					/https?:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]+/;
				if (googleDocPattern.test(text)) {
					return this.ingestGoogleDocViaInternal(organizationId, brainId, text);
				}

				// Auto-detect Linear URLs
				const linearPattern = /https?:\/\/linear\.app\/[^/]+\/(issue|project)\/[^\s]+/;
				if (linearPattern.test(text)) {
					return this.ingestLinearViaInternal(organizationId, brainId, text.trim());
				}

				const response = await this.env.WEB_APP.fetch(
					new Request('http://internal/api/internal/ingest/text', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							userId: this.props!.loredUserId,
							organizationId,
							brainId,
							text,
							title,
						}),
					}),
				);

				if (!response.ok) {
					const errorText = await response.text();
					return {
						content: [{ text: `Ingestion failed: ${errorText}`, type: 'text' as const }],
						isError: true,
					};
				}

				const result = await response.json();
				return {
					content: [{ text: JSON.stringify(result), type: 'text' as const }],
				};
			},
		);

		this.server.tool(
			'ingest-google-doc',
			'Ingest a Google Doc into a brain for fact extraction. Fetches the document content using the authenticated user\'s Google connection, then extracts facts, topics, and questions. Requires the user to have connected their Google account.',
			{
				organizationId: z.string().describe('The organization ID the brain belongs to'),
				brainId: z.string().describe('The brain ID to ingest the document into'),
				documentUrl: z
					.string()
					.min(1)
					.describe('The Google Docs URL (e.g. https://docs.google.com/document/d/...)'),
			},
			async ({ organizationId, brainId, documentUrl }) => {
				const org = this.props?.organizations?.find((o) => o.id === organizationId);
				if (!org) {
					return {
						content: [
							{ text: 'Organization not found or you do not have access', type: 'text' as const },
						],
						isError: true,
					};
				}

				return this.ingestGoogleDocViaInternal(organizationId, brainId, documentUrl);
			},
		);

		this.server.tool(
			'ingest-linear',
			'Ingest a Linear issue or project into a brain for fact extraction. Fetches the content using the authenticated user\'s Linear connection, then extracts facts, topics, and questions. Requires the user to have connected their Linear account.',
			{
				organizationId: z.string().describe('The organization ID the brain belongs to'),
				brainId: z.string().describe('The brain ID to ingest the Linear resource into'),
				resourceUrl: z
					.string()
					.min(1)
					.describe(
						'The Linear URL (e.g. https://linear.app/acme/issue/ACM-123 or https://linear.app/acme/project/my-project)',
					),
			},
			async ({ organizationId, brainId, resourceUrl }) => {
				const org = this.props?.organizations?.find((o) => o.id === organizationId);
				if (!org) {
					return {
						content: [
							{ text: 'Organization not found or you do not have access', type: 'text' as const },
						],
						isError: true,
					};
				}

				return this.ingestLinearViaInternal(organizationId, brainId, resourceUrl);
			},
		);

		this.server.tool(
			'list-topics',
			'List topics within a brain with their coverage scores. Topics represent knowledge areas that facts are organized under.',
			{
				organizationId: z.string().describe('The organization ID the brain belongs to'),
				brainId: z.string().describe('The brain ID to list topics for'),
			},
			async ({ organizationId, brainId }) => {
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
					new Request('http://internal/api/internal/topics', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							userId: this.props!.loredUserId,
							organizationId,
							brainId,
						}),
					}),
				);

				if (!response.ok) {
					const errorText = await response.text();
					return {
						content: [{ text: `Failed to list topics: ${errorText}`, type: 'text' as const }],
						isError: true,
					};
				}

				const topics = await response.json();
				return {
					content: [{ text: JSON.stringify(topics), type: 'text' as const }],
				};
			},
		);

		this.server.tool(
			'list-questions',
			'List open questions needing answers within a brain. Questions are generated during ingestion to identify knowledge gaps.',
			{
				organizationId: z.string().describe('The organization ID the brain belongs to'),
				brainId: z.string().describe('The brain ID to list questions for'),
				topicId: z.string().optional().describe('Filter questions to a specific topic'),
				status: z
					.enum(['open', 'answered', 'dismissed'])
					.optional()
					.describe('Filter by question status (default: all)'),
			},
			async ({ organizationId, brainId, topicId, status }) => {
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
					new Request('http://internal/api/internal/questions', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							userId: this.props!.loredUserId,
							organizationId,
							brainId,
							topicId,
							status,
						}),
					}),
				);

				if (!response.ok) {
					const errorText = await response.text();
					return {
						content: [{ text: `Failed to list questions: ${errorText}`, type: 'text' as const }],
						isError: true,
					};
				}

				const questions = await response.json();
				return {
					content: [{ text: JSON.stringify(questions), type: 'text' as const }],
				};
			},
		);

		this.server.tool(
			'answer-question',
			'Answer a knowledge gap question. Optionally creates a new fact from the answer and ingests it into the brain.',
			{
				organizationId: z.string().describe('The organization ID the brain belongs to'),
				brainId: z.string().describe('The brain ID the question belongs to'),
				questionId: z.string().describe('The question ID to answer'),
				answer: z.string().min(1).describe('The answer to the question'),
				createFact: z
					.boolean()
					.optional()
					.describe('Whether to create a fact from the answer (default: true)'),
			},
			async ({ organizationId, brainId, questionId, answer, createFact }) => {
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
					new Request('http://internal/api/internal/questions/answer', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							userId: this.props!.loredUserId,
							organizationId,
							brainId,
							questionId,
							answer,
							createFact,
						}),
					}),
				);

				if (!response.ok) {
					const errorText = await response.text();
					return {
						content: [{ text: `Failed to answer question: ${errorText}`, type: 'text' as const }],
						isError: true,
					};
				}

				const result = await response.json();
				return {
					content: [{ text: JSON.stringify(result), type: 'text' as const }],
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
