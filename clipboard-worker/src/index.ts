import { DurableObject } from 'cloudflare:workers';

interface Env {
	DB: D1Database;
	CLIPBOARD_DO: DurableObjectNamespace;
}

type ClipboardItem = { id: number; value: string };

export class ClipboardDO extends DurableObject {
	state: DurableObjectState;
	env: Env;
	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.state = state;
		this.env = env;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const customerId = url.searchParams.get('customer_id') || 'default';

		// --- CORS handling start ---
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		// Handle preflight OPTIONS request
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: corsHeaders,
			});
		}
		// --- CORS handling end ---

		try {
			switch (request.method) {
				case 'PUT': {
					const data = await request.text();
					const parsedData = JSON.parse(data);
					await this.handleSync(parsedData.id, customerId, parsedData.clipboard_data);
					return new Response('Data synced successfully', { headers: corsHeaders });
				}
				case 'GET': {
					const result = await this.handleGet(customerId);
					return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
				}
				case 'DELETE': {
					const body = (await request.json()) as ClipboardItem;
					const id = body?.id;
					if (typeof id !== 'number') {
						return new Response('Missing or invalid id in JSON body', { status: 400, headers: corsHeaders });
					}
					await this.handleDel(id);
					return new Response('Data deleted successfully', { headers: corsHeaders });
				}
				default:
					return new Response('Method not allowed', { status: 405, headers: corsHeaders });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return new Response(`Error: ${message}`, { status: 500, headers: corsHeaders });
		}
	}

	private async handleSync(id: number, customer_id: string, clipboard_data: string): Promise<number> {
		// 1. Store in local DO storage

		// 2. Sync to central D1 (last-write-wins)

		const result = await this.env.DB.prepare(
			`INSERT OR REPLACE INTO CLIPBOARD (id, customer_id, clipboard_data) 
         VALUES (?1, ?2, ?3)`
		)
			.bind(id, customer_id, clipboard_data)
			.run();

		const insertId = result.meta?.last_row_id as number;

		await this.state.storage.put(String(insertId), { customer_id, clipboard_data });

		return id;
	}

	private async handleGet(customerId: string): Promise<{ id: number; clipboard_data: string }[]> {
		const rows = await this.env.DB.prepare(`SELECT id, clipboard_data FROM CLIPBOARD WHERE customer_id = ?1 ORDER BY id DESC`)
			.bind(customerId)
			.all();

		for (const row of rows.results) {
			await this.state.storage.put(String(row.id), { customerId, data: row.clipboard_data });
		}

		return rows.results as { id: number; clipboard_data: string }[];
	}

	private async handleDel(id: number): Promise<void> {
		await this.state.storage.delete(String(id));
		await this.env.DB.prepare(`DELETE FROM CLIPBOARD WHERE id = ?1`).bind(id).run();
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const customerId = url.searchParams.get('customer_id') || 'default';
		const doId = env.CLIPBOARD_DO.idFromName(customerId);
		const stub = env.CLIPBOARD_DO.get(doId);

		return stub.fetch(request);
	},
} satisfies ExportedHandler<Env>;
